import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("providers"); // 'providers' | 'patients' | 'audits'
  const [providerStatus, setProviderStatus] = useState("pending");
  const [providers, setProviders] = useState([]);
  const [operations, setOperations] = useState(null);
  const [inviteWallet, setInviteWallet] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [recoveries, setRecoveries] = useState([]);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [deliveryReconciled, setDeliveryReconciled] = useState(false);
  const [dataRequests, setDataRequests] = useState([]);
  const [holdPatient, setHoldPatient] = useState("");
  const [holdReference, setHoldReference] = useState("");
  const [holdActive, setHoldActive] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [patients, setPatients] = useState([]);
  const [audits, setAudits] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const loadProviders = () =>
    api.providers(providerStatus).then(setProviders).catch((e) => setError(e.message));

  const loadPatients = () =>
    api.allPatients().then(setPatients).catch((e) => setError(e.message));

  const loadAudits = () =>
    api.recentAudits().then(setAudits).catch((e) => setError(e.message));

  useEffect(() => {
    setError("");
    if (activeTab === "providers") loadProviders();
    else if (activeTab === "patients") loadPatients();
    else if (activeTab === "operations") api.operations().then(setOperations).catch(e => setError(e.message));
    else if (activeTab === "recovery") api.recoveries().then(setRecoveries).catch(e => setError(e.message));
    else if (activeTab === "jobs") api.jobs().then(setJobs).catch(e => setError(e.message));
    else if (activeTab === "data") api.dataRequests().then(setDataRequests).catch(e => setError(e.message));
    else if (activeTab === "reviews") api.pendingReviews().then(setReviews).catch(e => setError(e.message));
    else if (activeTab === "audits") loadAudits();
  }, [activeTab, providerStatus]);

  const handleStatusChange = async (wallet, newStatus) => {
    setBusy(wallet);
    setError("");
    try {
      await api.updateProviderStatus(wallet, newStatus);
      await loadProviders();
    } catch (e) {
      setError(e.message || "Failed to update provider status");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">System Administration</p>
          <h2>Governance & Compliance Dashboard</h2>
        </div>
        <span className="verified">● Admin Access</span>
      </div>

      <div className="panel">
        <div className="admin-tabs" style={{ marginBottom: "1.5rem" }}>
          <button
            className={activeTab === "providers" ? "active" : ""}
            onClick={() => setActiveTab("providers")}
          >
            Provider Management
          </button>
          <button
            className={activeTab === "patients" ? "active" : ""}
            onClick={() => setActiveTab("patients")}
          >
            Patient Oversight
          </button>
          <button
            className={activeTab === "audits" ? "active" : ""}
            onClick={() => setActiveTab("audits")}
          >
            Emergency Access Audits
          </button>
          <button onClick={() => setActiveTab("recovery")}>Patient recovery</button>
          <button onClick={() => setActiveTab("jobs")}>Background jobs</button>
          <button onClick={() => setActiveTab("data")}>Patient data requests</button>
          <button onClick={() => setActiveTab("operations")}>Incident controls</button>
          <button onClick={() => setActiveTab("reviews")}>Pending reviews</button>
        </div>

        {error && <p className="error">{error}</p>}

        {activeTab === "recovery" && <section>
          <h3>Patient account recovery</h3>
          <p>Two different administrators must independently verify the patient through hospital procedure. Approval replaces the wallet and revokes prior sessions, cards and consent grants.</p>
          <label><input type="checkbox" checked={identityConfirmed} onChange={e => setIdentityConfirmed(e.target.checked)} /> I completed the hospital identity check for the request I am reviewing.</label>
          {recoveries.map(item => <article key={item.id}>
            <p>Case {item.proofReference} · {item.approvals.length} approvals</p>
            <p>Previous wallet {item.oldWallet}</p><p>New wallet {item.newWallet}</p>
            {["approve","reject"].map(decision => <button key={decision} disabled={!!busy || (decision==="approve" && !identityConfirmed)} onClick={async () => {
              setBusy(item.id);
              try {await api.reviewRecovery(item.id,decision);setRecoveries(await api.recoveries());setIdentityConfirmed(false);}
              catch (err) {setError(err.message);}
              finally {setBusy("");}
            }}>{decision==="approve" ? "Approve recovery" : "Reject recovery"}</button>)}
          </article>)}
        </section>}
        {activeTab === "jobs" && <section>
          <h3>Background jobs</h3>
          <p>Verify any external delivery with the provider before retrying a failed job.</p>
          <label><input type="checkbox" checked={deliveryReconciled} onChange={e => setDeliveryReconciled(e.target.checked)} /> I reconciled delivery with the provider.</label>
          {jobs.length===0 && <p>No outstanding jobs.</p>}
          {jobs.map(job => <article key={job.id}>
            <p>{job.topic} · {job.status} · {job.retries} attempts</p>
            {job.status==="failed" && <button disabled={!deliveryReconciled || !!busy} onClick={async () => {
              setBusy(job.id);
              try {await api.retryJob(job.id);setJobs(await api.jobs());setDeliveryReconciled(false);}
              catch (err) {setError(err.message);}
              finally {setBusy("");}
            }}>Retry reconciled job</button>}
          </article>)}
        </section>}
        {activeTab === "data" && <section>
          <h3>Patient data requests and retention holds</h3>
          <p>Clinical erasure requires an authorized hospital operator to review retention and approvals. This screen records retention holds.</p>
          {dataRequests.map(item => <p key={item.id}>{item.request_type} · {item.status} · Request {item.id} · Patient {item.patient_id}</p>)}
          <form onSubmit={async event => {
            event.preventDefault();setBusy("hold");setError("");
            try {await api.setRetentionHold(holdPatient,{active:holdActive,caseReference:holdReference});setHoldReference("");}
            catch (err) {setError(err.message);}
            finally {setBusy("");}
          }}>
            <label>Patient identifier<input value={holdPatient} onChange={e => setHoldPatient(e.target.value)} required /></label>
            <label>Retention case reference<input value={holdReference} onChange={e => setHoldReference(e.target.value)} required minLength={10} /></label>
            <label><input type="checkbox" checked={holdActive} onChange={e => setHoldActive(e.target.checked)} /> Retention hold active</label>
            <button disabled={!!busy}>Save retention decision</button>
          </form>
        </section>}
        {activeTab === "operations" && operations && <section>
          <h3>Incident controls</h3>
          <p>Pausing emergency access blocks new grants and further reads. Inform clinical staff to use the hospital’s usual care procedure.</p>
          {["enrollment_paused", "emergency_paused"].map(key => <button key={key} disabled={!!busy}
            onClick={async () => {
              setBusy(key);
              try { setOperations(await api.updateOperations({...operations,[key]:!operations[key]})); }
              catch (err) {setError(err.message);}
              finally {setBusy("");}
            }}>{key === "enrollment_paused" ? "Patient enrollment" : "Emergency access"} — {operations[key] ? "Paused · resume" : "Active · pause"}</button>)}
        </section>}
        {activeTab === "reviews" && <section>
          <h3>Review emergency access</h3>
          {reviews.length === 0 && <p>No pending reviews.</p>}
          {reviews.map(event => <article key={event.id}>
            <p>{event.facility} · {event.reasonCode || event.reason_code} · {new Date(event.createdAt || event.created_at).toLocaleString()}</p>
            <p>Access reference {event.id}</p>
            {["approved", "investigation_required"].map(decision =>
              <button key={decision} disabled={!!busy} onClick={async () => {
                setBusy(event.id);
                try {
                  await api.reviewEmergency(event.id, decision);
                  setReviews(rows => rows.filter(row => row.id !== event.id));
                } catch (err) { setError(err.message); }
                finally { setBusy(""); }
              }}>{decision === "approved" ? "Approve access" : "Request investigation"}</button>)}
          </article>)}
        </section>}

        {activeTab === "providers" && <form onSubmit={async event => {
          event.preventDefault(); setBusy("invitation"); setError("");
          try {setInvitation(await api.inviteStaff(inviteWallet));setInviteWallet("");}
          catch (err) {setError(err.message);}
          finally {setBusy("");}
        }}>
          <label htmlFor="invite-wallet">Invite a clinician wallet</label>
          <input id="invite-wallet" value={inviteWallet} onChange={event => setInviteWallet(event.target.value)} required />
          <button disabled={!!busy}>Create invitation</button>
          {invitation && <p>Share this one-use invitation with the clinician through your hospital’s approved channel. It expires in 24 hours. <code>{invitation.token}</code></p>}
        </form>}
        {activeTab === "providers" && (
          <div>
            <div className="admin-tabs" style={{ marginBottom: "1rem" }}>
              <button
                className={providerStatus === "pending" ? "active" : ""}
                onClick={() => setProviderStatus("pending")}
              >
                Pending Verification
              </button>
              <button
                className={providerStatus === "verified" ? "active" : ""}
                onClick={() => setProviderStatus("verified")}
              >
                Verified Providers
              </button>
              <button
                className={providerStatus === "suspended" ? "active" : ""}
                onClick={() => setProviderStatus("suspended")}
              >
                Suspended Providers
              </button>
            </div>

            {providers.length === 0 ? (
              <p className="muted">No providers in {providerStatus} state.</p>
            ) : (
              providers.map((p) => (
                <div className="data-row" key={p.id}>
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {p.specialty} • License #{p.licenseNumber}
                    </small>
                    <small style={{ fontFamily: "monospace" }}>{p.wallet}</small>
                  </span>
                  <b>{p.status.toUpperCase()}</b>

                  {p.status === "pending" && (
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => handleStatusChange(p.wallet, "verified")}
                    >
                      {busy === p.wallet ? "Verifying…" : "Approve Provider"}
                    </button>
                  )}

                  {p.status === "verified" && (
                    <button
                      className="secondary"
                      style={{ background: "#ef4444", color: "#fff" }}
                      disabled={!!busy}
                      onClick={() => handleStatusChange(p.wallet, "suspended")}
                    >
                      {busy === p.wallet ? "Updating…" : "Suspend Access"}
                    </button>
                  )}

                  {p.status === "suspended" && (
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => handleStatusChange(p.wallet, "verified")}
                    >
                      {busy === p.wallet ? "Updating…" : "Reactivate Provider"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "patients" && (
          <div>
            <h4>Registered Patient Identities ({patients.length})</h4>
            {patients.length === 0 ? (
              <p className="muted">No registered patients found.</p>
            ) : (
              patients.map((pt) => (
                <div className="data-row" key={pt.id}>
                  <span>
                    <b>Patient ID: {pt.id}</b>
                    <small style={{ fontFamily: "monospace" }}>Wallet: {pt.wallet}</small>
                    <small>Registered: {new Date(pt.created_at || pt.createdAt).toLocaleString()}</small>
                  </span>
                  <div>
                    <span className="badge">
                      {pt.profile?.fullName || pt.profile?.name || "Pseudonymous"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "audits" && (
          <div>
            <h4>Global Emergency Access Log</h4>
            {audits.length === 0 ? (
              <p className="muted">No emergency access events recorded.</p>
            ) : (
              audits.map((a) => (
                <div className="data-row" key={a.id}>
                  <span>
                    <b>{a.action}</b>
                    <small>Actor: {a.actor}</small>
                    <small>Patient: {a.patient_id || a.patientId}</small>
                    {a.metadata?.justification && (
                      <small style={{ color: "#f59e0b" }}>
                        Reason: {a.metadata.justification}
                      </small>
                    )}
                  </span>
                  <small>{new Date(a.created_at || a.timestamp).toLocaleString()}</small>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}
