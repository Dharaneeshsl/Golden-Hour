import CardScanner from "./CardScanner";
import SummaryFreshness from "./SummaryFreshness";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getToken } from "../api";
import { REASON_CODES } from "../config/i18n";

export default function EmergencyScanView({ initialPatientId = "", cardToken }) {
  const [patientId, setPatientId] = useState(initialPatientId);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [reasonCode, setReasonCode] = useState(REASON_CODES[0]?.code || "TRAUMA_UNRESPONSIVE");
  const [facility, setFacility] = useState("");
  const [justification, setJustification] = useState(
    ""
  );
  const [accessGrant, setAccessGrant] = useState(null);
  const [criticalData, setCriticalData] = useState(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accessGrant) return;
    const timer = setTimeout(() => {
      setCriticalData(null);
      setExpired(true);
    }, Math.max(0, Date.parse(accessGrant.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [accessGrant]);

  const token = getToken();

  const resetSession = () => {
    setAccessGrant(null);
    setCriticalData(null);
    setExpired(false);
    setError("");
  };

  const submitBreakGlass = async () => {
    if (!token) {
      setError("Clinician authentication required. Please connect your hospital staff account.");
      return;
    }
    if (!cardToken && !patientId.trim()) {
      setError("Please enter a valid Patient ID.");
      return;
    }
    if (justification.trim().length < 10) {
      setError("Please provide a detailed clinical justification (minimum 10 characters).");
      return;
    }

    setBusy(true);
    setError("");
    setExpired(false);
    try {
      const access = await api.emergency({ cardToken, identityConfirmed, patientId: patientId.trim(), justification, reasonCode, facility });
      setAccessGrant(access);
    } catch (err) {
      setError(err.message || "Failed to trigger emergency break-glass access");
    } finally {
      setBusy(false);
    }
  };

  const revealCriticalData = async () => {
    if (!accessGrant) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.emergencyCritical(accessGrant.accessId);
      if (Date.parse(data.expiresAt) > Date.now()) setCriticalData(data);
      else setExpired(true);
    } catch (err) {
      if (err.status === 410) {
        setExpired(true);
        setError("Emergency access session has expired (15-minute TTL elapsed).");
      } else {
        setError(err.message || "Failed to retrieve critical emergency data");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dashboard">
      <div className="emergency-banner">
        <span className="warning">!</span>
        <div>
          <b>Break-Glass Emergency Access</b>
          <p>
            Logged clinical access for life-threatening emergencies. Every break-glass trigger is
            recorded in the patient's access history. Access window automatically expires after 15 minutes.
          </p>
        </div>
      </div>

      {!token && (
        <div className="panel error-box">
          <h3>Authentication Required</h3>
          {cardToken && <Link to="/login" state={{cardToken}}>Sign in to open this card</Link>}
          <p>You must connect a hospital staff account to request emergency access.</p>
        </div>
      )}

      <div className="panel">
        <h3>Emergency Patient Lookup</h3>{!cardToken && <CardScanner />}
        {cardToken ? <label><input type="checkbox" checked={identityConfirmed} onChange={event => setIdentityConfirmed(event.target.checked)} /> I confirmed patient identity using hospital procedure.</label> : <><label>Patient ID</label>
        <input
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          placeholder="e.g. uuid-patient-id"
        /></>}

        <label>Clinical Reason Code</label>
        <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} style={{ marginBottom: "0.75rem", width: "100%", padding: "0.5rem" }}>
          {REASON_CODES.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>

        <label>Facility / Hospital</label>
        <input
          value={facility}
          onChange={(e) => setFacility(e.target.value)}
          placeholder="e.g. Trauma Care Center"
          style={{ marginBottom: "0.75rem" }}
        />

        <label>Clinical Justification</label>
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows="4"
          placeholder="Detailed emergency justification for auditing..."
        />

        <button
          className="primary"
          onClick={submitBreakGlass}
          disabled={busy || !token || (cardToken && !identityConfirmed)}
        >
          {busy ? "Verifying access…" : "Trigger Logged Emergency Access"}
        </button>

        {error && <p className="error" style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}

        {expired && (
          <div style={{ marginTop: "1rem" }}>
            <button className="secondary" onClick={resetSession}>
              🔄 Request New Emergency Access Session
            </button>
          </div>
        )}

        {accessGrant && !criticalData && !expired && (
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(16,185,129,0.1)", borderRadius: "8px" }}>
            <p className="success">
              Emergency break-glass session created! Valid until{" "}
              {new Date(accessGrant.expiresAt).toLocaleTimeString()}.
            </p>
            <button className="primary" onClick={revealCriticalData} disabled={busy}>
              {busy ? "Loading critical payload..." : "View Critical Patient Data →"}
            </button>
          </div>
        )}

        {criticalData && (
          <div style={{ marginTop: "1.5rem" }}>
            <p className="success">
              Critical medical context retrieved. Access expires at{" "}
              {new Date(criticalData.expiresAt).toLocaleTimeString()}.
            </p>
            <p>{criticalData.source}. Last updated {criticalData.summaryUpdatedAt ? new Date(criticalData.summaryUpdatedAt).toLocaleString() : "unknown"}.</p>
            <SummaryFreshness updatedAt={criticalData.summaryUpdatedAt} />
            <div className="critical-grid">
              <div>
                <span>Blood Group</span>
                <strong>{criticalData.critical?.bloodGroup || "Not provided"}</strong>
              </div>
              <div>
                <span>Allergies</span>
                {criticalData.provenance?.allergies && <small>{criticalData.provenance.allergies.source} · {new Date(criticalData.provenance.allergies.updatedAt).toLocaleString()}</small>}
                <strong>{(criticalData.critical?.allergies || []).join(", ") || "Unknown"}</strong>
              </div>
              <div>
                <span>Known Conditions</span>
                <strong>{(criticalData.critical?.conditions || []).join(", ") || "Unknown"}</strong>
              </div>
              <div>
                <span>Current Medications</span>
                <strong>{(criticalData.critical?.medications || []).join(", ") || "Unknown"}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
