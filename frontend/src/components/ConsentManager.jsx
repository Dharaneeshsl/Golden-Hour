import { useEffect, useState } from "react";
import { api } from "../api";

export default function ConsentManager({ patientId }) {
  const [wallet, setWallet] = useState("");
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!patientId) return;
    api.consentsPage(patientId).then(page=>{setItems(page.items);setCursor(page.nextCursor);}).catch((e) => setError(e.message));
  };

  useEffect(load, [patientId]);

  const grant = async (e) => {
    e.preventDefault();
    if (!wallet.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.grantConsent(patientId, { phone: wallet.trim(), scope: ["records"] });
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
        Choose a verified clinician who may view and add medical records. You can revoke this access.
      </p>

      <form className="inline-form" onSubmit={grant} style={{ marginTop: "1rem" }}>
        <input
          required
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="Clinician mobile number (+91…)"
        />
        <button className="secondary" disabled={busy}>
          {busy ? "Processing…" : "Grant Consent"}
        </button>
      </form>

      {error && <p className="error" style={{ color: "#ef4444", marginTop: "0.5rem" }}>{error}</p>}

      {cursor && <button disabled={busy} onClick={async () => {
        setBusy(true);
        try {const page=await api.consentsPage(patientId,cursor);setItems(rows=>[...rows,...page.items]);setCursor(page.nextCursor);}
        catch (err) {setError(err.message);}
        finally {setBusy(false);}
      }}>Load older consent grants</button>}
      <div style={{ marginTop: "1rem" }}>
        {items.length === 0 ? (
          <p className="muted">No active or historic consent grants.</p>
        ) : (
          items.map((x) => (
            <div className="data-row" key={x.id}>
              <span>
                <b>{x.providerName || "Clinician Provider"}</b>
                <small style={{ fontFamily: "monospace" }}>{x.providerWallet || "Account unavailable"}</small>
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
