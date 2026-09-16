import { useState, useEffect } from "react";
import { useContract } from "../hooks/useContract";
import { shortenAddress } from "../utils/web3";

export default function WalletConnectButton({ onConnected }) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const { connect } = useContract();

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts && accounts[0]) {
          setAddress(accounts[0]);
          onConnected?.(accounts[0]);
        }
      }).catch(console.error);

      const handleAccountsChanged = (accounts) => {
        if (accounts && accounts.length > 0) {
          setAddress(accounts[0]);
          onConnected?.(accounts[0]);
        } else {
          setAddress("");
          onConnected?.("");
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        }
      };
    }
  }, []);

  const handle = async () => {
    setError("");
    try {
      const wallet = await connect();
      setAddress(wallet.address);
      onConnected?.(wallet.address);
    } catch (err) {
      if (
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        (err.message && err.message.includes("rejected")) ||
        (err.message && err.message.includes("denied"))
      ) {
        setError("Wallet connection request was cancelled");
      } else if (!window.ethereum) {
        setError("MetaMask browser extension not detected");
      } else {
        setError(err.message || "Failed to connect wallet");
      }
    }
  };

  const disconnect = (e) => {
    e.stopPropagation();
    setAddress("");
    onConnected?.("");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button className="wallet" onClick={handle}>
          {address ? `Connected: ${shortenAddress(address)}` : "Connect MetaMask Wallet"}
        </button>
        {address && (
          <button
            type="button"
            className="secondary"
            style={{ fontSize: "0.75rem", padding: "8px 12px" }}
            onClick={disconnect}
          >
            Disconnect
          </button>
        )}
      </div>
      {error && <small className="error" style={{ color: "#ef4444", display: "block", marginTop: "0.5rem" }}>{error}</small>}
    </div>
  );
}
