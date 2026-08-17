const express = require("express");
module.exports = (controller) => { const router = express.Router(); router.post("/validate", controller.validateEmergencyRequest); return router; };
