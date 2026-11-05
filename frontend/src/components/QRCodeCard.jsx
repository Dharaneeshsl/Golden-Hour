import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api";

export default function QRCodeCard() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function issue() {
    setBusy(true);
    setError("");
    try {
      const {token} = await api.issueCard();
      setUrl(window.location.origin + "/emergency/card#" + token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="qr"><div>
    <b>Emergency QR Card</b>
    <p>Issuing a card replaces your previous card. Print the new card before leaving this page.</p>
    {url && <><QRCodeSVG value={url} size={160} /><button onClick={() => window.print()}>Print card</button></>}
    <button disabled={busy} onClick={issue}>Issue replacement or first card</button>
    {error && <p role="alert">{error}</p>}
  </div></section>;
}
