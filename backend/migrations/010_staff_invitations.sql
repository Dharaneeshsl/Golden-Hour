CREATE TABLE staff_invitations (
  id uuid PRIMARY KEY,
  wallet text NOT NULL,
  token_hash text UNIQUE NOT NULL,
  invited_by text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX staff_invitation_expiry ON staff_invitations(expires_at);
