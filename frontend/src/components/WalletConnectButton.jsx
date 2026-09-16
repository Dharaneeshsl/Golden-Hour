import { useState } from "react";
import { useContract } from "../hooks/useContract";
import { shortenAddress } from "../utils/web3";

export default function WalletConnectButton({ onConnected }) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const { connect } = useContract();

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

  return (
    <div>
      <button className="wallet" onClick={handle}>
        {address ? `Connected: ${shortenAddress(address)}` : "Connect MetaMask Wallet"}
      </button>
      {error && <small className="error" style={{ color: "#ef4444", display: "block", marginTop: "0.5rem" }}>{error}</small>}
    </div>
  );
}
