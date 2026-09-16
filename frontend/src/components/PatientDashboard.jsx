import { useEffect, useState } from "react";
import { api } from "../api";
import QRCodeCard from "./QRCodeCard";
import RecordTimeline from "./RecordTimeline";
import ConsentManager from "./ConsentManager";

export default function PatientDashboard({ patientId = "", wallet = "" }) {
  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [audit, setAudit] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    bloodGroup: "",
    allergies: "",
    conditions: "",
    medications: "",
  });
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!patientId) return;
    let active = true;
    api
      .patient(patientId)
      .then((data) => {
        if (active) {
          setPatient(data);
          setRecords(data.records || []);
          setAudit(data.audit || []);
          setEditForm({
            bloodGroup: data.critical?.bloodGroup || "",
            allergies: (data.critical?.allergies || []).join(", "),
            conditions: (data.critical?.conditions || []).join(", "),
            medications: (data.critical?.medications || []).join(", "),
          });
        }
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  };

  useEffect(load, [patientId]);

  const viewRecord = async (id) => {
    try {
      setDetail(await api.recordDetail(patientId, id));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updatedCritical = {
        bloodGroup: editForm.bloodGroup.trim(),
        allergies: editForm.allergies
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        conditions: editForm.conditions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        medications: editForm.medications
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      await api.updatePatient(patientId, { critical: updatedCritical });
      setEditing(false);
      load();
    } catch (err) {
      setError(err.message || "Failed to update profile");
    } finally {
      setBusy(false);
    }
  };

  if (error && !patient)
    return (
      <div className="panel">
        <h3>Patient Dashboard</h3>
        <p className="error">{error}</p>
      </div>
    );

  if (!patient)
    return (
      <div className="panel">
        <p className="muted">Loading patient profile and records...</p>
      </div>
    );

  const critical = patient.critical || {};

  return (
    <section className="dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Patient Dashboard</p>
          <h2>{patient.profile?.name || `Patient ${patient.id}`}</h2>
        </div>
        <span className="verified">● Authenticated</span>
      </div>

      <div className="grid">
        <article className="panel profile">
          <div className="avatar">GH</div>
          <h3>Patient Identity</h3>
          <p className="muted" style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
            {wallet || patient.wallet}
          </p>
          <div className="critical">
            <span>Blood Group</span>
            <strong>{critical.bloodGroup || "Not provided"}</strong>
          </div>
          <QRCodeCard patientId={patient.id} />
        </article>

        <article className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Critical Medical Context</h3>
            <button className="secondary" onClick={() => setEditing(!editing)}>
              {editing ? "Cancel" : "Edit Info"}
            </button>
          </div>

          {editing ? (
            <form onSubmit={handleProfileSave} style={{ marginTop: "1rem" }}>
              <label>Blood Group</label>
              <input
                value={editForm.bloodGroup}
                onChange={(e) => setEditForm({ ...editForm, bloodGroup: e.target.value })}
                placeholder="e.g. O+"
              />

              <label>Allergies (comma-separated)</label>
              <input
                value={editForm.allergies}
                onChange={(e) => setEditForm({ ...editForm, allergies: e.target.value })}
                placeholder="Penicillin, Peanuts"
              />

              <label>Conditions (comma-separated)</label>
              <input
                value={editForm.conditions}
                onChange={(e) => setEditForm({ ...editForm, conditions: e.target.value })}
                placeholder="Asthma, Diabetes Type II"
              />

              <label>Medications (comma-separated)</label>
              <input
                value={editForm.medications}
                onChange={(e) => setEditForm({ ...editForm, medications: e.target.value })}
                placeholder="Albuterol, Insulin"
              />

              <button className="primary" type="submit" disabled={busy} style={{ marginTop: "1rem" }}>
                {busy ? "Saving..." : "Save Critical Info"}
              </button>
            </form>
          ) : (
            <>
              <div className="data-row">
                <span>Allergies</span>
                <b>{(critical.allergies || []).join(", ") || "None recorded"}</b>
              </div>
              <div className="data-row">
                <span>Known Conditions</span>
                <b>{(critical.conditions || []).join(", ") || "None recorded"}</b>
              </div>
              <div className="data-row">
                <span>Current Medications</span>
                <b>{(critical.medications || []).join(", ") || "None recorded"}</b>
              </div>
            </>
          )}
        </article>

        <article className="panel wide">
          <h3>Medical Records Timeline</h3>
          <RecordTimeline records={records} onView={viewRecord} />
          {detail && (
            <div className="record-detail" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(255,255,255,0.05)", borderRadius: "8px" }}>
              <h4>{detail.recordType}</h4>
              <p className="muted">Uploaded: {new Date(detail.createdAt).toLocaleString()}</p>
              <pre>{JSON.stringify(detail.clinicalData, null, 2)}</pre>
            </div>
          )}
        </article>

        <article className="panel wide">
          <h3>Patient Audit History</h3>
          {audit.length === 0 ? (
            <p className="muted">No audit events logged yet.</p>
          ) : (
            audit.map((a) => (
              <div className="data-row" key={a.id}>
                <span>
                  <b>{a.action}</b>
                  <small>Actor: {a.actor}</small>
                  {a.metadata?.justification && (
                    <small style={{ color: "#f59e0b" }}>Reason: {a.metadata.justification}</small>
                  )}
                </span>
                <small>{new Date(a.created_at || a.timestamp).toLocaleString()}</small>
              </div>
            ))
          )}
        </article>

        <ConsentManager patientId={patient.id} />
      </div>
    </section>
  );
}
