import {useEffect,useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import {Link} from "react-router-dom";
import {OFFLINE_CARD_KEY,readOfflineCard} from "../utils/offlineCard";
export default function OfflineCard() {
  const [card,setCard]=useState(()=>readOfflineCard());
  useEffect(()=>{const timer=setInterval(()=>setCard(readOfflineCard()),1000);return ()=>clearInterval(timer);},[]);
  return <section className="panel"><h1>Your offline QR card</h1>
    <p>This device stores only your QR credential for up to 24 hours. Clinical information requires a connected, authenticated hospital clinician. A replaced or revoked card will not work.</p>
    {card ? <><QRCodeSVG size={240} value={window.location.origin+"/emergency/card#"+card.token}/><p>Saved copy expires {new Date(card.expiresAt).toLocaleString()}.</p><button onClick={()=>{localStorage.removeItem(OFFLINE_CARD_KEY);setCard(null);}}>Remove saved card</button></> : <p role="status">No current saved card. Connect and issue a card in your patient portal to save one on a private device.</p>}
    <p>Follow the hospital’s usual care procedure if this service is unavailable.</p><Link to="/">Home</Link>
  </section>;
}
