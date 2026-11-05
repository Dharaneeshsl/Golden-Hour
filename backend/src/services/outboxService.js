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
    const items = await this.store.getPendingOutboxItems(10);
    const results = [];

    for (const item of items) {
      try {
        if (item.topic === "SMS_NOTIFICATION" && notificationService) {
          const receipts = await notificationService.sendEmergencyAlert(item.payload);
          if (!Array.isArray(receipts) || !receipts.length || receipts.some(r => r.status !== "DELIVERED")) {
            throw new Error("SMS delivery is unconfirmed");
          }
        } else if (item.topic === "BLOCKCHAIN_ANCHOR" && chain && chain.enabled) {
          // Anchors Merkle root or hash commitment on chain
          await chain.anchorRoot(item.payload.rootHash);
        } else {
          throw new Error("No active handler for outbox topic");
        }
        await this.store.markOutboxItemCompleted(item.id);
        results.push({ id: item.id, status: "sent" });
      } catch (err) {
        await this.store.markOutboxItemFailed(item.id, err.message);
        results.push({ id: item.id, status: "failed", error: err.message });
      }
    }
    return results;
  }
}

module.exports = { OutboxService };
