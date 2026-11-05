CREATE TABLE staff_mfa (
  wallet text PRIMARY KEY,
  encrypted_secret jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  last_step bigint NOT NULL DEFAULT -1,
  recovery_hashes jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE mfa_challenges (
  id uuid PRIMARY KEY,
  wallet text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX mfa_challenges_expiry ON mfa_challenges(expires_at);
ALTER TABLE sessions ADD COLUMN mfa_verified boolean NOT NULL DEFAULT false;
