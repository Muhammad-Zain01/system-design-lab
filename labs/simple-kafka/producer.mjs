// A small teaching hash, not Kafka's actual partitioning algorithm.
export function hashKey(key) {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export class Producer {
  constructor(partition0, partition1) {
    this.partition0 = partition0;
    this.partition1 = partition1;
  }

  send(key, value) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Use a non-empty string key, such as user-101.');
    }

    const hash = hashKey(key);
    const partitionId = hash % 2; // We have exactly two partitions.
    const partition = partitionId === 0 ? this.partition0 : this.partition1;
    const offset = partition.produce(value, key);

    return { key, hash, partition: partitionId, offset };
  }
}
