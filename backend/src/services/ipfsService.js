const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function getDevDirs() {
  const dirs = [
    path.join(process.cwd(), ".data", "ipfs-mock"),
    path.join(__dirname, "../../../.data", "ipfs-mock"),
    path.join(__dirname, "../../.data", "ipfs-mock"),
  ];
  return [...new Set(dirs)];
}

const devModeAllowed = () =>
  process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_IPFS_MOCK === "true";

async function uploadEncrypted(payload) {
  if (!process.env.PINATA_JWT) {
    if (!devModeAllowed()) {
      throw new Error("PINATA_JWT must be configured; refusing to generate a fake CID");
    }
    const cid = `dev${crypto.randomBytes(16).toString("hex")}`;
    const serialized = JSON.stringify(payload);
    for (const d of getDevDirs()) {
      try {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, `${cid}.json`), serialized);
      } catch (_) {}
    }
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
  for (const d of getDevDirs()) {
    const filePath = path.join(d, `${cid}.json`);
    if (fs.existsSync(filePath)) {
      if (!devModeAllowed()) {
        throw new Error("Local dev IPFS mock CIDs are invalid in production");
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  }

  if (cid.startsWith("dev")) {
    if (!devModeAllowed()) {
      throw new Error("Local dev IPFS mock CIDs are invalid in production");
    }
    throw new Error("Local dev IPFS mock payload not found");
  }

  const response = await fetch(`https://gateway.pinata.cloud/ipfs/${encodeURIComponent(cid)}`);
  if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);
  return response.json();
}

module.exports = { uploadEncrypted, fetchEncrypted };
