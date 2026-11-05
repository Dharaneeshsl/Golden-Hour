CREATE UNIQUE INDEX IF NOT EXISTS identities_provider_identifier ON identities(provider_type,identifier);
ALTER TABLE patients ADD COLUMN user_id uuid REFERENCES users(id);
ALTER TABLE providers ADD COLUMN user_id uuid REFERENCES users(id);
ALTER TABLE records ADD COLUMN doctor_user_id uuid REFERENCES users(id);
ALTER TABLE audit_logs ADD COLUMN actor_user_id uuid REFERENCES users(id);
ALTER TABLE audit_events ADD COLUMN actor_user_id uuid REFERENCES users(id);
CREATE TEMP TABLE legacy_identity_map ON COMMIT DROP AS
  SELECT wallet,gen_random_uuid() AS user_id FROM (
    SELECT lower(wallet) AS wallet FROM patients UNION SELECT lower(wallet) FROM providers
  ) subjects;
INSERT INTO users(id,full_name) SELECT user_id,'Legacy account' FROM legacy_identity_map;
INSERT INTO identities(id,user_id,provider_type,identifier)
  SELECT gen_random_uuid(),user_id,'wallet',wallet FROM legacy_identity_map
  ON CONFLICT(provider_type,identifier) DO NOTHING;
UPDATE patients p SET user_id=i.user_id FROM identities i WHERE i.provider_type='wallet' AND lower(p.wallet)=i.identifier;
UPDATE providers p SET user_id=i.user_id FROM identities i WHERE i.provider_type='wallet' AND lower(p.wallet)=i.identifier;
UPDATE records r SET doctor_user_id=i.user_id FROM identities i WHERE i.provider_type='wallet' AND lower(r.doctor_id)=i.identifier;
UPDATE audit_logs a SET actor_user_id=i.user_id FROM identities i WHERE i.provider_type='wallet' AND lower(a.actor)=i.identifier;
-- Audit hash contents are unchanged. The new identity reference is supplemental metadata.
-- Historical audit_events remain immutable. Join identities by actor when exporting old history.
CREATE TABLE phone_login_challenges (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX phone_challenge_expiry ON phone_login_challenges(expires_at);
CREATE INDEX patients_user_identity ON patients(user_id);
CREATE INDEX providers_user_identity ON providers(user_id);
