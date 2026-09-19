const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { getAdminWallets } = require("../config/authConfig");

const nonces = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

const DEMO_LOGIN_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_LOGIN === "true";

const DEMO_WALLETS = new Set(
  [
    "0xeF4C5fa4f9b9fFD908d5b422Dd1C3eEd3D9F749c",
    "0xa2994811542d34846a4Bdd67A1ff29c9514395Ee",
    "0xA9A65f72a90f4D4021CB56CC70f21D84fD444504",
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  ].map((w) => ethers.getAddress(w))
);

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

      const isDemoSig =
        DEMO_LOGIN_ENABLED &&
        DEMO_WALLETS.has(wallet) &&
        signature === `DEMO_SIGNATURE_${wallet}`;

      if (!isDemoSig) {
        const message = `GoldenHour authentication nonce: ${entry.nonce}`;
        const recoveredRaw = ethers.verifyMessage(message, signature);
        const recovered = ethers.getAddress(recoveredRaw);

        if (recovered !== wallet) {
          return res.status(401).json({ error: "Invalid wallet signature" });
        }
      }

      // Single-use nonce
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
      const token = jwt.sign(user, secret(), { expiresIn: "1h", issuer: "goldenhour" });

      res.json({ token, user });
    } catch (error) {
      console.error("Auth verify error:", error);
      res.status(401).json({ error: "Authentication verification failed" });
    }
  });

  return router;
};
