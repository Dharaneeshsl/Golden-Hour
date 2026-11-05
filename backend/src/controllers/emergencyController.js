const crypto = require("crypto");
const { canonicalizeWallet } = require("../config/db");
const { AuditChainService } = require("../services/auditChainService");
const { asyncHandler } = require("../utils/asyncHandler");

// In-memory provider break-glass rate limiting cache: providerWallet -> [timestamps]
const providerBreakGlassAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 5;

function checkProviderRateLimit(providerWallet) {
  const now = Date.now();
  let attempts = providerBreakGlassAttempts.get(providerWallet) || [];
  attempts = attempts.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (attempts.length >= MAX_ATTEMPTS_PER_WINDOW) {
    return false;
  }
  attempts.push(now);
  providerBreakGlassAttempts.set(providerWallet, attempts);
  return true;
}

function createEmergencyController({ store, chain, envelopeEncryption, auditChain }) {
  const canAudit = (req, patient) =>
    req.user.role === "admin" ||
    canonicalizeWallet(patient.wallet) === canonicalizeWallet(req.user.wallet);

  return {
    create: asyncHandler(async (req, res) => {
      const { cardToken, justification, reasonCode, facility } = req.body || {};
      const patientId = cardToken !== undefined
        ? (typeof cardToken === "string" && /^[a-f0-9]{64}$/.test(cardToken)
          ? await store.cardPatient(crypto.createHash("sha256").update(cardToken).digest("hex")) : null)
        : req.body?.patientId;
      if (cardToken && process.env.NODE_ENV==="production" && req.body.identityConfirmed!==true) {
        return res.status(400).json({error:"Confirm patient identity through the hospital procedure before accessing the scanned card"});
      }
      const patient = await store.patientById(patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (typeof justification !== "string" || justification.trim().length < 10) {
        return res
          .status(400)
          .json({ error: "A detailed justification of at least 10 characters is required" });
      }

      if (req.provider && req.provider.status !== "verified") {
        return res.status(403).json({ error: "Provider account is not active or verified" });
      }

      const providerWallet = canonicalizeWallet(req.provider.wallet);
      // B7: Enforce provider rate limits on break-glass requests
      const withinQuota = store.emergencyQuota ? await store.emergencyQuota(providerWallet, MAX_ATTEMPTS_PER_WINDOW) : checkProviderRateLimit(providerWallet);
      if (!withinQuota) {
        return res.status(429).json({
          error: "Break-glass rate limit exceeded. Maximum 5 emergency requests per 15 minutes.",
        });
      }

      try {
        let chainPatientId = chain.enabled ? await chain.patientId(patient.wallet) : null;
        if (chain.enabled && !chainPatientId) {
          throw new Error("Patient is not registered on chain");
        }
        if (chain.enabled) {
          await chain.triggerEmergency(
            chainPatientId,
            req.provider.wallet,
            justification.trim()
          );
        }

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const clinicalReason = reasonCode || "UNCONSCIOUS_TRAUMA";
        const hospitalFacility = process.env.HOSPITAL_NAME || facility || "Emergency Department";

        // B6: Encrypt the stored justification with Envelope Encryption
        let encryptedJustification = null;
        if (envelopeEncryption && envelopeEncryption.encryptField) {
          encryptedJustification = await envelopeEncryption.encryptField(
            patient.id,
            justification.trim(),
            { scope: "CRITICAL_ONLY", reasonCode: clinicalReason, facility: hospitalFacility }
          );
        }

        const persist = async (eventStore, eventAudit) => {
          const event = await eventStore.addAudit({
            id: crypto.randomUUID(),
            patientId,
            actor: providerWallet,
            action: "EMERGENCY_BREAK_GLASS",
            providerId: req.provider.id,
            metadata: {
              identityConfirmed: req.body.identityConfirmed === true,
              scope: "CRITICAL_ONLY",
              encryptedJustification,
              reasonCode: clinicalReason,
              facility: hospitalFacility,
            },
            expiresAt,
            timestamp: new Date().toISOString(),
          });

          // Persist to tamper-evident hash-chained audit log (Step 4 Audit)
          if (eventAudit && eventAudit.appendAuditEvent) {
            await eventAudit.appendAuditEvent({
              id: event.id,
              patientId: patient.id,
              actor: providerWallet,
              action: "EMERGENCY_BREAK_GLASS",
              details: { reasonCode: clinicalReason, facility: hospitalFacility, scope: "CRITICAL_ONLY" },
              timestamp: event.timestamp,
            });
          }

          // Record break-glass event in break_glass_events for institutional review
          if (eventStore.addBreakGlassEvent) {
            await eventStore.addBreakGlassEvent({
              id: event.id,
              patientId: patient.id,
              doctorId: req.provider.id,
              reasonCode: clinicalReason,
              justification: JSON.stringify(encryptedJustification),
              facility: hospitalFacility,
              expiresAt,
              createdAt: event.timestamp,
            });
          }

          return event;
        };
        const event = store.transaction
          ? await store.transaction(tx => persist(tx, new AuditChainService(tx)))
          : await persist(store, auditChain);

        res.json({
          accessId: event.id,
          patientId,
          expiresAt,
          audit: event,
        });
      } catch (e) {
        console.error("Emergency create error:", e);
        res.status(502).json({ error: "Emergency access trigger failed" });
      }
    }),

    critical: asyncHandler(async (req, res) => {
      // B5 Fix: Admin cannot read patient's clinical payload!
      if (req.user.role === "admin") {
        return res.status(403).json({ error: "Administrators cannot view clinical emergency payloads" });
      }

      const event = await store.auditById(req.params.accessId);
      if (!event || event.action !== "EMERGENCY_BREAK_GLASS") {
        return res.status(404).json({ error: "Emergency access event not found" });
      }

      const expiresAtTime = new Date(event.expiresAt).getTime();
      if (isNaN(expiresAtTime) || expiresAtTime <= Date.now()) {
        return res.status(410).json({ error: "Emergency access window has expired" });
      }

      const patient = await store.patientById(event.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const requestorWallet = canonicalizeWallet(req.user.wallet);
      const eventActorWallet = canonicalizeWallet(event.actor);

      if (eventActorWallet !== requestorWallet) {
        return res.status(403).json({ error: "Emergency access denied" });
      }

      const provider = await store.providerByWallet(requestorWallet);
      if (!provider || provider.status !== "verified") {
        return res.status(403).json({ error: "Provider status is no longer verified or active" });
      }

      // Log every view of the critical medical payload with proper providerId
      await store.addAudit({
        id: crypto.randomUUID(),
        patientId: patient.id,
        actor: requestorWallet,
        action: "EMERGENCY_CRITICAL_VIEW",
        providerId: provider.id,
        metadata: { accessId: req.params.accessId },
        timestamp: new Date().toISOString(),
      });

      if (auditChain && auditChain.appendAuditEvent) {
        await auditChain.appendAuditEvent({
          patientId: patient.id,
          actor: requestorWallet,
          action: "EMERGENCY_CRITICAL_VIEW",
          details: { accessId: req.params.accessId, providerId: provider.id },
        });
      }

      res.json({
        patientId: patient.id,
        critical: patient.critical,
        source: "Patient reported",
        provenance: patient.criticalProvenance,
        summaryUpdatedAt: patient.summaryUpdatedAt || patient.createdAt,
        expiresAt: event.expiresAt,
      });
    }),

    audit: asyncHandler(async (req, res) => {
      const patient = await store.patientById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!canAudit(req, patient)) {
        return res.status(403).json({ error: "Audit access denied" });
      }

      const audits = await store.auditForPatient(patient.id);
      res.json(audits);
    }),

    recentAudits: asyncHandler(async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin authorization required" });
      }
      const limit = parseInt(req.query.limit, 10) || 50;
      res.json(await store.recentAudits(limit));
    }),

    // B7: Review queue endpoints for post-hoc clinical review
    pendingReviews: asyncHandler(async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin or reviewer authorization required" });
      }
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const pending = await store.getPendingBreakGlassReviews(limit, offset);
      res.json(pending.map(({id, facility, reasonCode, reason_code, createdAt, created_at}) =>
        ({id, facility, reasonCode: reasonCode || reason_code, createdAt: createdAt || created_at})));
    }),

    submitReview: asyncHandler(async (req, res) => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin or reviewer authorization required" });
      }
      const { decision, notes } = req.body || {};
      const validDecisions = ["approved", "flagged", "investigation_required"];
      if (!decision || !validDecisions.includes(decision)) {
        return res.status(400).json({
          error: `Invalid decision. Allowed values: ${validDecisions.join(", ")}`,
        });
      }

      const event = await store.auditById(req.params.id);
      if (!event || event.action !== "EMERGENCY_BREAK_GLASS") return res.status(404).json({error:"Emergency event unavailable"});
      if (canonicalizeWallet(event.actor) === canonicalizeWallet(req.user.wallet)) return res.status(403).json({error:"Independent reviewer required"});
      const review = await store.addBreakGlassReview({
        id: crypto.randomUUID(),
        eventId: req.params.id,
        reviewerId: req.user.wallet,
        decision,
        notes,
      });

      if (!review) return res.status(409).json({error:"Already reviewed"});
      res.status(201).json(review);
    }),
  };
}

module.exports = { createEmergencyController };
