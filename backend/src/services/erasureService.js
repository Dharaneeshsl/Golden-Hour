const crypto = require("crypto");
const {AuditChainService} = require("./auditChainService");

async function assertErasureLedgerApplied(store, ledger) {
  let cursor = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = (await ledger.query("SELECT id FROM erasure_ledger WHERE id>$1 ORDER BY id LIMIT 500",[cursor])).rows;
    if (!rows.length) return;
    const applied = await store.query("SELECT id FROM erasure_receipts WHERE id=ANY($1::uuid[])",[rows.map(row=>row.id)]);
    if (applied.rowCount!==rows.length) throw new Error("Erasure ledger replay required before serving traffic");
    cursor = rows.at(-1).id;
  }
}

async function applyReceipt(tx, receipt) {
  const patient = (await tx.query("SELECT wallet FROM patients WHERE id=$1 FOR UPDATE",[receipt.patient_id])).rows[0];
  if (patient) {
    await tx.query("UPDATE sessions SET revoked_at=now() WHERE wallet=$1",[patient.wallet]);
    await tx.query("DELETE FROM encrypted_objects WHERE id::text IN (SELECT ipfs_cid FROM records WHERE patient_id=$1)",[receipt.patient_id]);
    await tx.query("UPDATE key_registry SET encrypted_dek='[CRYPTO_SHREDDED_PERMANENTLY_DESTROYED]',status='shredded',rotated_at=now() WHERE patient_id=$1",[receipt.patient_id]);
    await tx.query("UPDATE data_subject_requests SET details='Clinical data erased under hospital policy',status='completed',resolution_notes=NULL,resolved_at=now() WHERE patient_id=$1",[receipt.patient_id]);
    await tx.query("DELETE FROM patients WHERE id=$1",[receipt.patient_id]);
  }
  await tx.query("INSERT INTO erasure_receipts(id,patient_id) VALUES ($1,$2) ON CONFLICT(id) DO NOTHING",[receipt.id,receipt.patient_id]);
}

async function erasePatient(store, ledger, {requestId,retentionDays,approvalReference}) {
  if (!Number.isInteger(retentionDays) || retentionDays<0 || retentionDays>36500 ||
      typeof approvalReference!=="string" || approvalReference.length<10) {
    throw new Error("Hospital retention policy and an approval reference are required");
  }
  return store.transaction(async tx => {
    const request = (await tx.query("SELECT patient_id FROM data_subject_requests WHERE id=$1 AND request_type='erasure' AND status IN ('submitted','in_review') FOR UPDATE",[requestId])).rows[0];
    if (!request) throw new Error("Pending patient erasure request required");
    const patient = (await tx.query("SELECT * FROM patients WHERE id=$1 FOR UPDATE",[request.patient_id])).rows[0];
    if (!patient) throw new Error("Patient unavailable");
    const held = await tx.query("SELECT patient_id FROM patient_data_holds WHERE patient_id=$1 AND active",[patient.id]);
    if (held.rowCount) throw new Error("Active hospital retention hold");
    const recent = await tx.query(
      `SELECT 1 FROM patients p WHERE id=$1 AND
        greatest(p.created_at,coalesce(p.summary_updated_at,p.created_at),
          coalesce((SELECT max(created_at) FROM records WHERE patient_id=p.id),p.created_at))
          > now()-$2*interval '1 day'`,[patient.id,retentionDays]);
    if (recent.rowCount) throw new Error("Hospital retention period has not elapsed");
    const receipt = {
      id:crypto.randomUUID(), patient_id:patient.id,
      approval_hash:crypto.createHash("sha256").update(approvalReference).digest("hex")
    };
    // Commit intent to the independent ledger before deletion. A failed local transaction
    // then blocks API traffic until an operator replays the authoritative receipt.
    await ledger.query(
      "INSERT INTO erasure_ledger(id,patient_id,approval_reference_hash) VALUES ($1,$2,$3) ON CONFLICT(patient_id) DO NOTHING",
      [receipt.id,receipt.patient_id,receipt.approval_hash]);
    const recorded = (await ledger.query("SELECT id,patient_id FROM erasure_ledger WHERE patient_id=$1",[receipt.patient_id])).rows[0];
    await new AuditChainService(tx).appendAuditEvent({patientId:patient.id,actor:"hospital-erasure-operator",action:"PATIENT_CLINICAL_ERASURE_AUTHORIZED",details:{receiptId:recorded.id,approvalReferenceHash:receipt.approval_hash}});
    await applyReceipt(tx,recorded);
    return {receiptId:recorded.id};
  });
}

async function replayLedger(store,ledger) {
  let cursor = "00000000-0000-0000-0000-000000000000";
  let count = 0;
  for (;;) {
    const rows = (await ledger.query("SELECT id,patient_id FROM erasure_ledger WHERE id>$1 ORDER BY id LIMIT 100",[cursor])).rows;
    if (!rows.length) return count;
    for (const row of rows) {
      await store.transaction(tx => applyReceipt(tx,row));
      count++;
    }
    cursor = rows.at(-1).id;
  }
}
module.exports={assertErasureLedgerApplied,erasePatient,replayLedger};
