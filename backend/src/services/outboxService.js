const crypto = require("crypto");

/**
 * Transactional Outbox Service & Reconciliation Worker (B13)
 * Guarantees that asynchronous tasks (blockchain anchoring, SMS alerts)
 * are committed transactionally with state changes and delivered with retry/backoff.
 */
class OutboxService {
  constructor(store) {
    this.store = store;
  }

  async enqueue(topic, payload) {
    if (!this.store || !this.store.addOutboxItem) return null;
    return await this.store.addOutboxItem({
      id: crypto.randomUUID(),
      topic,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  async processPending({ chain, notificationService } = {}) {
    if (!this.store || !this.store.getPendingOutboxItems) return [];
    const items = this.store.claimOutboxItems ? await this.store.claimOutboxItems(3) : await this.store.getPendingOutboxItems(3);
    const results = [];

    for (const item of items) {
      try {
        if (item.topic === "SMS_NOTIFICATION" && notificationService) {
          const receipts = await notificationService.sendEmergencyAlert({...item.payload,idempotencyKey:item.id});
          if (!Array.isArray(receipts) || !receipts.length || receipts.some(r => r.status !== "DELIVERED")) {
            throw new Error("SMS delivery is unconfirmed");
          }
        } else if (item.topic === "BLOCKCHAIN_ANCHOR" && chain && chain.enabled) {
          // Anchors Merkle root or hash commitment on chain
          await chain.anchorRoot(item.payload.rootHash,{idempotencyKey:item.id});
        } else {
          throw new Error("No active handler for outbox topic");
        }
        const completed = await this.store.markOutboxItemCompleted(item.id,item.lease_token);
        if (!completed) throw new Error("Job lease lost");
        results.push({ id: item.id, status: "sent" });
      } catch (err) {
        await this.store.markOutboxItemFailed(item.id, err.message,item.lease_token);
        results.push({ id: item.id, status: "failed", error: "Delivery unconfirmed" });
      }
    }
    return results;
  }
}

module.exports = { OutboxService };
