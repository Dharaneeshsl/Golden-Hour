const express = require("express");
const crypto = require("crypto");
const {asyncHandler} = require("../utils/asyncHandler");
const {OutboxService} = require("../services/outboxService");
module.exports = ({store}) => {
  const router = express.Router();
  router.get("/",asyncHandler(async (req,res) => {
    const secret = process.env.CRON_SECRET;
    const actual = req.headers.authorization || "";
    if (!secret || secret.length<32 ||
        !crypto.timingSafeEqual(crypto.createHash("sha256").update(actual).digest(),
          crypto.createHash("sha256").update("Bearer " + secret).digest())) {
      return res.sendStatus(401);
    }
    if (!store.query) return res.sendStatus(503);
    // Bound cleanup work so the function can run within the Vercel request deadline.
    for (const table of ["http_rate_limits","login_challenges","mfa_challenges","staff_invitations"]) {
      await store.query(`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE expires_at<now() LIMIT 1000)`);
    }
    const jobs = await new OutboxService(store).processPending();
    res.json({cleanup:"complete",processedJobs:jobs.length,confirmedJobs:jobs.filter(job=>job.status==="sent").length});
  }));
  return router;
};
