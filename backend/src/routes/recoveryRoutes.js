const {validatedRouter} = require("../utils/validatedRouter");
const {validPhone,subjectId} = require("../services/phoneAuthService");
const express = require("express");
const crypto = require("crypto");
const {ethers} = require("ethers");
const {requireAuth} = require("../middleware/authMiddleware");
const {getAdminWallets} = require("../config/authConfig");
const encryption = require("../services/encryptionService");
const {AuditChainService} = require("../services/auditChainService");
const {asyncHandler} = require("../utils/asyncHandler");

module.exports = ({store}) => {
  const router = validatedRouter();
  router.use(requireAuth);
  router.post("/",asyncHandler(async (req,res) => {
    const {oldWallet,oldPhone,proofReference} = req.body || {};
    if ((!ethers.isAddress(oldWallet) && !subjectId(oldWallet) && !validPhone(oldPhone)) || typeof proofReference !== "string" || proofReference.length<10 || proofReference.length>500) {
      return res.status(400).json({error:"Provide the previous wallet and a hospital identity-verification case reference"});
    }
    let previous=subjectId(oldWallet) ? oldWallet : ethers.isAddress(oldWallet) ? ethers.getAddress(oldWallet) : null;
    if (oldPhone) {
      const identity=(await store.query("SELECT user_id FROM identities WHERE provider_type='phone_otp' AND identifier=$1",[oldPhone])).rows[0];
      previous="user:"+(identity?.user_id || crypto.randomUUID());
    }
    if (previous === req.user.wallet || getAdminWallets().includes(previous) || await store.patientByWallet(req.user.wallet) || await store.providerByWallet(req.user.wallet)) {
      return res.status(409).json({error:"Use a new patient wallet. Administrator and staff accounts require the hospital's account process."});
    }
    const id = crypto.randomUUID();
    await store.query("INSERT INTO patient_recovery_requests(id,old_wallet,new_wallet,encrypted_reference) VALUES ($1,$2,$3,$4)",
      [id,previous,req.user.wallet,encryption.encryptJson({reference:proofReference})]);
    res.status(202).json({id,status:"requested"});
  }));
  router.get("/mine",asyncHandler(async (req,res) => {
    res.json((await store.query("SELECT id,status,created_at,expires_at FROM patient_recovery_requests WHERE new_wallet=$1 ORDER BY created_at DESC LIMIT 20",[req.user.wallet])).rows);
  }));
  router.get("/",asyncHandler(async (req,res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    const rows = (await store.query("SELECT * FROM patient_recovery_requests WHERE status='requested' AND expires_at>now() ORDER BY created_at LIMIT 50")).rows;
    res.json(rows.map(row => ({id:row.id,oldWallet:row.old_wallet,newWallet:row.new_wallet,
      approvals:row.approvals,proofReference:encryption.decryptJson(row.encrypted_reference).reference})));
  }));
  router.post("/:id/review",asyncHandler(async (req,res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    if (!["approve","reject"].includes(req.body?.decision) || (req.body.decision==="approve" && req.body.identityVerified!==true)) {
      return res.status(400).json({error:"Confirm an independent hospital identity check before approval"});
    }
    if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
    const result = await store.transaction(async tx => {
      const row = (await tx.query("SELECT * FROM patient_recovery_requests WHERE id=$1 AND status='requested' AND expires_at>now() FOR UPDATE",[req.params.id])).rows[0];
      if (!row) return {status:409,error:"Request expired or already reviewed"};
      if ([row.old_wallet,row.new_wallet].includes(req.user.wallet)) return {status:403,error:"Independent reviewers required"};
      const approvals = row.approvals.filter(wallet => getAdminWallets().includes(wallet));
      if (approvals.includes(req.user.wallet)) return {status:409,error:"A different administrator must review this request"};
      let state = req.body.decision==="reject" ? "rejected" : "requested";
      if (req.body.decision==="approve") approvals.push(req.user.wallet);
      if (approvals.length>=2 && state!=="rejected") {
        if (getAdminWallets().includes(row.old_wallet)) return {status:409,error:"Administrator recovery requires the hospital's account process"};
        const patient = await tx.patientByWallet(row.old_wallet);
        if (!patient || await tx.patientByWallet(row.new_wallet) || await tx.providerByWallet(row.new_wallet)) return {status:409,error:"Identity records changed. Investigate before retrying"};
        await tx.query("SELECT id FROM patients WHERE id=$1 FOR UPDATE",[patient.id]);
        const oldUserId=patient.userId,newUserId=subjectId(row.new_wallet);
        let destination=row.new_wallet;
        if (oldUserId && newUserId) {
          await tx.query("UPDATE identities SET provider_type='retired_phone',identifier=identifier||'#'||id::text WHERE user_id=$1 AND provider_type='phone_otp'",[oldUserId]);
          await tx.query("UPDATE identities SET user_id=$2 WHERE user_id=$1 AND provider_type='phone_otp'",[newUserId,oldUserId]);
          await tx.query("UPDATE users SET status='suspended' WHERE id=$1",[newUserId]);
          await tx.query("UPDATE sessions SET revoked_at=now() WHERE user_id IN ($1,$2)",[oldUserId,newUserId]);
          destination="user:"+oldUserId;
        }
        const moved = await tx.query("UPDATE patients SET wallet=$2,revision=revision+1 WHERE id=$1 AND wallet=$3 RETURNING id",[patient.id,destination,patient.wallet]);
        if (!moved.rowCount) return {status:409,error:"Identity changed during review. Investigate before retrying"};
        await tx.query("UPDATE sessions SET revoked_at=now() WHERE wallet IN ($1,$2)",[row.old_wallet,patient.wallet]);
        await tx.query("UPDATE providers SET status='suspended' WHERE lower(wallet)=lower($1)",[row.old_wallet]);
        await tx.query("UPDATE patient_provider_consents SET status='revoked',revoked_at=now() WHERE patient_id=$1",[patient.id]);
        await tx.query("UPDATE audit_logs SET expires_at=now() WHERE patient_id=$1 AND action='EMERGENCY_BREAK_GLASS'",[patient.id]);
        await tx.query("DELETE FROM emergency_cards WHERE patient_id=$1",[patient.id]);
        state = "completed";
      }
      await tx.query("UPDATE patient_recovery_requests SET approvals=$2,status=$3 WHERE id=$1",[row.id,JSON.stringify(approvals),state]);
      await new AuditChainService(tx).appendAuditEvent({actor:req.user.wallet,action:"PATIENT_RECOVERY_REVIEWED",details:{requestId:row.id,decision:req.body.decision,status:state}});
      return {status:200,requestStatus:state,approvalCount:approvals.length};
    });
    res.status(result.status).json(result);
  }));
  return router;
};
