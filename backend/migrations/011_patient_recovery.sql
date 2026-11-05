CREATE TABLE patient_recovery_requests (
  id uuid PRIMARY KEY,
  old_wallet text NOT NULL,
  new_wallet text NOT NULL,
  encrypted_reference jsonb NOT NULL,
  approvals jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','completed','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE INDEX patient_recovery_request_owner ON patient_recovery_requests(new_wallet,created_at);
