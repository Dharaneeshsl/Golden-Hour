const crypto = require("crypto");
const {requireAuth} = require("./authMiddleware");
const encryption = require("../services/encryptionService");
const {canonicalJsonStringify} = require("../controllers/recordController");

class RollbackResponse extends Error {}

function clinicalWriteGuard(store) {
  return function guard(req,res,next) {
    if (!["POST","PUT","PATCH","DELETE"].includes(req.method) ||
        !/^\/(patients|records|doctors|consents|emergency-access|recovery|compliance)(\/|$)/.test(req.path) ||
        !store.transaction) return next();
    return requireAuth(req,res,() => {
      execute(req,res,next).catch(next);
    });
  };

  async function execute(req,res,next) {
    const requestKey = req.headers["idempotency-key"];
    if (requestKey !== undefined && (typeof requestKey!=="string" || !/^[A-Za-z0-9_-]{16,128}$/.test(requestKey))) {
      return res.status(400).json({error:"Idempotency-Key must contain 16 to 128 letters, numbers, underscores or hyphens"});
    }
    const principal = [req.user.wallet,req.user.sessionId || "legacy",req.user.role].join(":");
    const route = req.method + " " + req.originalUrl;
    const payloadHash = crypto.createHash("sha256").update(canonicalJsonStringify(req.body ?? null)).digest("hex");
    const originalWrite = res.write;
    const originalEnd = res.end;
    let chunks = [];
    let completed;
    const responseReady = new Promise(resolve => {completed=resolve;});
    let captured = false;
    res.write = function(chunk,encoding,callback) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk,typeof encoding==="string" ? encoding : "utf8"));
      if (typeof encoding==="function") encoding();
      if (typeof callback==="function") callback();
      return true;
    };
    res.end = function(chunk,encoding) {
      if (captured) return this;
      captured = true;
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk,typeof encoding==="string" ? encoding : "utf8"));
      completed();
      return this;
    };
    let cached;
    let failed = false;
    try {
      await store.transaction(async tx => {
        await tx.query("SET LOCAL statement_timeout='10s'");
        await tx.query("SET LOCAL lock_timeout='5s'");
        if (requestKey) {
          await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify([principal,route,requestKey])]);
          const row = (await tx.query("SELECT * FROM mutation_requests WHERE principal=$1 AND route=$2 AND request_key=$3 AND expires_at>now()",[principal,route,requestKey])).rows[0];
          if (row) {
            if (row.payload_hash!==payloadHash) {
              res.status(409).json({error:"This idempotency key was used with a different request"});
              throw new RollbackResponse();
            }
            cached = encryption.decryptJson(row.encrypted_response);
            res.statusCode = row.status_code;
            return;
          }
        }
        next();
        await responseReady;
        if (res.statusCode>=400) throw new RollbackResponse();
        if (requestKey) {
          const encoded = encryption.encryptJson({
            body:Buffer.concat(chunks).toString("base64"),
            contentType:res.getHeader("Content-Type") || "application/json"
          });
          await tx.query(
            "INSERT INTO mutation_requests(principal,route,request_key,payload_hash,status_code,encrypted_response) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(principal,route,request_key) DO UPDATE SET payload_hash=EXCLUDED.payload_hash,status_code=EXCLUDED.status_code,encrypted_response=EXCLUDED.encrypted_response,expires_at=now()+interval '24 hours'",
            [principal,route,requestKey,payloadHash,res.statusCode,encoded]);
        }
      });
    } catch (error) {
      if (!(error instanceof RollbackResponse)) failed = true;
    } finally {
      res.write = originalWrite;
      res.end = originalEnd;
    }
    if (failed) {
      res.removeHeader("Content-Length");
      res.removeHeader("ETag");
      return res.status(503).json({error:"The change could not be confirmed. Retry with the same idempotency key."});
    }
    if (cached) {
      res.removeHeader("Content-Length");
      res.removeHeader("ETag");
      res.setHeader("Content-Type",cached.contentType);
      res.setHeader("Idempotency-Replayed","true");
      return res.end(Buffer.from(cached.body,"base64"));
    }
    return res.end(Buffer.concat(chunks));
  }
}
module.exports={clinicalWriteGuard};
