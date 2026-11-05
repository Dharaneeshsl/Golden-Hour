const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { createStore } = require("./config/db");

const defaultEncryption = require("./services/encryptionService");
const {privateObjectStore} = require("./services/privateObjectStore");
const { EnvelopeEncryptionService } = require("./services/envelopeEncryptionService");
const { AuditChainService } = require("./services/auditChainService");

const { createPatientController } = require("./controllers/patientController");
const { createDoctorController } = require("./controllers/doctorController");
const { createRecordController } = require("./controllers/recordController");
const { createEmergencyController } = require("./controllers/emergencyController");
const { createConsentController } = require("./controllers/consentController");
const { createComplianceController } = require("./controllers/complianceController");

const patientRoutes = require("./routes/patientRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const recordRoutes = require("./routes/recordRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const consentRoutes = require("./routes/consentRoutes");
const authRoutes = require("./routes/authRoutes");
const complianceRoutes = require("./routes/complianceRoutes");
const {PostgresRateLimitStore} = require("./services/rateLimitStore");
const { requireAuth } = require("./middleware/authMiddleware");
const { asyncHandler } = require("./utils/asyncHandler");
const { validateStartupConfig } = require("./config/validateConfig");

async function createApp({
  store,
  chain = {enabled:false},
  encryption = defaultEncryption,
  ipfs,
  otpProvider,
} = {}) {
  validateStartupConfig({otpProviderInjected:Boolean(otpProvider)});
  let erasureLedger;
  const ownsStore = !store;
  store = store || (await createStore());
  try {
  if (process.env.NODE_ENV === "production" && chain.enabled) {
    throw new Error("Public chain writes are disabled for hospital deployments");
  }
  ipfs ??= privateObjectStore(store);
  const app = express();
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.disable("x-powered-by");
  app.set("store", store);

  if (process.env.VERCEL) {
    app.set("trust proxy", 1);
  } else if (process.env.TRUST_PROXY) {
    app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : /^[1-3]$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
  }

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    if (process.env.NODE_ENV === "production") {
      const start = performance.now();
      res.once("finish", () => console.info(JSON.stringify({
        event:"http", requestId:req.requestId, method:req.method,
        route:req.route?.path || "unmatched",service:req.originalUrl.startsWith("/api/emergency-access") ? "emergency" : "application", status:res.statusCode,
        durationMs:Math.round(performance.now() - start)
      })));
    }
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    helmet({
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      xContentTypeOptions: true,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
        },
      },
    }),
    (_req, res, next) => {
      res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
      next();
    },
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, false);
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(Object.assign(new Error("CORS policy restriction: Origin not allowed"),{status:403}));
      },
      credentials: true,
      exposedHeaders:["X-Next-Cursor","Idempotency-Replayed"],
    }),
    express.json({ limit: "256kb" })
  );

  if (process.env.CLINICAL_ERASURE_ENABLED === "true") {
    if (!process.env.ERASURE_LEDGER_DATABASE_URL) throw new Error("Independent erasure ledger required");
    const {Pool} = require("pg");
    const {databaseOptions} = require("./config/databaseOptions");
    const {assertErasureLedgerApplied} = require("./services/erasureService");
    const primary = new URL(process.env.DATABASE_URL), external = new URL(process.env.ERASURE_LEDGER_DATABASE_URL);
    if (primary.host===external.host && primary.pathname===external.pathname) throw new Error("Independent ledger database required");

    const ledger = erasureLedger = new Pool({...databaseOptions(external.href),max:2,connectionTimeoutMillis:5000});
    app.set("erasureLedger",ledger);
    await assertErasureLedgerApplied(store,ledger);
    app.use("/api",asyncHandler(async (_req,res,next) => {
      try {await assertErasureLedgerApplied(store,ledger);next();}
      catch {res.status(503).json({error:"Patient privacy recovery check failed. Contact the hospital."});}
    }));
  }

  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      ...(store.query ? {store:new PostgresRateLimitStore(store,"api")} : {}),
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    ...(store.query ? {store:new PostgresRateLimitStore(store,"auth")} : {}),
    message: { error: "Too many authentication requests, please try again later" },
  });

  const envelopeEncryption = new EnvelopeEncryptionService(process.env.KMS_MASTER_KEY, store);
  if (process.env.NODE_ENV === "production" && envelopeEncryption.keyService) {
    const probe = crypto.randomBytes(32);
    try {
      const wrapped = await envelopeEncryption.keyService.wrap(probe);
      const unwrapped = await envelopeEncryption.keyService.unwrap(wrapped);
      try {
        if (!crypto.timingSafeEqual(probe, unwrapped)) throw new Error("Key-service round trip failed");
      } finally { unwrapped.fill(0); }
    } finally { probe.fill(0); }
  }
  const auditChain = new AuditChainService(store);
  const c = { store, chain, encryption, ipfs, envelopeEncryption, auditChain };

  app.get(["/health","/api/health"], (_q, s) =>
    s.json({
      status: "ok",
      chain: chain.enabled ? "backend-relay-configured" : "not-configured",
    })
  );

  app.get(["/ready","/api/ready"], async (_q, s) => {
    try {
      if (erasureLedger) await require("./services/erasureService").assertErasureLedgerApplied(store,erasureLedger);
      if (store.query) {
        // Bug #31 Fix: Verify migration table exists in database
        const result = await store.query("SELECT 1 FROM schema_migrations WHERE filename=$1", ["018_archive_exports.sql"]);
        if (!result.rowCount) throw new Error("Pending schema upgrade");
      }
      s.json({
        status: "ready",
        database: process.env.DATABASE_URL ? "postgres" : "local",
      });
    } catch (e) {
      s.status(503).json({ status: "not_ready", error: "Database or schema migrations not ready" });
    }
  });

  let localControls = {enrollment_paused:false, emergency_paused:false};
  async function controls() {
    if (!store.query) return localControls;
    return (await store.query("SELECT enrollment_paused,emergency_paused FROM service_controls WHERE id=1")).rows[0];
  }
  app.get("/api/operations/jobs", requireAuth, asyncHandler(async (req,res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    if (!store.query) return res.json([]);
    res.json((await store.query("SELECT id,topic,status,retries,available_at,last_error FROM outbox WHERE status<>'sent' ORDER BY created_at LIMIT 50")).rows);
  }));
  app.post("/api/operations/jobs/:id/retry",requireAuth,asyncHandler(async (req,res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    if (req.body?.deliveryReconciled!==true) return res.status(400).json({error:"Verify the provider delivery status before retrying"});
    const result = await store.transaction(async tx => {
      const job = (await tx.query("UPDATE outbox SET status='pending',retries=0,available_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND status='failed' RETURNING id",[req.params.id])).rows[0];
      if (job) await new AuditChainService(tx).appendAuditEvent({actor:req.user.wallet,action:"JOB_RETRY_APPROVED",details:{jobId:job.id}});
      return job;
    });
    if (!result) return res.sendStatus(409);
    res.json(result);
  }));
  app.get("/api/operations", requireAuth, asyncHandler(async (req,res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    const state = await controls();
    if (store.query) {
      const metrics = (await store.query("SELECT (SELECT count(*) FROM outbox WHERE status='pending') AS pending_jobs,(SELECT count(*) FROM outbox WHERE status='failed') AS failed_jobs,(SELECT count(*) FROM audit_logs WHERE action='EMERGENCY_BREAK_GLASS' AND created_at>now()-interval '1 hour') AS emergency_access_last_hour")).rows[0];
      return res.json({...state,metrics,waitingDatabaseConnections:store.pool?.waitingCount || 0});
    }
    res.json(state);
  }));
  app.put("/api/operations", requireAuth, asyncHandler(async (req,res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    const {enrollment_paused, emergency_paused} = req.body || {};
    if (typeof enrollment_paused !== "boolean" || typeof emergency_paused !== "boolean") return res.sendStatus(400);
    const persist = async (tx, audit) => {
      await audit.appendAuditEvent({actor:req.user.wallet,action:"SERVICE_CONTROLS_CHANGED",details:{enrollment_paused,emergency_paused}});
      await tx.query("UPDATE service_controls SET enrollment_paused=$1,emergency_paused=$2 WHERE id=1",[enrollment_paused,emergency_paused]);
    };
    if (store.transaction) await store.transaction(tx => persist(tx,new AuditChainService(tx)));
    else {
      await auditChain.appendAuditEvent({actor:req.user.wallet,action:"SERVICE_CONTROLS_CHANGED",details:{enrollment_paused,emergency_paused}});
      localControls = {enrollment_paused,emergency_paused};
    }
    res.json(await controls());
  }));
  app.use("/api", asyncHandler(async (req,res,next) => {
    if ((req.method === "POST" && req.path === "/patients") || req.path.startsWith("/emergency-access")) {
      const state = await controls();
      if ((req.path === "/patients" && state.enrollment_paused) ||
          (req.path.startsWith("/emergency-access") && state.emergency_paused &&
            (req.path === "/emergency-access" || req.path.startsWith("/emergency-access/critical/")))) {
        return res.status(503).json({error:"This service is temporarily paused. Follow the hospital's usual care procedure."});
      }
    }
    next();
  }));

  app.use("/api", require("./middleware/validateClinicalInput").validateClinicalInput);
  app.use("/api", require("./middleware/clinicalWriteGuard").clinicalWriteGuard(store));
  app.use("/api/auth", authLimiter, authRoutes({ store, otpProvider }));
  app.use("/api/patients", patientRoutes(createPatientController(c)));
  app.use("/api/doctors", doctorRoutes(createDoctorController(c)));
  app.use("/api/records", recordRoutes(createRecordController(c), store));
  app.use("/api/emergency-access", emergencyRoutes(createEmergencyController(c), store));
  app.use("/api/consents", consentRoutes(createConsentController(c)));
  app.use("/api/maintenance", require("./routes/maintenanceRoutes")({store}));
  app.use("/api/recovery", require("./routes/recoveryRoutes")({store}));
  app.use("/api/compliance", complianceRoutes(createComplianceController(c)));

  // B8: Global asynchronous error mapper
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || (err.name === "UnauthorizedError" ? 401 : 500);
    const isClientError = status >= 400 && status < 500;
    console.error(JSON.stringify({event:"request_error",requestId:req.requestId,status,name:err.name || "Error"}));
    res.status(status).json({
      error: isClientError ? err.message : "Internal server error",
      requestId: req.requestId,
    });
  });

  return app;
  } catch (error) {
    await erasureLedger?.end();
    if (ownsStore) await store.pool?.end();
    throw error;
  }
}

if (require.main === module) {
  createApp().then((app) => {
    const port = process.env.PORT || 4000;
    const server = app.listen(port, () => {
      console.log(`GoldenHour backend listening on port ${port}`);
    });
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      const timeout = setTimeout(() => process.exit(1), 15000);
      timeout.unref();
      server.close(async () => {
        try { await app.get("store")?.pool?.end(); await app.get("erasureLedger")?.end(); }
        catch { process.exitCode = 1; }
        finally { clearTimeout(timeout); }
      });
      server.closeIdleConnections();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }).catch(() => {
    console.error("Application startup failed. Check deployment configuration and dependency health.");
    process.exit(1);
  });
}

module.exports = { createApp };
