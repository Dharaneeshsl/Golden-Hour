const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { createStore } = require("./config/db");
const { ChainService } = require("./services/chainService");
const defaultEncryption = require("./services/encryptionService");
const defaultIpfs = require("./services/ipfsService");

const { createPatientController } = require("./controllers/patientController");
const { createDoctorController } = require("./controllers/doctorController");
const { createRecordController } = require("./controllers/recordController");
const { createEmergencyController } = require("./controllers/emergencyController");
const { createConsentController } = require("./controllers/consentController");

const patientRoutes = require("./routes/patientRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const recordRoutes = require("./routes/recordRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const consentRoutes = require("./routes/consentRoutes");
const authRoutes = require("./routes/authRoutes");

async function createApp({
  store,
  chain = new ChainService(),
  encryption = defaultEncryption,
  ipfs = defaultIpfs,
} = {}) {
  store = store || (await createStore());
  const app = express();
  app.disable("x-powered-by");

  if (process.env.TRUST_PROXY) {
    app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : process.env.TRUST_PROXY);
  }

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    helmet(),
    cors({
      origin: (origin, callback) => {
        // Bug #9 Fix: Do not allow missing origin in production
        if (!origin) {
          if (process.env.NODE_ENV === "production") {
            return callback(new Error("CORS policy restriction: Origin header required in production"));
          }
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error("CORS policy restriction: Origin not allowed"));
      },
      credentials: true,
    }),
    express.json({ limit: "256kb" })
  );

  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: "Too many authentication requests, please try again later" },
  });

  const c = { store, chain, encryption, ipfs };

  app.get("/health", (_q, s) =>
    s.json({
      status: "ok",
      chain: chain.enabled ? "backend-relay-configured" : "not-configured",
    })
  );

  app.get("/ready", async (_q, s) => {
    try {
      if (store.query) {
        // Bug #31 Fix: Verify migration table exists in database
        await store.query("SELECT filename FROM schema_migrations LIMIT 1");
      }
      s.json({
        status: "ready",
        database: process.env.DATABASE_URL ? "postgres" : "local",
      });
    } catch (e) {
      s.status(503).json({ status: "not_ready", error: "Database or schema migrations not ready" });
    }
  });

  app.use("/api/auth", authLimiter, authRoutes({ store }));
  app.use("/api/patients", patientRoutes(createPatientController(c)));
  app.use("/api/doctors", doctorRoutes(createDoctorController(c)));
  app.use("/api/records", recordRoutes(createRecordController(c), store));
  app.use("/api/emergency-access", emergencyRoutes(createEmergencyController(c), store));
  app.use("/api/consents", consentRoutes(createConsentController(c)));

  app.use((err, req, res, _next) => {
    console.error(`[Error ${req.requestId}]`, err);
    res.status(500).json({
      error: "Internal server error",
      requestId: req.requestId,
    });
  });

  return app;
}

if (require.main === module) {
  createApp().then((app) => {
    const port = process.env.PORT || 4000;
    const server = app.listen(port, () => {
      console.log(`GoldenHour backend listening on port ${port}`);
    });
    process.on("SIGTERM", () => {
      console.log("SIGTERM signal received: closing HTTP server");
      server.close(() => console.log("HTTP server closed"));
    });
  });
}

module.exports = { createApp };
