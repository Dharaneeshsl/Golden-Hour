import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("providers"); // 'providers' | 'patients' | 'audits'
  const [providerStatus, setProviderStatus] = useState("pending");
  const [providers, setProviders] = useState([]);
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
        </div>

        {error && <p className="error">{error}</p>}

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
