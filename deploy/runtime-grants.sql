-- Run as the migration owner after migration on the dedicated hospital database.
-- psql -v runtime_role=YOUR_EXISTING_RUNTIME_ROLE -f deploy/runtime-grants.sql
\set ON_ERROR_STOP on
BEGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_challenges TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON staff_mfa TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON http_rate_limits TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON staff_invitations TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON patient_recovery_requests TO :"runtime_role";
GRANT DELETE ON emergency_cards TO :"runtime_role";
GRANT UPDATE(expires_at) ON audit_logs TO :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, UPDATE ON service_controls TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON emergency_quota TO :"runtime_role";
GRANT SELECT ON schema_migrations TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON patients, providers, patient_provider_consents, sessions, emergency_cards, key_registry, outbox TO :"runtime_role";
GRANT SELECT, INSERT, DELETE, UPDATE ON login_challenges TO :"runtime_role";
GRANT SELECT, INSERT ON records, encrypted_objects, audit_logs, audit_events, break_glass_events, break_glass_reviews, data_subject_requests TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
COMMIT;
