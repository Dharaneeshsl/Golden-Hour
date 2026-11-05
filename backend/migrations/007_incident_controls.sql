CREATE TABLE service_controls (
  id integer PRIMARY KEY CHECK(id=1),
  enrollment_paused boolean NOT NULL DEFAULT false,
  emergency_paused boolean NOT NULL DEFAULT false
);
INSERT INTO service_controls(id) VALUES(1);
