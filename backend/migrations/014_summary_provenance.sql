ALTER TABLE patients ADD COLUMN critical_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
