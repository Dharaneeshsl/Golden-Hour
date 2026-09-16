const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ethers } = require("ethers");

const nonces = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

function secret() {
  const value = process.env.JWT_SECRET;
  const invalidPlaceholders = [
    "local-development-secret",
    "replace-with-a-long-random-secret",
    "your-secret-key-here",
  ];
  if (!value || invalidPlaceholders.includes(value)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("A strong, non-placeholder JWT_SECRET must be configured in production");
    }
    return value || "local-development-secret-fallback-dev-only";
  }
  return value;
}

function cleanup() {
  const now = Date.now();
  for (const [key, v] of nonces) {
    if (v.expiresAt <= now) nonces.delete(key);
  }
}

module.exports = ({ store }) => {
  const router = express.Router();

  router.get("/nonce/:wallet", (req, res) => {
    cleanup();
    const rawWallet = req.params.wallet;
    if (!ethers.isAddress(rawWallet)) {
      return res.status(400).json({ error: "A valid Ethereum wallet address is required" });
    }
    const wallet = ethers.getAddress(rawWallet);
    const nonce = crypto.randomBytes(32).toString("hex");
    nonces.set(wallet, { nonce, expiresAt: Date.now() + TTL });

    res.json({
      nonce,
      message: `GoldenHour authentication nonce: ${nonce}`,
      expiresIn: TTL / 1000,
    });
  });

  router.post("/verify", async (req, res) => {
    try {
      cleanup();
      const { wallet: rawWallet, signature } = req.body || {};
      if (!rawWallet || !ethers.isAddress(rawWallet) || !signature) {
        return res.status(400).json({ error: "wallet and signature are required" });
      }

      const wallet = ethers.getAddress(rawWallet);
      const entry = nonces.get(wallet);
      if (!entry) {
        return res.status(401).json({ error: "Nonce missing or expired" });
      }

      const message = `GoldenHour authentication nonce: ${entry.nonce}`;
      const recoveredRaw = ethers.verifyMessage(message, signature);
      const recovered = ethers.getAddress(recoveredRaw);

      if (recovered !== wallet) {
        return res.status(401).json({ error: "Invalid wallet signature" });
      }

      // Single-use nonce
      nonces.delete(wallet);

      const defaultAdmins = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,0xeF4C5fa4f9b9fFD908d5b422Dd1C3eEd3D9F749c";
      const admins = (process.env.ADMIN_WALLETS || defaultAdmins)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => (ethers.isAddress(x) ? ethers.getAddress(x) : x.toLowerCase()));

      const provider = await store.providerByWallet(wallet);

      let role = "patient";
      if (admins.includes(wallet)) {
        role = "admin";
      } else if (provider && provider.status === "verified") {
        role = "doctor";
      }

      const user = { wallet, role };
      const token = jwt.sign(user, secret(), { expiresIn: "1h", issuer: "goldenhour" });

      res.json({ token, user });
    } catch (error) {
      console.error("Auth verify error:", error);
      res.status(401).json({ error: "Authentication verification failed" });
    }
  });

  return router;
};
