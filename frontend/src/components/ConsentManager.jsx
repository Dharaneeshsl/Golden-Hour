import { useEffect, useState } from "react";
import { api } from "../api";

export default function ConsentManager({ patientId }) {
  const [wallet, setWallet] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!patientId) return;
    api.consents(patientId).then(setItems).catch((e) => setError(e.message));
  };

  useEffect(load, [patientId]);

  const grant = async (e) => {
    e.preventDefault();
    if (!wallet.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.grantConsent(patientId, { wallet: wallet.trim(), scope: ["records"] });
      setWallet("");
      await load();
    } catch (e) {
      setError(e.message || "Failed to grant consent");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (providerWallet) => {
    setBusy(true);
    setError("");
    try {
      await api.revokeConsent(patientId, { wallet: providerWallet });
      await load();
    } catch (e) {
      setError(e.message || "Failed to revoke consent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel wide">
      <h3>Provider Consent Management</h3>
      <p className="muted">
        Grant verified clinicians access to view your encrypted medical records. Scope is restricted to medical records (`records`).
      </p>

      <form className="inline-form" onSubmit={grant} style={{ marginTop: "1rem" }}>
        <input
          required
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="Verified Provider Wallet (0x...)"
        />
        <button className="secondary" disabled={busy}>
          {busy ? "Processing…" : "Grant Consent"}
        </button>
      </form>

      {error && <p className="error" style={{ color: "#ef4444", marginTop: "0.5rem" }}>{error}</p>}

      <div style={{ marginTop: "1rem" }}>
        {items.length === 0 ? (
          <p className="muted">No active or historic consent grants.</p>
        ) : (
          items.map((x) => (
            <div className="data-row" key={x.id}>
              <span>
                <b>{x.providerName || "Clinician Provider"}</b>
                <small style={{ fontFamily: "monospace" }}>{x.providerWallet || "Wallet unavailable"}</small>
                <small>Granted: {new Date(x.grantedAt || x.granted_at).toLocaleString()}</small>
              </span>
              <b>{x.status.toUpperCase()}</b>
              {x.status === "active" && x.providerWallet && (
                <button className="text-button" disabled={busy} onClick={() => revoke(x.providerWallet)}>
                  Revoke Access
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </article>
  );
}
