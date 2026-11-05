const {validatedRouter} = require("../utils/validatedRouter");
const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleCheck");

module.exports = (c) => {
  const r = validatedRouter();
  r.post("/invitations", requireAuth, c.invite);
  r.post("/register", requireAuth, c.register);
  r.get("/access", requireAuth, c.access);
  r.get("/", requireAuth, requireRole("admin"), c.list);
  r.post("/:wallet/verify", requireAuth, requireRole("admin"), c.verify);
  r.patch("/:wallet/status", requireAuth, requireRole("admin"), c.updateStatus);
  return r;
};