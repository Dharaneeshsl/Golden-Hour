const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { getAdminWallets, getJwtSecret } = require("../config/authConfig");
const { asyncHandler } = require("../utils/asyncHandler");

const nonces = new Map();
const TTL = 5 * 60 * 1000; // 5 minutes

function cleanup() {
  const now = Date.now();
  for (const [key, v] of nonces) {
    if (v.expiresAt <= now) nonces.delete(key);
  }
}

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = ({ store }) => {
  const router = express.Router();

  // B10: SIWE (EIP-4361) Compliant Nonce Generation with Domain Binding
  router.get("/nonce/:wallet", (req, res) => {
    cleanup();
    const rawWallet = req.params.wallet;
    if (!ethers.isAddress(rawWallet)) {
      return res.status(400).json({ error: "A valid Ethereum wallet address is required" });
    }
    const wallet = ethers.getAddress(rawWallet);
    const nonce = crypto.randomBytes(32).toString("hex");
    const domain = process.env.AUTH_DOMAIN || "goldenhour.health";
    const uri = process.env.AUTH_URI || "https://goldenhour.health";
    const chainId = parseInt(process.env.CHAIN_ID, 10) || 1;
    const issuedAt = new Date().toISOString();

    // Standard EIP-4361 SIWE formatted message
    const siweMessage = `${domain} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to GoldenHour Medical Access.\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

    nonces.set(wallet, {
      nonce,
      domain,
      uri,
      chainId,
      issuedAt,
      siweMessage,
      expiresAt: Date.now() + TTL,
    });

    res.json({
      nonce,
      domain,
      uri,
      chainId,
      issuedAt,
      message: `GoldenHour authentication nonce: ${nonce}`,
      siweMessage,
      expiresIn: TTL / 1000,
    });
  });

  // B10 & B11: SIWE Verification, Short Access Tokens, Rotating Refresh Tokens & Server Sessions
  router.post("/verify", asyncHandler(async (req, res) => {
    cleanup();
    const { wallet: rawWallet, signature, message: clientMessage } = req.body || {};
    if (!rawWallet || !ethers.isAddress(rawWallet) || !signature) {
      return res.status(400).json({ error: "wallet and signature are required" });
    }

    const wallet = ethers.getAddress(rawWallet);
    const entry = nonces.get(wallet);
    if (!entry) {
      return res.status(401).json({ error: "Nonce missing or expired" });
    }

    // Cryptographic verification: accepts either SIWE or standard nonce message
    let recoveredRaw = null;
    try {
      const standardNonceMsg = `GoldenHour authentication nonce: ${entry.nonce}`;
      if (clientMessage && clientMessage.includes(entry.nonce)) {
        recoveredRaw = ethers.verifyMessage(clientMessage, signature);
      } else {
        // Try standard nonce first, fallback to SIWE message
        try {
          recoveredRaw = ethers.verifyMessage(standardNonceMsg, signature);
        } catch (_) {
          recoveredRaw = ethers.verifyMessage(entry.siweMessage, signature);
        }
      }
    } catch (e) {
      return res.status(401).json({ error: "Cryptographic signature verification failed" });
    }

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

    // Generate server-side session and refresh token (B11)
    const sessionId = crypto.randomUUID();
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    if (store.createSession) {
      await store.createSession({
        id: sessionId,
        userId: patient ? patient.id : null,
        tokenHash,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        expiresAt,
      });
    }

    const user = { wallet, role, patientId: patient ? patient.id : null, sessionId };
    const secret = getJwtSecret();
    const token = jwt.sign(user, secret, {
      expiresIn: "15m",
      algorithm: "HS256",
      issuer: "goldenhour",
    });

    // Set secure HTTP-only refresh cookie
    res.setHeader(
      "Set-Cookie",
      `gh_refresh_token=${refreshToken}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );

    res.json({ token, user, sessionId });
  }));

  // B11: Refresh Token Rotation
  router.post("/refresh", asyncHandler(async (req, res) => {
    const refreshToken =
      parseCookie(req.headers.cookie, "gh_refresh_token") || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    let session = null;
    if (store.getSessionByHash) {
      session = await store.getSessionByHash(tokenHash);
    }

    if (!session || session.revokedAt || session.revoked_at) {
      return res.status(401).json({ error: "Session has been revoked or expired" });
    }

    const expiresAtDate = new Date(session.expiresAt || session.expires_at);
    if (expiresAtDate <= new Date()) {
      return res.status(401).json({ error: "Session has expired" });
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(32).toString("hex");
    const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");

    if (store.revokeSession && store.createSession) {
      await store.revokeSession(session.id);
      const newSessionId = crypto.randomUUID();
      await store.createSession({
        id: newSessionId,
        userId: session.userId || session.user_id,
        tokenHash: newTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      session.id = newSessionId;
    }

    // Lookup user to issue new access token
    let userWallet = null;
    let role = "unregistered";
    let patientId = null;

    if (session.userId || session.user_id) {
      const patient = await store.patientById(session.userId || session.user_id);
      if (patient) {
        userWallet = patient.wallet;
        role = "patient";
        patientId = patient.id;
      }
    }

    const secret = getJwtSecret();
    const newToken = jwt.sign(
      { wallet: userWallet, role, patientId, sessionId: session.id },
      secret,
      { expiresIn: "15m", algorithm: "HS256", issuer: "goldenhour" }
    );

    res.setHeader(
      "Set-Cookie",
      `gh_refresh_token=${newRefreshToken}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );

    res.json({ token: newToken });
  }));

  // B11: Server-side Session Revocation & Logout
  router.post("/logout", asyncHandler(async (req, res) => {
    const authHeader = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    let sessionId = null;

    if (authHeader) {
      try {
        const decoded = jwt.decode(authHeader);
        if (decoded && decoded.sessionId) {
          sessionId = decoded.sessionId;
        }
      } catch (_) {}
    }

    if (!sessionId) {
      const refreshToken = parseCookie(req.headers.cookie, "gh_refresh_token");
      if (refreshToken && store.getSessionByHash) {
        const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
        const session = await store.getSessionByHash(hash);
        if (session) sessionId = session.id;
      }
    }

    if (sessionId && store.revokeSession) {
      await store.revokeSession(sessionId);
    }

    // Clear cookie
    res.setHeader(
      "Set-Cookie",
      "gh_refresh_token=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0"
    );

    res.json({ message: "Session revoked and logged out successfully" });
  }));

  return router;
};
