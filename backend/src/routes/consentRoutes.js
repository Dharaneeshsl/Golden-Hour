const {validatedRouter} = require("../utils/validatedRouter");
const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");

module.exports = (c) => {
  const r = validatedRouter();
  r.get("/provider", requireAuth, c.listForProvider);
  r.get("/:patientId", requireAuth, c.list);
  r.post("/:patientId", requireAuth, c.grant);
  r.post("/:patientId/revoke", requireAuth, c.revoke);
  return r;
};