const crypto = require("crypto");
const { notificationService } = require("../services/notificationService");
const { canonicalizeWallet } = require("../config/db");
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

function createEmergencyController({ store, chain, envelopeEncryption }) {
  const canAudit = (req, patient) =>
    req.user.role === "admin" ||
    canonicalizeWallet(patient.wallet) === canonicalizeWallet(req.user.wallet);

  return {
    create: asyncHandler(async (req, res) => {
      const { patientId, justification, reasonCode, facility } = req.body || {};
      const patient = await store.patientById(patientId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      if (!justification || justification.trim().length < 10) {
        return res
          .status(400)
          .json({ error: "A detailed justification of at least 10 characters is required" });
      }

      if (req.provider && req.provider.status !== "verified") {
        return res.status(403).json({ error: "Provider account is not active or verified" });
      }

      const providerWallet = canonicalizeWallet(req.provider.wallet);
      // B7: Enforce provider rate limits on break-glass requests
      if (!checkProviderRateLimit(providerWallet)) {
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
        const hospitalFacility = facility || "Emergency Department";

        // B6: Encrypt the stored justification with Envelope Encryption
        let encryptedJustification = null;
        if (envelopeEncryption && envelopeEncryption.encryptField) {
          encryptedJustification = await envelopeEncryption.encryptField(
            patient.id,
            justification.trim(),
            { scope: "CRITICAL_ONLY", reasonCode: clinicalReason, facility: hospitalFacility }
          );
        }

        const event = await store.addAudit({
          id: crypto.randomUUID(),
          patientId,
          actor: providerWallet,
          action: "EMERGENCY_BREAK_GLASS",
          providerId: req.provider.id,
          metadata: {
            scope: "CRITICAL_ONLY",
            justification: justification.trim(),
            encryptedJustification,
            reasonCode: clinicalReason,
            facility: hospitalFacility,
          },
          expiresAt,
          timestamp: new Date().toISOString(),
        });

        // Record break-glass event in break_glass_events for institutional review
        if (store.addBreakGlassEvent) {
          await store.addBreakGlassEvent({
            id: event.id,
            patientId: patient.id,
            doctorId: req.provider.id,
            reasonCode: clinicalReason,
            justification: justification.trim(),
            facility: hospitalFacility,
            expiresAt,
            createdAt: event.timestamp,
          });
        }

        // Dispatch instant SMS alert
        notificationService.sendEmergencyAlert({
          patientId,
          patientPhone: patient.profile && patient.profile.phone,
          emergencyContact: patient.critical && patient.critical.emergencyContact,
          doctorName: req.provider && req.provider.name,
          facility: hospitalFacility,
          reasonCode: clinicalReason,
        }).catch((err) => console.error("Notification warning:", err.message));

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

      res.json({
        patientId: patient.id,
        critical: patient.critical,
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
      res.json(pending);
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

      const review = await store.addBreakGlassReview({
        id: crypto.randomUUID(),
        eventId: req.params.id,
        reviewerId: req.user.patientId || req.user.wallet,
        decision,
        notes,
      });

      res.status(201).json(review);
    }),
  };
}

module.exports = { createEmergencyController };
