# Simple Kafka

A deliberately small Kafka-inspired model for understanding the path from an
event to a partition log and then to a consumer. It uses local files and direct
method calls so the decisions remain visible. This is a completed intuition
exercise, not a Kafka-compatible broker.

Run from `labs/simple-kafka` with Node.js; no packages are required.
`demo.mjs` only produces events, then exits:

```sh
node demo.mjs
```

## Start the consumers

Run the demo above to create some events, then start the consumers:

```sh
node start-consumer.mjs
```

The script explicitly creates `partition0` and `partition1`, then creates
`consumer0` named `orders-reader-0` and `consumer1` named `orders-reader-1`.
There are no command-line arguments or partition setup loops.
The script immediately reads existing events and then polls every second for
new events. Press Ctrl+C to stop it. You can run the demo in another terminal
to append more events while the consumer is running.

The consumer name is only a label. Progress belongs to the group `orders-service`,
topic `orders`, and partition ID. The script commits after printing each batch
and resumes from the saved position on restart. This script reads the shared file directly;
communication with a broker over a network is not implemented.

## The pieces

- **Producer:** `Producer.send(key, value)` hashes the key, chooses a partition,
  and calls that partition's `produce(value, key)` method.
- **Topic:** a named collection of partitions. Our demo uses `orders`.
- **Partition:** an independent ordered log stored in one JSONL file.
- **Consumer:** code that reads a partition and tracks where to read next.

We reuse the original `Kafka` class for each partition. Each instance manages
one file; the demo creates explicit variables called `partition0` and
`partition1`, with no setup loop. There is no topic manager yet.

```text
demo.mjs → orders partition 0 → consumer0 (orders-reader-0)
         → orders partition 1 → consumer1 (orders-reader-1)
```

## Key-based partitioning

The application chooses the record key: we use a string user ID. The producer
derives the partition ID from that key; a key and a partition ID are different things.

```js
producer.send('user-101', { action: 'order-created' });
producer.send('user-102', { action: 'order-created' });
producer.send('user-101', { action: 'order-paid' });
```

The routing rule is `partitionId = hashKey(key) % 2`. The remainder is either
0 or 1. `hashKey()` builds a repeatable number from the string characters;
`>>> 0` keeps it an unsigned 32-bit integer. This small teaching hash is not
Kafka's actual partitioning algorithm and is not a production partitioner.

```text
user-101 → hash 4027269360 → remainder 0 → partition0
user-102 → hash 4027269361 → remainder 1 → partition1
```

All user-101 events go to partition 0 with our fixed hash and two partitions.
The partition assigns the offset, not the producer. Different keys can share a
partition: user-103 also goes to partition 0. A key does not create a new file.
Routing is deterministic, but this does not guarantee equal traffic: one very
active user can overload its partition. Changing the partition count or hash
function can move a key to another partition.

On a fresh run, the files begin like this:

`data/orders-0.jsonl`:

```jsonl
{"offset":0,"key":"user-101","value":{"action":"order-created"}}
{"offset":1,"key":"user-101","value":{"action":"order-paid"}}
{"offset":2,"key":"user-101","value":{"action":"order-shipped"}}
```

`data/orders-1.jsonl`:

```jsonl
{"offset":0,"key":"user-102","value":{"action":"order-created"}}
{"offset":1,"key":"user-102","value":{"action":"order-paid"}}
```

Offsets belong to a partition: both files can contain offset 0. To identify a
record, use the topic, partition number, and offset. Events have an order within
each partition; the demo does not define an order across partitions.

## Follow the demo

1. Run `demo.mjs` to initialize two partition files and produce five keyed events.
2. Run `start-consumer.mjs` to read both partitions and keep polling.
3. Run `demo.mjs` again in another terminal to append more events.
4. The running consumers print the new records from their respective partitions.
5. Stop and restart the script: it resumes after the committed events.

Run the demo again and it appends more events to the existing files. A group
without saved progress starts at offset 0. An existing group resumes its progress.

## Consumer reads

The producer hashes the key to choose where to write. Consumers do not hash
keys: they read their assigned partition from their next offset and receive
records for every key in that partition. Our consumer assignments are explicit;
automatic assignment through consumer groups is a later step.

## Short recording walkthrough

1. Open `demo.mjs`: point out the two explicit partitions and interleaved user events.
2. Open `producer.mjs`: follow key → hash → remainder → chosen partition.
3. Start `start-consumer.mjs` in one terminal, then run `demo.mjs` in another.
4. Compare the printed routes: user-101 always selects partition 0, user-102 partition 1.
5. Open both JSONL files: show that each record retains its key and that each
   partition has its own offsets. Existing logs keep their earlier events.
6. Explain: the partition preserves append order. Sharing a key puts events in
   the same log; it does not sort them by time or resolve concurrent send order.

Try predicting where user-103 goes before adding a send call. It shares
partition 0 with user-101, illustrating that keys and partitions are not one-to-one.

## Where offsets live

The log stores each record's offset on disk. `Kafka.nextOffset` is the next
offset to assign; `init()` restores it from the last stored record.

Each consumer has a `nextOffset` in memory. `poll()` advances it when returning
records; `commit()` separately persists it to `data/consumer-offsets.json`:

```json
{
  "orders-service": {
    "orders": {
      "0": 3,
      "1": 2
    }
  }
}
```

This means group `orders-service` resumes topic `orders` at offset 3 in partition
0 and offset 2 in partition 1. These are the next offsets to read. A new consumer
name in the same group and assigned partition loads the same saved progress.
Another group gets independent progress. Assignments are still manual; there
is no group coordinator or rebalancing.

The demo uses printing as its processing step, followed by an explicit commit.
Process every record returned by a poll before committing that batch.
If processing finishes but the process stops before commit, restarting replays
the uncommitted batch. Committing before processing can skip work on restart.
`poll()` itself does not write the offsets file.

To observe replay, temporarily comment out a `commit()` call, produce new events,
read them, then restart. To replay everything intentionally, stop the consumers
and delete only `data/consumer-offsets.json`; leave the partition files in place.

`OffsetStore` writes a temporary file and renames it to avoid replacing valid
JSON with a partial write. It has no cross-process locking or explicit disk flush:
run only one consumer runner writing this offsets file for this exercise.

## Files

| File | Responsibility |
| --- | --- |
| `kafka.mjs` | Manage one partition file, assign offsets, and read records. |
| `producer.mjs` | Hash a string key and select partition 0 or 1. |
| `consumer.mjs` | Track a reading position and explicitly commit progress. |
| `offset-store.mjs` | Load and save progress by group, topic, and partition. |
| `demo.mjs` | Produce five user-keyed events and exit. |
| `start-consumer.mjs` | Poll both partitions with explicitly named consumers. |
| `data/` | Generated JSONL logs and committed offsets; ignored by Git. |

## What this demonstrates

- Appending preserves existing records; consuming does not delete them.
- Keys route events; offsets describe positions within a partition.
- Different keys can share a partition, which has one append order.
- Consumer positions advance in memory; commits preserve progress on disk.
- A replacement reader in the same group resumes committed progress.
- An interruption before commit can cause records to be processed again.

## Small on purpose

`producer.mjs` routes keyed events; `kafka.mjs` handles storage;
`offset-store.mjs` saves group/topic/partition progress;
`consumer.mjs` tracks a read position and commits it; `demo.mjs`
produces events; `start-consumer.mjs` runs two named consumers and prints events.
Call `init()` before using a partition. Values must be
JSON-serializable. The original single-file API still works.

This version uses synchronous I/O and reads the whole file on each read. Use one
Kafka instance per file, in one process. Malformed JSON fails parsing. A successful
append is not an explicit disk flush. Networking, separate broker processes, replication, automatic consumer-group
assignment, and crash-safe log recovery are outside this exercise. The group ID
currently scopes saved progress; it does not coordinate competing consumers.
