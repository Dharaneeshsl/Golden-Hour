const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { getAdminWallets, getJwtSecret } = require("../config/authConfig");

const nonces = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

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

      // Cryptographic EIP-191 personal_sign verification
      const message = `GoldenHour authentication nonce: ${entry.nonce}`;
      const recoveredRaw = ethers.verifyMessage(message, signature);
      const recovered = ethers.getAddress(recoveredRaw);

      if (recovered !== wallet) {
        return res.status(401).json({ error: "Invalid wallet signature" });
      }

      // Single-use nonce consumed immediately
      nonces.delete(wallet);

      const admins = getAdminWallets();
      const provider = await store.providerByWallet(wallet);
      const patient = await store.patientByWallet(wallet);

      let role = "unregistered";
      if (admins.includes(wallet)) {
        role = "admin";
      } else if (provider) {
        role = "doctor";
      } else if (patient) {
        role = "patient";
      }

      const user = { wallet, role, patientId: patient ? patient.id : null };
      const secret = getJwtSecret();
      const token = jwt.sign(user, secret, {
        expiresIn: "15m",
        algorithm: "HS256",
        issuer: "goldenhour",
      });

      res.json({ token, user });
    } catch (error) {
      console.error("Auth verify error:", error);
      res.status(401).json({ error: "Authentication verification failed" });
    }
  });

  return router;
};
