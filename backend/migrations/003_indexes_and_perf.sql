-- Migration 003: Performance and security indexes for scale-up (B18)
CREATE INDEX IF NOT EXISTS idx_patients_lower_wallet ON patients (lower(wallet));
CREATE INDEX IF NOT EXISTS idx_providers_lower_wallet ON providers (lower(wallet));
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_provider_id ON audit_logs (provider_id);
