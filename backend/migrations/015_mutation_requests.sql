CREATE TABLE mutation_requests (
  principal text NOT NULL,
  route text NOT NULL,
  request_key text NOT NULL,
  payload_hash text NOT NULL,
  status_code integer NOT NULL,
  encrypted_response jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  PRIMARY KEY(principal,route,request_key)
);
CREATE INDEX mutation_request_expiry ON mutation_requests(expires_at);
