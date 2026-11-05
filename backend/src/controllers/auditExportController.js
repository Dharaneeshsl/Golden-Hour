const {asyncHandler}=require("../utils/asyncHandler");
const {AuditChainService}=require("../services/auditChainService");
const {verifySegment,auditCsv,auditPdf}=require("../services/auditExportService");
module.exports=store=>asyncHandler(async(req,res)=>{
 if(req.user.role!=="admin")return res.sendStatus(403);
 const {after="0",limit="100",format="csv"}=req.query;
 if(typeof after!=="string"||!/^\d{1,15}$/.test(after)||typeof limit!=="string"||!/^\d{1,3}$/.test(limit)||Number(limit)<1||Number(limit)>500||!["csv","pdf"].includes(format))return res.status(400).json({error:"Use a sequence cursor, limit 1–500, and csv or pdf format."});
 const output=await store.transaction(async tx=>{
  await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await tx.query("SET LOCAL statement_timeout='10s'");
  const anchor=(await tx.query("SELECT current_hash FROM audit_events WHERE sequence_num<=$1 ORDER BY sequence_num DESC LIMIT 1",[after])).rows[0]?.current_hash || "0".repeat(64);
  const all=(await tx.query("SELECT a.*, coalesce(a.actor_user_id, i.user_id) AS actor_user_id FROM audit_events a LEFT JOIN identities i ON i.provider_type='wallet' AND i.identifier=lower(a.actor) WHERE a.sequence_num>$1 ORDER BY a.sequence_num LIMIT $2",[after,Number(limit)+1])).rows;
  const rows=all.slice(0,Number(limit)),report=verifySegment(rows,anchor);
  if(!report.valid){const error=new Error("Audit segment integrity check failed. Escalate to the hospital incident lead.");error.status=409;throw error;}
  report.firstSequence=rows.length?String(rows[0].sequence_num):null;report.lastSequence=rows.length?String(rows.at(-1).sequence_num):null;report.exportedAt=new Date().toISOString();
  const content=format==="csv"?auditCsv(rows):(await auditPdf(rows,report)).toString("base64");
  await new AuditChainService(tx).appendAuditEvent({actor:req.user.wallet,action:"ADMIN_AUDIT_EXPORTED",details:{format,firstSequence:report.firstSequence,lastSequence:report.lastSequence,count:rows.length}});
  return {format,report,content,nextCursor:all.length>Number(limit)?report.lastSequence:null};
 });
 res.setHeader("Cache-Control","no-store");res.json(output);
});
