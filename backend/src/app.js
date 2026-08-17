require("dotenv").config();
const express = require("express"); const cors = require("cors"); const helmet = require("helmet");
const { JsonStore } = require("./config/db"); const { ChainService } = require("./services/chainService");
const encryption = require("./services/encryptionService"); const ipfs = require("./services/ipfsService");
const { createPatientController } = require("./controllers/patientController"); const { createDoctorController } = require("./controllers/doctorController");
const { createRecordController } = require("./controllers/recordController"); const { createEmergencyController } = require("./controllers/emergencyController");
const patientRoutes = require("./routes/patientRoutes"); const doctorRoutes = require("./routes/doctorRoutes"); const recordRoutes = require("./routes/recordRoutes"); const emergencyRoutes = require("./routes/emergencyRoutes"); const authRoutes = require("./routes/authRoutes");
function createApp({ store = new JsonStore(), chain = new ChainService() } = {}) {
  const app = express(); const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  app.use(helmet()); app.use(cors({ origin: allowedOrigin, credentials: true })); app.use(express.json({ limit: "1mb" }));
  const context = { store, chain, encryption, ipfs };
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "goldenhour-api", chainMode: chain.enabled ? "configured" : "memory/client-wallet", timestamp: new Date().toISOString() }));
  app.use("/api/auth", authRoutes()); app.use("/api/patients", patientRoutes(createPatientController(context))); app.use("/api/doctors", doctorRoutes(createDoctorController(context))); app.use("/api/records", recordRoutes(createRecordController(context))); app.use("/api/emergency-access", emergencyRoutes(createEmergencyController(context)));
  return app;
}
const app = createApp(); if (require.main === module) app.listen(Number(process.env.PORT || 4000), () => console.log(`GoldenHour API listening on http://localhost:${process.env.PORT || 4000}`));
module.exports = { app, createApp };
