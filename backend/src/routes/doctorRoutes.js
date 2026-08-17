const express = require("express");
module.exports = (controller) => { const router = express.Router(); router.get("/access", controller.listDoctorAccess); return router; };
