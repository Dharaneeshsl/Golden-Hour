const {validatedRouter} = require("../utils/validatedRouter");
const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireVerifiedProvider } = require("../middleware/roleCheck");

module.exports = (c, store) => {
  const r = validatedRouter();
  r.post("/", requireAuth, requireVerifiedProvider(store), c.create);
  r.get("/critical/:accessId", requireAuth, c.critical);
  r.get("/recent/all", requireAuth, c.recentAudits);
  r.get("/reviews/pending", requireAuth, c.pendingReviews);
  r.post("/reviews/:id", requireAuth, c.submitReview);
  r.get("/:patientId", requireAuth, c.audit);
  return r;
};
