// Operator-only reader for migrating historical encrypted objects. No public uploads.
async function fetchEncrypted(cid) {
  if (typeof cid!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(cid)) throw new Error("Invalid historical object ID");
  const response=await fetch("https://gateway.pinata.cloud/ipfs/"+encodeURIComponent(cid),{signal:AbortSignal.timeout(10000),redirect:"error"});
  if (!response.ok) throw new Error("Historical encrypted object unavailable");
  return response.json();
}
module.exports={fetchEncrypted};
