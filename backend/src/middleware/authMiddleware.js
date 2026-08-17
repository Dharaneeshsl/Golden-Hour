const jwt = require("jsonwebtoken");
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || "local-development-secret"); next(); }
  catch { return res.status(401).json({ error: "Invalid authentication token" }); }
}
module.exports = { requireAuth };
