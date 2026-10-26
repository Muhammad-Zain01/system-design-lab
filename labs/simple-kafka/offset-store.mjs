import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class OffsetStore {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) writeFileSync(filePath, '{}\n');
  }

  load(groupId, topic, partitionId) {
    const offsets = JSON.parse(readFileSync(this.filePath, 'utf8'));
    return offsets[groupId]?.[topic]?.[partitionId] ?? 0;
  }

  save(groupId, topic, partitionId, nextOffset) {
    // Read the latest file so saving one partition preserves the others.
    const offsets = JSON.parse(readFileSync(this.filePath, 'utf8'));
    offsets[groupId] ??= {};
    offsets[groupId][topic] ??= {};
    offsets[groupId][topic][partitionId] = nextOffset;

    // Replace the file only after the new JSON has been fully written.
    const temporaryPath = this.filePath + '.tmp';
    writeFileSync(temporaryPath, JSON.stringify(offsets, null, 2) + '\n');
    renameSync(temporaryPath, this.filePath);
  }
}
