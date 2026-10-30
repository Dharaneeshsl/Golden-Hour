-- Migration 004: Production Scale-Up Schema v2 (Phases 1-5)

-- 1. Users, Identities & Server-side Sessions
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    abha_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS identities (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_type TEXT NOT NULL, -- 'webauthn', 'phone_otp', 'abha', 'wallet'
    identifier TEXT NOT NULL,
    credential_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Organizations & Hospital Memberships
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    reg_number TEXT UNIQUE NOT NULL,
    org_type TEXT NOT NULL, -- 'hospital', 'trauma_center', 'ambulance_fleet', 'clinic'
    address JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'admin', 'trauma_doctor', 'emt_responder', 'nurse'
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, user_id)
);

-- 3. Granular Consent v2 with Receipts & Events
CREATE TABLE IF NOT EXISTS consents_v2 (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    provider_id UUID,
    org_id UUID REFERENCES organizations(id),
    purpose TEXT NOT NULL, -- 'EMERGENCY_TREATMENT', 'CONSULTATION', 'SECOND_OPINION'
    scope JSONB NOT NULL,  -- e.g. ["allergies", "medications", "records"]
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked', 'expired'
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS consent_events (
    id UUID PRIMARY KEY,
    consent_id UUID REFERENCES consents_v2(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'GRANTED', 'REVOKED', 'ACCESSED', 'EXPIRED'
    actor TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Break-Glass v2 Events & Post-Hoc Compliance Reviews
CREATE TABLE IF NOT EXISTS break_glass_events (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    org_id UUID REFERENCES organizations(id),
    reason_code TEXT NOT NULL, -- 'UNCONSCIOUS_TRAUMA', 'CARDIAC_ARREST', 'ANAPHYLAXIS', etc.
    justification TEXT NOT NULL,
    facility TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS break_glass_reviews (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES break_glass_events(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('approved', 'flagged', 'investigation_required')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Hash-Chained Append-Only Audit Log
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY,
    sequence_num BIGSERIAL,
    patient_id UUID,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash TEXT NOT NULL,
    current_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Key Registry for KMS Envelope Encryption & Crypto-Shredding
CREATE TABLE IF NOT EXISTS key_registry (
    key_id TEXT PRIMARY KEY,
    patient_id UUID NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
    encrypted_dek TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'shredded', 'rotated'
    rotated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Secure Attachment File Metadata with Scan Status
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    object_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    scan_status TEXT NOT NULL DEFAULT 'clean', -- 'clean', 'scanning', 'quarantined'
    checksum_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Transactional Outbox for Anchor/Worker Delivery
CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY,
    topic TEXT NOT NULL, -- 'BLOCKCHAIN_ANCHOR', 'SMS_NOTIFICATION', 'ABDM_DISPATCH'
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    retries INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. DPDP Act 2023 Data Subject Rights (DSR) & Grievance Tracking
CREATE TABLE IF NOT EXISTS data_subject_requests (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    request_type TEXT NOT NULL CHECK(request_type IN ('access', 'correction', 'erasure', 'grievance')),
    details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted', -- 'submitted', 'in_review', 'completed', 'rejected'
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Transient Rotatable QR Tokens
CREATE TABLE IF NOT EXISTS qr_tokens (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for high-throughput query performance
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_consents_v2_patient ON consents_v2(patient_id);
CREATE INDEX IF NOT EXISTS idx_consents_v2_status ON consents_v2(status);
CREATE INDEX IF NOT EXISTS idx_break_glass_patient ON break_glass_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_hash ON qr_tokens(token_hash);
