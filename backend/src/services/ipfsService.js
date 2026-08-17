async function uploadEncrypted(payload) {
  if (!process.env.PINATA_JWT) return { cid: `local-${Date.now()}`, persisted: false, note: "Set PINATA_JWT to enable Pinata persistence." };
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PINATA_JWT}` }, body: JSON.stringify({ pinataContent: payload }) });
  if (!response.ok) throw new Error(`IPFS upload failed: ${response.status}`);
  const data = await response.json(); return { cid: data.IpfsHash, persisted: true };
}
module.exports = { uploadEncrypted };
