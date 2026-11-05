const crypto=require("crypto");
const {canonicalAuditPayload}=require("./auditChainService");
function csvCell(value){let text=String(value??"");if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
function verifySegment(rows,anchor="0".repeat(64)){
 let previous=anchor;
 for(const row of rows){
  const expected=crypto.createHash("sha256").update(canonicalAuditPayload(row.id,row.patient_id,row.actor,row.action,row.details,row.created_at,previous)).digest("hex");
  if(row.previous_hash!==previous||row.current_hash!==expected)return {valid:false,brokenAtSequence:String(row.sequence_num)};
  previous=row.current_hash;
 }
 return {valid:true,checked:rows.length,anchorHash:anchor,endHash:previous,scope:"Selected segment; the preceding stored hash is the anchor. Not independent proof against privileged database replacement."};
}
function auditCsv(rows){
 const columns=["sequence_num","id","created_at","actor","actor_user_id","patient_id","action","previous_hash","current_hash"];
 return [columns.map(csvCell).join(","),...rows.map(row=>columns.map(key=>csvCell(row[key] instanceof Date?row[key].toISOString():row[key])).join(","))].join("\r\n");
}
async function auditPdf(rows,report){
 const PDFDocument=require("pdfkit");const doc=new PDFDocument({size:"A4",margin:40,info:{Title:"GoldenHour audit segment"}}),chunks=[];
 const finished=new Promise((resolve,reject)=>{doc.on("data",chunk=>chunks.push(chunk));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});
 doc.fontSize(18).text("GoldenHour audit export");doc.moveDown().fontSize(10).text(JSON.stringify(report,null,2));doc.moveDown();
 for(const row of rows){doc.fontSize(9).text(`Sequence ${row.sequence_num} | ${new Date(row.created_at).toISOString()} | ${row.action}`);doc.text(`Actor: ${row.actor} | User: ${row.actor_user_id || "historical identity"}`);doc.text(`Reference: ${row.id} | Patient: ${row.patient_id || "none"}`);doc.text(`Hash: ${row.current_hash}`);doc.moveDown();}
 doc.end();return finished;
}
module.exports={csvCell,verifySegment,auditCsv,auditPdf};
