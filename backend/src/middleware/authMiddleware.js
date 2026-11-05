const jwt = require("jsonwebtoken");
const { getJwtSecret, isCurrentAdmin } = require("../config/authConfig");
const { canonicalizeWallet } = require("../config/db");

async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication token required" });

  try {
    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer: "goldenhour" });

    if (payload.purpose) return res.status(401).json({error:"Complete sign-in first"});
    // Canonicalize wallet in user context
    if (process.env.NODE_ENV === "production" && !payload.sessionId) return res.status(401).json({error: "A current session is required"});
    const userWallet = canonicalizeWallet(payload.wallet);

    // Live re-check for admin role (Bug #11)
    let userRole = payload.role;
    if (userRole === "admin" && !isCurrentAdmin(userWallet)) {
      userRole = "patient";
    }

    // Check server-side session revocation if session ID is attached (B11)
    const store = req.app ? req.app.get("store") : null;
    if (store && payload.sessionId && store.isSessionActive) {
      const active = await store.isSessionActive(payload.sessionId);
      if (!active) {
        return res.status(401).json({ error: "Session has been revoked or expired" });
      }
    }

    if ((process.env.NODE_ENV === "production" || process.env.REQUIRE_STAFF_MFA === "true") && !payload.mfaVerified) {
      const staff = isCurrentAdmin(userWallet) || await store.providerByWallet(userWallet);
      if (staff) return res.status(401).json({error:"Sign in again with your authenticator",code:"MFA_REQUIRED"});
    }
    req.user = { ...payload, wallet: userWallet, role: userRole };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}

module.exports = { requireAuth };
