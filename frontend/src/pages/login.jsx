import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { api, setToken } from "../api";
import WalletConnectButton from "../components/WalletConnectButton";

// Canonical 3 accounts for local demo and MetaMask verification
const DEMO_ACCOUNTS = {
  admin: {
    label: "Admin Account (0xeF4C...749c)",
    wallet: "0xeF4C5fa4f9b9fFD908d5b422Dd1C3eEd3D9F749c",
  },
  doctor: {
    label: "Provider Account (0xa299...95Ee)",
    wallet: "0xa2994811542d34846a4Bdd67A1ff29c9514395Ee",
  },
  patient: {
    label: "Patient Account (0xA9A6...4504)",
    wallet: "0xA9A65f72a90f4D4021CB56CC70f21D84fD444504",
  },
};

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const authenticateWithSigner = async (targetWallet, signFn) => {
    setBusy(true);
    setError("");
    try {
      const nonce = await api.nonce(targetWallet);
      const signature = await signFn(nonce.message);
      const result = await api.verify({ wallet: targetWallet, signature });

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
        user.role === "admin"
          ? "/admin"
          : user.role === "doctor"
          ? "/doctor"
          : user.patientId
          ? "/patient/me"
          : "/onboarding"
      );
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

  const submitDemoAccount = async (role) => {
    const acc = DEMO_ACCOUNTS[role];
    if (!acc) return;

    await authenticateWithSigner(acc.wallet, async () => {
      return `DEMO_SIGNATURE_${acc.wallet}`;
    });
  };

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

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1.25rem", marginTop: "1rem" }}>
          <p className="eyebrow">Instant Demo Sign-In (No Extension Required)</p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              className="secondary"
              style={{ flex: 1, fontSize: "0.85rem" }}
              disabled={busy}
              onClick={() => submitDemoAccount("admin")}
            >
              🔑 Demo Admin (Acc 1)
            </button>
            <button
              className="secondary"
              style={{ flex: 1, fontSize: "0.85rem" }}
              disabled={busy}
              onClick={() => submitDemoAccount("doctor")}
            >
              🩺 Demo Provider (Acc 2)
            </button>
            <button
              className="secondary"
              style={{ flex: 1, fontSize: "0.85rem" }}
              disabled={busy}
              onClick={() => submitDemoAccount("patient")}
            >
              👤 Demo Patient (Acc 3)
            </button>
          </div>
        </div>

        {error && <p className="error" style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
      </div>
    </section>
  );
}
