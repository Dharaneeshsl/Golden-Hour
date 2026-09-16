import { QRCodeSVG } from "qrcode.react";

export default function QRCodeCard({ patientId }) {
  const url = `${window.location.origin}/emergency/${patientId}`;

  return (
    <div className="qr">
      <QRCodeSVG value={url} size={112} />
      <div>
        <b>Emergency QR Card</b>
        <p>Verified clinicians can scan this code to launch logged, break-glass critical access.</p>
        <button
          className="text-button"
          onClick={() => navigator.clipboard?.writeText(url)}
        >
          Copy Emergency Link →
        </button>
      </div>
    </div>
  );
}
