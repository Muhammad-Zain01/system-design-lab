export class Consumer {
  constructor(partition, name, { groupId, topic, partitionId, offsetStore }) {
    this.name = name;
    this.partition = partition;
    this.groupId = groupId;
    this.topic = topic;
    this.partitionId = partitionId;
    this.offsetStore = offsetStore;
    this.nextOffset = offsetStore.load(groupId, topic, partitionId);
  }

  poll() {
    const records = this.partition.read(this.nextOffset);

    if (records.length > 0) {
      this.nextOffset = records[records.length - 1].offset + 1;
    }

    return records;
  }

  commit() {
    this.offsetStore.save(this.groupId, this.topic, this.partitionId, this.nextOffset);
  }
}
