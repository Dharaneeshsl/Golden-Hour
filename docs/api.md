# API notes

`GET /health` returns service status. `POST /api/patients` registers a demo patient using `{ wallet, profile, critical }`. `GET /api/patients/:id` returns only the emergency-safe subset. `POST /api/records` encrypts clinical data before creating a storage reference. `GET /api/records/:patientId` lists record metadata. `POST /api/emergency-access` records a justification and returns critical fields. `GET /api/audit/:patientId` lists access events.

The included server uses memory storage intentionally for a zero-setup demonstration. Replace it with a durable, access-controlled database before any real deployment.
