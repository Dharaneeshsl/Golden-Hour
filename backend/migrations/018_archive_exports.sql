CREATE TABLE patient_archive_exports (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  principal text NOT NULL,
  revision integer NOT NULL,
  record_ids jsonb NOT NULL,
  audit_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes'
);
CREATE INDEX patient_archive_expiry ON patient_archive_exports(expires_at);
