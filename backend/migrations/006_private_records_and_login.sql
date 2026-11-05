CREATE TABLE login_challenges (
  wallet text PRIMARY KEY,
  message text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_challenge_expiry ON login_challenges(expires_at);
CREATE TABLE encrypted_objects (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL
);

ALTER TABLE sessions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE sessions ADD COLUMN wallet text;
-- Previous sessions lack a verified wallet binding. Require fresh authentication.
UPDATE sessions SET revoked_at = now() WHERE wallet IS NULL AND revoked_at IS NULL;
ALTER TABLE sessions ADD CONSTRAINT session_wallet_required CHECK (wallet IS NOT NULL OR revoked_at IS NOT NULL);
CREATE UNIQUE INDEX sessions_refresh_hash ON sessions(token_hash);

CREATE TABLE emergency_cards (
  patient_id uuid PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL
);

ALTER TABLE patients ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE patients ADD COLUMN summary_updated_at timestamptz;

ALTER TABLE break_glass_reviews ALTER COLUMN reviewer_id TYPE text;
CREATE UNIQUE INDEX one_emergency_review ON break_glass_reviews(event_id);

CREATE TABLE emergency_quota(wallet text PRIMARY KEY, requests integer NOT NULL, started_at timestamptz NOT NULL);
