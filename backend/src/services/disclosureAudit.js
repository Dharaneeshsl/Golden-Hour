const crypto = require("crypto");

async function auditDisclosure(store, auditChain, event) {
  if (!auditChain?.appendAuditEvent) throw new Error("Clinical read auditing is unavailable");
  const append = async tx => {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    await tx.addAudit({id,timestamp,...event});
    await auditChain.appendAuditEvent({
      id,timestamp,patientId:event.patientId,actor:event.actor,action:event.action,
      details:event.metadata || {}
    });
  };
  return store.transaction ? store.transaction(append) : append(store);
}
module.exports={auditDisclosure};
