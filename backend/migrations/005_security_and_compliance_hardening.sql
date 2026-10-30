-- Migration 005: Security, Encryption, and Audit Hardening
-- Adds consent expiry/purpose, audit immutability triggers, and performance indexes

-- 1. Extend patient_provider_consents with Purpose & Expiry (B17)
ALTER TABLE patient_provider_consents ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'EMERGENCY_TREATMENT';
ALTER TABLE patient_provider_consents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Performance indexes for high-throughput query lookup (B18)
CREATE INDEX IF NOT EXISTS idx_consents_active_lookup 
    ON patient_provider_consents(patient_id, provider_id, status);

CREATE INDEX IF NOT EXISTS idx_break_glass_reviews_event 
    ON break_glass_reviews(event_id);

CREATE INDEX IF NOT EXISTS idx_key_registry_patient 
    ON key_registry(patient_id, status);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash 
    ON sessions(token_hash);

-- 3. Enforce Immutability on Audit Events: Revoke UPDATE and DELETE via Trigger (Step 4 Audit)
CREATE OR REPLACE FUNCTION prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are append-only and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_events ON audit_events;
CREATE TRIGGER trg_immutable_audit_events
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();
