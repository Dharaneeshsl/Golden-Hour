-- Apply to a separate database with an independent backup lifecycle.
-- Application login needs SELECT only. Erasure operator needs SELECT and INSERT.
CREATE TABLE erasure_ledger (
  id uuid PRIMARY KEY,
  patient_id uuid UNIQUE NOT NULL,
  approval_reference_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION prevent_erasure_ledger_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Erasure ledger is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_erasure_ledger BEFORE UPDATE OR DELETE ON erasure_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_erasure_ledger_changes();
