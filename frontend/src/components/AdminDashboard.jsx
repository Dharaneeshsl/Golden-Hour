import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminDashboard() {
  const [providers, setProviders] = useState([]);
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => api.providers(status).then(setProviders).catch((e) => setError(e.message));

  useEffect(load, [status]);

  const verify = async (wallet) => {
    setBusy(wallet);
    try {
      await api.verifyProvider(wallet);
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="dashboard">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Provider verification</h2>
        </div>
        <span className="verified">● Admin</span>
      </div>
      <div className="panel">
        <div className="admin-tabs">
          <button className={status === "pending" ? "active" : ""} onClick={() => setStatus("pending")}>
            Pending
          </button>
          <button className={status === "verified" ? "active" : ""} onClick={() => setStatus("verified")}>
            Verified
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {providers.length === 0 ? (
          <p className="muted">No providers in this state.</p>
        ) : (
          providers.map((p) => (
            <div className="data-row" key={p.id}>
              <span>
                <b>{p.name}</b>
                <small>
                  {p.specialty} • {p.licenseNumber}
                </small>
                <small>{p.wallet}</small>
              </span>
              <b>{p.status}</b>
              {p.status === "pending" && (
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => verify(p.wallet)}
                >
                  {busy === p.wallet ? "Verifying…" : "Verify provider"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
