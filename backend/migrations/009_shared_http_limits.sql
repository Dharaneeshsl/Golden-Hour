CREATE TABLE http_rate_limits (
  namespace text NOT NULL,
  key_hash text NOT NULL,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(namespace,key_hash)
);
CREATE INDEX http_rate_limit_expiry ON http_rate_limits(expires_at);
