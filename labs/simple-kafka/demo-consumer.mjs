import { fileURLToPath } from 'node:url';
import { Kafka } from './kafka.mjs';
import { Consumer } from './consumer.mjs';
import { OffsetStore } from './offset-store.mjs';

const path0 = fileURLToPath(new URL('./data/orders-0.jsonl', import.meta.url));
const partition0 = new Kafka(path0);
partition0.init();

const path1 = fileURLToPath(new URL('./data/orders-1.jsonl', import.meta.url));
const partition1 = new Kafka(path1);
partition1.init();

const offsetsPath = fileURLToPath(new URL('./data/consumer-offsets.json', import.meta.url));
const offsetStore = new OffsetStore(offsetsPath);

const consumer0 = new Consumer(partition0, 'orders-reader-0', {
  groupId: 'orders-service', topic: 'orders', partitionId: 0, offsetStore
});
const consumer1 = new Consumer(partition1, 'orders-reader-1', {
  groupId: 'orders-service', topic: 'orders', partitionId: 1, offsetStore
});
console.log(`${consumer0.name} starting at offset ${consumer0.nextOffset}`);
console.log(`${consumer1.name} starting at offset ${consumer1.nextOffset}`);
console.log('Polling every second. Ctrl+C to stop.');

function poll() {
  const records0 = consumer0.poll();
  const records1 = consumer1.poll();

  if (records0.length > 0) {
    console.log(consumer0.name, records0); // Printing is our processing step.
    consumer0.commit();
  }
  if (records1.length > 0) {
    console.log(consumer1.name, records1);
    consumer1.commit();
  }
}

poll();
setInterval(poll, 1000);
