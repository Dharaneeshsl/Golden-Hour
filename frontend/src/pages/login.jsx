import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { api, setToken } from "../api";

export default function Login({ onLogin }) {
  const cardToken = useLocation().state?.cardToken;
  const navigate = useNavigate();
  const [mfa, setMfa] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(null);
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const finishLogin = async (result) => {
      setToken(result.token);
      let user = result.user;
      try {
        const mine = await api.me();
        user = { ...user, patientId: mine.patientId };
      } catch (err) {
        if (err.status !== 404 || err.code !== "PATIENT_NOT_REGISTERED") {
          console.error("Profile check error:", err);
        }
      }

      onLogin(user);
      navigate(
        user.role === "doctor" && /^[a-f0-9]{64}$/.test(cardToken) ? "/emergency/card#" + cardToken : user.role === "admin"
          ? "/admin"
          : user.role === "doctor"
          ? "/doctor"
          : user.patientId
          ? "/patient/me"
          : "/onboarding"
      );
  };

  const completeMfa = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.mfaComplete(mfa.mfaToken, code.trim());
      setCode("");
      setSetup(null);
      if (result.recoveryCodes) setRecovery(result);
      else await finishLogin(result);
    } catch (err) {setError(err.message);}
    finally {setBusy(false);}
  };

  const authenticateWithSigner = async (targetWallet, signFn) => {
    setBusy(true);
    setError("");
    try {
      const nonce = await api.nonce(targetWallet);
      const signature = await signFn(nonce.message);
      const result = await api.verify({ wallet: targetWallet, signature });

      if (result.mfaRequired) {
        setMfa(result);
        if (result.enrollmentRequired) setSetup(await api.mfaSetup(result.mfaToken));
      } else {
        await finishLogin(result);
      }

    } catch (err) {
      if (
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        (err.message && err.message.includes("rejected")) ||
        (err.message && err.message.includes("denied"))
      ) {
        setError("Message signature request was cancelled");
      } else {
        setError(err.message || "Authentication failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitMetaMask = async () => {
    if (!window.ethereum) {
      setError("MetaMask browser extension not detected");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const activeWallet = await signer.getAddress();
      setWallet(activeWallet);

      await authenticateWithSigner(activeWallet, async (msg) => {
        return await signer.signMessage(msg);
      });
    } catch (err) {
      if (
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        (err.message && err.message.includes("rejected")) ||
        (err.message && err.message.includes("denied"))
      ) {
        setError("Message signature request was cancelled");
      } else {
        setError(err.message || "Authentication failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const switchMetaMaskAccount = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const newAddress = await signer.getAddress();
      setWallet(newAddress);
    } catch (e) {
      console.warn("Account switch cancelled", e);
    }
  };
  if (recovery) return <section className="panel">
    <h2>Save your recovery codes</h2>
    <p>Store these codes somewhere private outside this device. Each code replaces an authenticator code once. Your wallet signature is still required.</p>
    <pre>{recovery.recoveryCodes.join("\n")}</pre>
    <button className="primary" onClick={() => finishLogin(recovery)}>I saved my codes. Continue</button>
  </section>;
  if (mfa) return <section className="panel">
    <h2>{setup ? "Set up your staff authenticator" : "Verify staff sign-in"}</h2>
    {setup && <div>
      <p>Scan this QR code with your authenticator app, then enter its six-digit code.</p>
      <QRCodeSVG value={setup.uri} size={180} />
      <p>Manual setup key</p><code>{setup.secret}</code>
    </div>}
    <form onSubmit={completeMfa}>
      <label htmlFor="mfa-code">Authenticator or recovery code</label>
      <input id="mfa-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" required />
      <button className="primary" disabled={busy}>Verify code</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <button onClick={() => {setMfa(null);setSetup(null);setCode("");setError("");}}>Restart sign-in</button>
  </section>;

  return (
    <section className="dashboard">
      <div className="panel login-panel">
        <p className="eyebrow">Cryptographic Authentication</p>
        <h2>Sign in to GoldenHour</h2>
        <p className="muted">
          Authentication uses an EIP-191 one-time nonce and wallet signature. Server verifies ownership and assigns role permissions.
        </p>

        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="primary"
              disabled={busy}
              onClick={submitMetaMask}
              style={{ flex: 2, padding: "0.85rem 1.25rem", fontSize: "0.95rem" }}
            >
              {busy ? "Verifying signature…" : "Sign Message with MetaMask"}
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={switchMetaMaskAccount}
              style={{ flex: 1, fontSize: "0.85rem" }}
              title="Switch active MetaMask account"
            >
              🔄 Switch Account
            </button>
          </div>
        </div>

        {error && <p className="error" style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
      </div>
    </section>
  );
}
