function decodeKey(raw) {
  if (typeof raw!=="string") throw new Error("A verified 32-byte encryption key is required");
  const value=raw.trim();
  const bytes=/^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value,"hex") : /^[A-Za-z0-9+/_-]{43}=?$/.test(value) ? Buffer.from(value,"base64") : null;
  if (!bytes || bytes.length!==32) throw new Error("A verified 32-byte encryption key is required");
  return bytes;
}
function keySet(material,id="legacy",previous="{}") {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid encryption key ID");
  let values;
  try {values=JSON.parse(previous);} catch {throw new Error("Invalid encryption keyring");}
  if (!values || typeof values!=="object" || Array.isArray(values)) throw new Error("Invalid encryption keyring");
  const keys=new Map();
  for (const [name,value] of Object.entries(values)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error("Invalid encryption key ID");
    keys.set(name,decodeKey(value));
  }
  const activeKey=decodeKey(material);
  if (keys.has(id) && !keys.get(id).equals(activeKey)) throw new Error("Conflicting active encryption key");
  keys.set(id,activeKey);
  return {activeId:id,activeKey,keys};
}
module.exports={decodeKey,keySet};
