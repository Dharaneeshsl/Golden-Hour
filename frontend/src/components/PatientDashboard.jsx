import { useEffect, useState } from "react";
import { api } from "../api";
import SummaryFreshness from "./SummaryFreshness";
import QRCodeCard from "./QRCodeCard";
import RecordTimeline from "./RecordTimeline";
import ConsentManager from "./ConsentManager";

export default function PatientDashboard({ patientId = "", wallet = "" }) {
  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [audit, setAudit] = useState([]);
  const [recordCursor, setRecordCursor] = useState(null);
  const [auditCursor, setAuditCursor] = useState(null);
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
  const [myRequests, setMyRequests] = useState([]);
  const [requestType, setRequestType] = useState("access");
  const [requestDetails, setRequestDetails] = useState("");
  const [requestReceipt, setRequestReceipt] = useState(null);
  const [downloadingFhir, setDownloadingFhir] = useState(false);

  useEffect(() => {api.myDataRequests().then(setMyRequests).catch(() => {});}, [patientId]);

  const downloadArchive = async () => {
    setBusy(true);
    setError("");
    try {
      const archive = await api.patientArchive();
      let cursor = archive.nextCursor;
      while (cursor) {
        const page = await api.patientArchive(cursor);
        if (page.patient.revision !== archive.patient.revision) throw new Error("The patient summary changed. Download the archive again.");
        archive.records.push(...page.records);
        archive.audit.push(...page.audit);
        cursor = page.nextCursor;
      }
      delete archive.nextCursor;
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:"application/json"}));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "goldenhour-patient-archive.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {setError(err.message);}
    finally {setBusy(false);}
  };

  const downloadFhirIPS = async () => {
    setDownloadingFhir(true);
    try {
      const bundle = await api.exportFhir(patientId);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FHIR-IPS-${patientId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("FHIR export failed: " + e.message);
    } finally {
      setDownloadingFhir(false);
    }
  };

  const load = () => {
    if (!patientId) return;
    let active = true;
    api
      .patient(patientId)
      .then(async (data) => {
        const [recordPage,auditPage] = await Promise.all([api.recordsPage(patientId),api.auditPage(patientId)]);
        if (active) {
          setPatient(data);
          setRecords(recordPage.items);setRecordCursor(recordPage.nextCursor);
          setAudit(auditPage.items);setAuditCursor(auditPage.nextCursor);
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

      await api.updatePatient(patientId, { critical: updatedCritical, revision: patient.revision });
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
    <section className="dashboard"><SummaryFreshness updatedAt={patient.summaryUpdatedAt || patient.createdAt} patient />
      <div className="section-heading">
        <div>
          <p className="eyebrow">Patient Dashboard</p>
          <h2>{patient.profile?.fullName || patient.profile?.name || `Patient ${patient.id}`}</h2>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button className="secondary" onClick={downloadFhirIPS} disabled={downloadingFhir} style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}>
            {downloadingFhir ? "Exporting..." : "📥 Export FHIR R4 (IPS)"}
          </button>
          <span className="verified">● Authenticated</span>
        </div>
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
                <b>{(critical.allergies || []).join(", ") || "Unknown"}</b>
              </div>
              <div className="data-row">
                <span>Known Conditions</span>
                <b>{(critical.conditions || []).join(", ") || "Unknown"}</b>
              </div>
              <div className="data-row">
                <span>Current Medications</span>
                <b>{(critical.medications || []).join(", ") || "Unknown"}</b>
              </div>
            </>
          )}
        </article>

        <article className="panel wide">
          <h3>Medical Records Timeline</h3>
          <button onClick={downloadArchive} disabled={busy}>Download my complete record archive</button>
          <RecordTimeline records={records} onView={viewRecord} />
          {recordCursor && <button disabled={busy} onClick={async () => {
            setBusy(true);
            try {const page=await api.recordsPage(patientId,recordCursor);setRecords(rows=>[...rows,...page.items]);setRecordCursor(page.nextCursor);}
            catch (err) {setError(err.message);}
            finally {setBusy(false);}
          }}>Load older records</button>}
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
          {auditCursor && <button disabled={busy} onClick={async () => {
            setBusy(true);
            try {const page=await api.auditPage(patientId,auditCursor);setAudit(rows=>[...rows,...page.items]);setAuditCursor(page.nextCursor);}
            catch (err) {setError(err.message);}
            finally {setBusy(false);}
          }}>Load older access history</button>}
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

        <article className="panel wide">
          <h3>Patient data requests</h3>
          {myRequests.map(item => <p key={item.id}>{item.request_type} · {item.status} · Reference {item.id}</p>)}
          <form onSubmit={async event => {
            event.preventDefault();setBusy(true);setError("");
            try {const result=await api.submitDataRequest({requestType,details:requestDetails});setRequestReceipt(result.dsr.id);setRequestDetails("");setMyRequests(await api.myDataRequests());}
            catch (err) {setError(err.message);}
            finally {setBusy(false);}
          }}>
            <label>Request type<select value={requestType} onChange={e => setRequestType(e.target.value)}>
              {["access","correction","grievance","erasure"].map(type => <option key={type} value={type}>{type}</option>)}
            </select></label>
            <label>Request details<textarea value={requestDetails} onChange={e => setRequestDetails(e.target.value)} maxLength={2000} /></label>
            <button disabled={busy}>Submit data request</button>
          </form>
          {requestReceipt && <p>Request recorded. Contact the hospital with reference {requestReceipt}.</p>}
        </article>
        <ConsentManager patientId={patient.id} />
      </div>
    </section>
  );
}
