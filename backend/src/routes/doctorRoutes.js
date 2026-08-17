const express = require("express"); const { requireAuth } = require("../middleware/authMiddleware");
module.exports = (controller) => { const router = express.Router(); router.get("/access", requireAuth, controller.access); return router; };
