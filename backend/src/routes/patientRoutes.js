const express = require("express");
module.exports = (store, controller) => { const router = express.Router(); router.post("/", controller.createPatient.bind(null, store)); return router; };
