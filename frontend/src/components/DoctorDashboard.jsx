import { useEffect, useState } from "react";
import { api } from "../api";
import { REASON_CODES } from "../config/i18n";

export default function DoctorDashboard({ wallet }) {
  const [patientId, setPatientId] = useState("");
  const [reasonCode, setReasonCode] = useState(REASON_CODES[0]?.code || "TRAUMA_UNRESPONSIVE");
  const [facility, setFacility] = useState("");
  const [justification, setJustification] = useState(
    ""
  );
  const [provider, setProvider] = useState(null);
  const [activeConsents, setActiveConsents] = useState([]);
  const [name, setName] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [recordType, setRecordType] = useState("Consultation");
  const [clinicalData, setClinicalData] = useState('{\n  "summary": "Routine consultation",\n  "notes": "Patient stable"\n}');
  const [records, setRecords] = useState([]);
  const [recordCursor, setRecordCursor] = useState(null);
  const [consentCursor, setConsentCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .providerAccess()
      .then((data) => {
        setProvider(data);
        if (data.status === "verified") {
          api.providerConsentsPage().then(page=>{setActiveConsents(page.items);setConsentCursor(page.nextCursor);}).catch(console.error);
        }
      })
      .catch((err) => {
        if (err.status === 403) {
          setProvider(false);
        } else {
          setError(err.message || "Failed to load provider profile");
        }
      });
  }, []);

  useEffect(() => {
    if (!selected?.expiresAt) return;
    const timer = setTimeout(() => setSelected(null), Math.max(0, Date.parse(selected.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [selected]);

  useEffect(() => {
    if (!selected || selected.expiresAt) return;
    let active = true;
    const check = async () => {
      try {await api.records(selected.patientId || patientId);}
      catch (err) {
        if (active && [401,403,404,410,503].includes(err.status)) {
          setSelected(null);
          setError("Record access is no longer available. Confirm consent before continuing.");
        }
      }
    };
    const interval = setInterval(check,15000);
    return () => {active=false;clearInterval(interval);};
  }, [selected?.id,selected?.expiresAt,patientId]);

  const register = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.registerProvider({ name, licenseNumber, specialty, invitationToken });
      setProvider({ provider: result, status: result.status });
      setNotice("Provider registration submitted. An administrator must verify it.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadRecordsFor = async (idToLoad) => {
    const target = idToLoad || patientId;
    if (!target) return;
    setBusy(true);
    setNotice("");
    try {
      const page = await api.recordsPage(target);
      setRecords(page.items);setRecordCursor(page.nextCursor);
      setSelected(null);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const viewRecord = async (id) => {
    setBusy(true);
    try {
      setSelected(await api.recordDetail(patientId, id));
      setError("");
    } catch (e) {
      setSelected(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addRecord = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = JSON.parse(clinicalData);
      await api.addRecord({ patientId, recordType, clinicalData: data });
      setNotice("Encrypted record created successfully.");
      await loadRecordsFor();
    } catch (e) {
      setError(e instanceof SyntaxError ? "Clinical data must be valid JSON" : e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEmergency = async () => {
    if (!patientId) {
      setError("Please select or enter a Patient ID for emergency access.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.emergency({ patientId, justification, reasonCode, facility });
      const critical = await api.emergencyCritical(result.accessId);
      setNotice(`Emergency access valid until ${new Date(critical.expiresAt).toLocaleTimeString()}.`);
      setSelected({
        expiresAt: critical.expiresAt,
        clinicalData: { critical: critical.critical },
        recordType: "Emergency Critical Context",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (provider === false) {
    return (
      <section className="dashboard">
        <form className="panel form-panel" onSubmit={register}>
          <p className="eyebrow">Provider Onboarding</p>
          <h2>Register as a Healthcare Provider</h2>
          <p className="muted" style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
            Account: {wallet}
          </p>
          <label>
            Full Name
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Jane Doe" />
          </label>
            <label>Hospital invitation code
              <input value={invitationToken} onChange={event => setInvitationToken(event.target.value)} autoComplete="off" />
            </label>
          <label>
            Medical License Number
            <input required value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="MD-123456" />
          </label>
          <label>
            Medical Specialty
            <input required value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Cardiology" />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "Submitting…" : "Submit Registration for Admin Approval"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Clinician Portal</p>
          <h2>Care Team Workspace</h2>
        </div>
        <span className="verified">● {provider?.status || "Pending"} Provider</span>
      </div>

      {provider?.status === "suspended" && (
        <div className="panel error-box">
          <h3>Account Suspended</h3>
          <p>Your provider account has been suspended by an administrator. Clinical actions and record access are disabled.</p>
        </div>
      )}

      {provider?.status === "pending" && (
        <div className="panel">
          <p className="muted">Your provider registration is awaiting administrator verification. Clinical actions remain locked.</p>
        </div>
      )}

      {provider?.status === "verified" && (
        <div className="doctor-grid">
          <div className="panel search-panel">
            <h3>Consented Patients</h3>
            {activeConsents.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                {activeConsents.map((c) => (
                  <button
                    key={c.id}
                    className="secondary full"
                    style={{ marginBottom: "0.5rem", textAlign: "left" }}
                    onClick={() => {
                      setPatientId(c.patientId);
                      loadRecordsFor(c.patientId);
                    }}
                  >
                    Patient {c.patientId.slice(0, 8)}... ({c.patientWallet?.slice(0, 8)}...)
                  </button>
                ))}
              </div>
            )}

            {consentCursor && <button disabled={busy} onClick={async () => {
              setBusy(true);
              try {const page=await api.providerConsentsPage(consentCursor);setActiveConsents(rows=>[...rows,...page.items]);setConsentCursor(page.nextCursor);}
              catch (err) {setError(err.message);}
              finally {setBusy(false);}
            }}>Load more consented patients</button>}
            <h3>Search Patient Records</h3>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              placeholder="Enter Patient ID"
            />
            <button className="secondary full" onClick={() => loadRecordsFor()} disabled={busy}>
              {busy ? "Loading..." : "Load Consented Records"}
            </button>

            {records.map((r) => (
              <div className="data-row" key={r.id}>
                <span>
                  <b>{r.recordType}</b>
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                </span>
                <button className="text-button" onClick={() => viewRecord(r.id)} disabled={busy}>
                  View
                </button>
              </div>
            ))}

            {recordCursor && <button disabled={busy} onClick={async () => {
              setBusy(true);
              try {const page=await api.recordsPage(patientId,recordCursor);setRecords(rows=>[...rows,...page.items]);setRecordCursor(page.nextCursor);}
              catch (err) {setError(err.message);}
              finally {setBusy(false);}
            }}>Load older records</button>}
            {selected && (
              <div className="record-detail" style={{ marginTop: "1rem", padding: "1rem", background: "rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                <h4>{selected.recordType}</h4>
                <pre>{JSON.stringify(selected.clinicalData, null, 2)}</pre>
              </div>
            )}
          </div>

          <div className="panel">
            <h3>Add Encrypted Record</h3>
            <form onSubmit={addRecord}>
              <label>
                Record Type
                <input required value={recordType} onChange={(e) => setRecordType(e.target.value)} />
              </label>
              <label>
                Clinical Data (JSON)
                <textarea
                  value={clinicalData}
                  onChange={(e) => setClinicalData(e.target.value)}
                  rows="7"
                  required
                />
              </label>
              <button className="primary full" disabled={busy}>
                {busy ? "Encrypting & saving..." : "Encrypt & Save Record"}
              </button>
            </form>

            <h3 className="subheading" style={{ marginTop: "2rem" }}>Emergency Access</h3>
            <label>
              Clinical Reason Code
              <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} style={{ marginBottom: "0.5rem" }}>
                {REASON_CODES.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </label>
            <label>
              Facility / Hospital
              <input value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="Hospital name" style={{ marginBottom: "0.5rem" }} />
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows="3"
              placeholder="Clinical justification..."
            />
            <button className="primary full" onClick={handleEmergency} disabled={busy}>
              Request Emergency Access
            </button>

            {notice && <p className="success">{notice}</p>}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
