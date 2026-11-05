const crypto=require("crypto");
const {keySet}=require("../utils/keySet");
function getKeySet() {
  let material=process.env.ENCRYPTION_KEY;
  if (!material) {
    if (process.env.NODE_ENV==="production") throw new Error("ENCRYPTION_KEY must be configured in production");
    material=crypto.createHash("sha256").update("goldenhour-local-dev-only-fallback-key").digest("base64");
  }
  return keySet(material,process.env.ENCRYPTION_KEY_ID || "legacy",process.env.ENCRYPTION_KEYRING_JSON || "{}");
}
function encryptJson(value) {
  const keys=getKeySet(),iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",keys.activeKey,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return {version:1,algorithm:"aes-256-gcm",keyId:keys.activeId,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),ciphertext:ciphertext.toString("base64")};
}
function decryptJson(payload) {
  if (!payload || payload.version!==1 || payload.algorithm!=="aes-256-gcm") throw new Error("Unsupported encrypted payload");
  const key=getKeySet().keys.get(payload.keyId || "legacy");
  if (!key) throw new Error("Required historical encryption key is unavailable");
  const cipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(payload.iv,"base64"));
  cipher.setAuthTag(Buffer.from(payload.tag,"base64"));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload.ciphertext,"base64")),cipher.final()]).toString("utf8"));
}
module.exports={encryptJson,decryptJson,getKeySet};
