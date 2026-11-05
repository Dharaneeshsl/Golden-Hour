CREATE TABLE patient_data_holds (
  patient_id uuid PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  case_reference text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE erasure_receipts (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
