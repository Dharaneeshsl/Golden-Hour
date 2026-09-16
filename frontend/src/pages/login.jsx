import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { api, setToken } from "../api";
import WalletConnectButton from "../components/WalletConnectButton";

// Hardhat test wallets for seamless local demo sign-in
const DEMO_ACCOUNTS = {
  admin: {
    label: "Admin Account",
    wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  doctor: {
    label: "Provider Account",
    wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  patient: {
    label: "Patient Account",
    wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
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
      setError("MetaMask browser extension not detected. Use Demo Accounts below to test without MetaMask.");
      return;
    }
    if (!wallet) {
      setError("Please click 'Connect MetaMask Wallet' first");
      return;
    }

    await authenticateWithSigner(wallet, async (msg) => {
      return await window.ethereum.request({
        method: "personal_sign",
        params: [msg, wallet],
      });
    });
  };

  const submitDemoAccount = async (role) => {
    const acc = DEMO_ACCOUNTS[role];
    if (!acc) return;

    await authenticateWithSigner(acc.wallet, async (msg) => {
      const signer = new ethers.Wallet(acc.privateKey);
      return await signer.signMessage(msg);
    });
  };

  return (
    <section className="dashboard">
      <div className="panel login-panel">
        <p className="eyebrow">Cryptographic Authentication</p>
        <h2>Sign in to GoldenHour</h2>
        <p className="muted">
          Authentication uses a EIP-191 one-time nonce and wallet signature. Server verifies ownership and assigns role permissions.
        </p>

        <div style={{ marginBottom: "1.5rem" }}>
          <WalletConnectButton onConnected={setWallet} />
          <button
            className="primary full"
            disabled={busy || !wallet}
            onClick={submitMetaMask}
            style={{ marginTop: "0.75rem" }}
          >
            {busy ? "Verifying signature…" : "Sign Message with MetaMask"}
          </button>
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
              🔑 Demo Admin
            </button>
            <button
              className="secondary"
              style={{ flex: 1, fontSize: "0.85rem" }}
              disabled={busy}
              onClick={() => submitDemoAccount("doctor")}
            >
              🩺 Demo Provider
            </button>
            <button
              className="secondary"
              style={{ flex: 1, fontSize: "0.85rem" }}
              disabled={busy}
              onClick={() => submitDemoAccount("patient")}
            >
              👤 Demo Patient
            </button>
          </div>
        </div>

        {error && <p className="error" style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
      </div>
    </section>
  );
}
