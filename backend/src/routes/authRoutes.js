const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ethers } = require("ethers");
const { getAdminWallets, getJwtSecret } = require("../config/authConfig");
const {PhoneAuthService,subjectId} = require("../services/phoneAuthService");
const {cookieValue,accessCookie} = require("../utils/authCookies");
const { MfaService } = require("../services/mfaService");
const { asyncHandler } = require("../utils/asyncHandler");

const TTL = 5 * 60 * 1000;



module.exports = ({ store, otpProvider }) => {
  const router = express.Router();

  async function issueSession(req, res, wallet, mfaVerified = false, recoveryCodes) {
    const userId = subjectId(wallet);
    if (userId) {
      const account = (await store.query("SELECT status FROM users WHERE id=$1",[userId])).rows[0];
      if (!account || account.status!=="active") return res.status(401).json({error:"Account unavailable"});
    }
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
        wallet,
        userId,
        mfaVerified,
        tokenHash,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        expiresAt,
      });
    }

    const user = { wallet, userId, role, patientId: patient ? patient.id : null, sessionId, mfaVerified };
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

        const cookies = res.getHeader("Set-Cookie") || [];
    res.setHeader("Set-Cookie",[...(Array.isArray(cookies)?cookies:[cookies]),accessCookie(token)]);
    res.json({...(userId ? {} : {token}),user,sessionId,recoveryCodes});
  }

  const phoneAuth = new PhoneAuthService(store,otpProvider);
  router.post("/phone/request",asyncHandler(async (req,res) => {
    try {res.status(202).json(await phoneAuth.request(req.body?.phone));}
    catch (error) {res.status(error.status || 503).json({error:error.status ? error.message : "Phone sign-in service unavailable. Please try again."});}
  }));
  router.post("/phone/verify",asyncHandler(async (req,res) => {
    let account;
    try {account=await phoneAuth.verify(req.body?.challengeId,req.body?.code);}
    catch {return res.status(401).json({error:"Invalid, expired, or already used code"});}
    const staff = getAdminWallets().includes(account.subject) || await store.providerByWallet(account.subject);
    if (staff) return res.json(await new MfaService(store).challenge(account.subject));
    return issueSession(req,res,account.subject);
  }));

  router.post("/mfa/setup", asyncHandler(async (req,res) => {
    try { res.json(await new MfaService(store).setup(req.body?.mfaToken)); }
    catch { res.status(401).json({error:"Authenticator setup unavailable. Sign in again."}); }
  }));
  router.post("/mfa/complete", asyncHandler(async (req,res) => {
    let result;
    try { result = await new MfaService(store).complete(req.body?.mfaToken, req.body?.code); }
    catch { return res.status(401).json({error:"Code invalid, already used, or login expired. After five failed attempts, wait 15 minutes before signing in again."}); }
    return issueSession(req,res,result.wallet,true,result.recoveryCodes);
  }));

  // B10: SIWE (EIP-4361) Compliant Nonce Generation with Domain Binding
  router.get("/nonce/:wallet", asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV==="production" && process.env.WALLET_AUTH_ENABLED!=="true") return res.sendStatus(404);
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

    const expiresAt = new Date(Date.now() + TTL).toISOString();
    // Standard EIP-4361 SIWE formatted message
    const siweMessage = `${domain} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to GoldenHour Medical Access.\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;

    await store.saveChallenge(wallet, siweMessage, expiresAt);
    res.json({
      nonce,
      domain,
      uri,
      chainId,
      issuedAt,
      message: siweMessage,
      siweMessage,
      expiresIn: TTL / 1000,
    });
  }));

  // B10 & B11: SIWE Verification, Short Access Tokens, Rotating Refresh Tokens & Server Sessions
  router.post("/verify", asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV==="production" && process.env.WALLET_AUTH_ENABLED!=="true") return res.sendStatus(404);
    const { wallet: rawWallet, signature, message: clientMessage } = req.body || {};
    if (!rawWallet || !ethers.isAddress(rawWallet) || !signature) {
      return res.status(400).json({ error: "wallet and signature are required" });
    }

    const wallet = ethers.getAddress(rawWallet);
    const entry = await store.getChallenge(wallet);
    if (!entry) {
      return res.status(401).json({ error: "Nonce missing or expired" });
    }

    if (clientMessage !== undefined && clientMessage !== entry.message) {
      return res.status(401).json({ error: "Challenge message mismatch" });
    }
    try {
      if (ethers.verifyMessage(entry.message, signature) !== wallet) {
        return res.status(401).json({ error: "Invalid wallet signature" });
      }
    } catch {
      return res.status(401).json({ error: "Invalid wallet signature" });
    }
    if (!await store.consumeChallenge(wallet, entry.message)) {
      return res.status(401).json({ error: "Challenge expired or already used" });
    }

    const staff = getAdminWallets().includes(wallet) || await store.providerByWallet(wallet);
    if (staff && (process.env.NODE_ENV === "production" || process.env.REQUIRE_STAFF_MFA === "true")) {
      return res.json(await new MfaService(store).challenge(wallet));
    }
    return issueSession(req,res,wallet);

  }));

  // B11: Refresh Token Rotation
  router.post("/refresh", asyncHandler(async (req, res) => {
    const refreshToken =
      cookieValue(req.headers.cookie, "gh_refresh_token") || req.body?.refreshToken;

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

    const userWallet = session.wallet;
    if (!userWallet || !await store.rotateRefresh(session.id, tokenHash, newTokenHash)) {
      return res.status(401).json({error: "Refresh token expired or already used"});
    }
    const patient = await store.patientByWallet(userWallet);
    const provider = await store.providerByWallet(userWallet);
    const patientId = patient?.id || null;
    const role = getAdminWallets().includes(userWallet) ? "admin" :
      provider ? "doctor" : patient ? "patient" : "unregistered";

    const secret = getJwtSecret();
    const newToken = jwt.sign(
      { wallet: userWallet, userId:subjectId(userWallet), role, patientId, sessionId: session.id, mfaVerified: session.mfa_verified || false },
      secret,
      { expiresIn: "15m", algorithm: "HS256", issuer: "goldenhour" }
    );

    res.setHeader(
      "Set-Cookie",
      `gh_refresh_token=${newRefreshToken}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=604800${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );

    res.setHeader("Set-Cookie",[res.getHeader("Set-Cookie"),accessCookie(newToken)]);
    res.json(subjectId(userWallet) ? {refreshed:true} : {token:newToken});
  }));

  // B11: Server-side Session Revocation & Logout
  router.post("/logout", asyncHandler(async (req, res) => {
    const authHeader = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || cookieValue(req.headers.cookie,"gh_access");
    let sessionId = null;

    if (authHeader) {
      try {
        const decoded = jwt.verify(authHeader, getJwtSecret(), { algorithms: ["HS256"], issuer: "goldenhour" });
        if (decoded && decoded.sessionId) {
          sessionId = decoded.sessionId;
        }
      } catch (_) {}
    }

    if (!sessionId) {
      const refreshToken = cookieValue(req.headers.cookie, "gh_refresh_token");
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
      ["gh_refresh_token=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0","gh_access=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"]
    );

    res.json({ message: "Session revoked and logged out successfully" });
  }));

  return router;
};
