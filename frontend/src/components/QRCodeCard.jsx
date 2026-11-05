import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {saveOfflineCard,OFFLINE_CARD_KEY} from "../utils/offlineCard";
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
      try {localStorage.removeItem(OFFLINE_CARD_KEY);} catch {}
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
    {url && <><QRCodeSVG value={url} size={160} /><button onClick={() => window.print()}>Print card</button><button onClick={()=>{try{saveOfflineCard(url);setError("Card saved for 24 hours. Open Saved QR card, even offline. Signing out removes it.");}catch{setError("This browser could not save your card.");}}}>Save QR on this private device for 24 hours</button><p>Anyone using this device can see the saved QR. Do not save on a shared device.</p></>}
    <button disabled={busy} onClick={issue}>Issue replacement or first card</button>
    {error && <p role="alert">{error}</p>}
  </div></section>;
}
