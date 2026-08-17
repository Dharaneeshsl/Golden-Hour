const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleCheck");
module.exports = (controller) => { const router = express.Router(); router.post("/", requireAuth, requireRole("patient", "admin"), controller.create); router.get("/:id", requireAuth, controller.get); return router; };
