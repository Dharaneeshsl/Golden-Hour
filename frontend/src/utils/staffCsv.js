export function parseStaffCsv(text){
 if(typeof text!=="string" || text.length>65536)throw new Error("CSV must be 64 KB or smaller.");
 const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(lines[0]?.toLowerCase()!=="phone")throw new Error("Use one column headed phone, followed by +91 mobile numbers.");
 if(lines.length<2 || lines.length>101)throw new Error("Include between 1 and 100 staff rows.");
 const seen=new Set();
 return lines.slice(1).map((raw,index)=>{
  const phone=raw.startsWith('"')&&raw.endsWith('"')?raw.slice(1,-1):raw;
  const error=!/^\+91[6-9]\d{9}$/.test(phone)?"Invalid Indian mobile number":seen.has(phone)?"Duplicate row":null;
  if(!error)seen.add(phone);
  return {line:index+2,phone,error};
 });
}
export function reviewAge(createdAt,now=Date.now()){
 const time=Date.parse(createdAt);if(!Number.isFinite(time)||time>now)return "Review date unavailable";
 const hours=Math.floor((now-time)/3600000);return `${hours} hours waiting${hours>=24?" · Over 24-hour review target":""}`;
}
