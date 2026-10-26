import { fileURLToPath } from 'node:url';
import { Kafka } from './kafka.mjs';
import { Producer } from './producer.mjs';

// One topic called "orders", with two partitions (two independent files).
const path0 = fileURLToPath(new URL('./data/orders-0.jsonl', import.meta.url));
const partition0 = new Kafka(path0);
partition0.init();

const path1 = fileURLToPath(new URL('./data/orders-1.jsonl', import.meta.url));
const partition1 = new Kafka(path1);
partition1.init();

const producer = new Producer(partition0, partition1);

// Interleave users: the producer routes each event using its user ID.
console.log('Created:', producer.send('user-101', { action: 'order-created' }));
console.log('Created:', producer.send('user-102', { action: 'order-created' }));
console.log('Paid:', producer.send('user-101', { action: 'order-paid' }));
console.log('Paid:', producer.send('user-102', { action: 'order-paid' }));
console.log('Shipped:', producer.send('user-101', { action: 'order-shipped' }));
