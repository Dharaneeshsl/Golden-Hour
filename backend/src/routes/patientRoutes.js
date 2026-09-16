const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");

module.exports = (c) => {
  const r = express.Router();
  r.post("/", requireAuth, c.create);
  r.get("/me", requireAuth, c.me);
  r.get("/all", requireAuth, c.listAll);
  r.get("/:id", requireAuth, c.get);
  r.put("/:id", requireAuth, c.update);
  return r;
};
