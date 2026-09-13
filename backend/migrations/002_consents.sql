create table if not exists patient_provider_consents(
 id uuid primary key,
 patient_id uuid not null references patients(id) on delete cascade,
 provider_id uuid not null references providers(id) on delete cascade,
 status text not null check(status in('active','revoked')),
 scope jsonb not null default '["records"]'::jsonb,
 granted_at timestamptz not null,
 revoked_at timestamptz,
 unique(patient_id,provider_id)
);
create index if not exists idx_consent_patient_provider on patient_provider_consents(patient_id,provider_id,status);