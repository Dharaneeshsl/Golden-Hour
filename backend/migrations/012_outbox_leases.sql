ALTER TABLE outbox ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE outbox ADD COLUMN lease_until timestamptz;
ALTER TABLE outbox ADD COLUMN lease_token uuid;
ALTER TABLE outbox ADD COLUMN last_error text;
CREATE INDEX outbox_claim ON outbox(status,available_at,created_at);
