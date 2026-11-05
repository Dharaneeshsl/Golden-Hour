ALTER TABLE encrypted_objects ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX encrypted_object_age ON encrypted_objects(created_at);
