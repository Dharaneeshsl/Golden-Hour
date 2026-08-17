const express = require("express"); const { requireAuth } = require("../middleware/authMiddleware"); const { requireRole } = require("../middleware/roleCheck");
module.exports = (controller) => { const router = express.Router(); router.post("/", requireAuth, requireRole("doctor", "admin"), controller.create); router.get("/:patientId", requireAuth, controller.audit); return router; };
