const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEV_DIR = path.join(process.cwd(), ".data", "ipfs-mock");
const devModeAllowed = () =>
  process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_IPFS_MOCK === "true";

async function uploadEncrypted(payload) {
  if (!process.env.PINATA_JWT) {
    if (!devModeAllowed()) {
      throw new Error("PINATA_JWT must be configured; refusing to generate a fake CID");
    }
    fs.mkdirSync(DEV_DIR, { recursive: true });
    const cid = `dev${crypto.randomBytes(16).toString("hex")}`;
    fs.writeFileSync(path.join(DEV_DIR, `${cid}.json`), JSON.stringify(payload));
    return { cid, persisted: true, mode: "local-dev-mock" };
  }
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PINATA_JWT}`,
    },
    body: JSON.stringify({ pinataContent: payload }),
  });
  if (!response.ok) throw new Error(`IPFS upload failed: ${response.status}`);
  const data = await response.json();
  if (!data.IpfsHash) throw new Error("IPFS response did not contain a CID");
  return { cid: data.IpfsHash, persisted: true };
}

async function fetchEncrypted(cid) {
  if (!cid || cid.length > 128 || !/^[A-Za-z0-9_-]+$/.test(cid)) {
    throw new Error("Invalid IPFS CID string format");
  }
  if (cid.startsWith("dev")) {
    if (!devModeAllowed()) {
      throw new Error("Local dev IPFS mock CIDs are invalid in production");
    }
    const filePath = path.join(DEV_DIR, `${cid}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error("Local dev IPFS mock payload not found");
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  const response = await fetch(`https://gateway.pinata.cloud/ipfs/${encodeURIComponent(cid)}`);
  if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);
  return response.json();
}

module.exports = { uploadEncrypted, fetchEncrypted };
