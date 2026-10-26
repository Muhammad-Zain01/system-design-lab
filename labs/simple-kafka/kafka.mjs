import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class Kafka {
  constructor(filePath) {
    this.filePath = filePath;
    this.nextOffset = 0;
  }

  init() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, ''); // Create the file without clearing it.

    const contents = readFileSync(this.filePath, 'utf8').trim();
    if (contents === '') {
      this.nextOffset = 0;
      return;
    }

    const records = contents.split('\n').map(line => JSON.parse(line));
    this.nextOffset = records[records.length - 1].offset + 1;
  }

  produce(value, key) {
    if (JSON.stringify(value) === undefined) {
      throw new TypeError('Message must be JSON-serializable.');
    }

    const record = { offset: this.nextOffset, key, value };
    appendFileSync(this.filePath, JSON.stringify(record) + '\n');
    this.nextOffset += 1; // Advance only after the append succeeds.
    return record.offset;
  }

  read(offset = 0) {
    const contents = readFileSync(this.filePath, 'utf8').trim();
    if (contents === '') return [];

    return contents.split('\n')
      .map(line => JSON.parse(line))
      .filter(record => record.offset >= offset);
  }
}
