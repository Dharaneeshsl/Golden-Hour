import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export default function Login({onLogin}) {
  const cardToken=useLocation().state?.cardToken;
  const navigate=useNavigate();
  const [phone,setPhone]=useState("+91");
  const [challenge,setChallenge]=useState(null);
  const [mfa,setMfa]=useState(null);
  const [setup,setSetup]=useState(null);
  const [code,setCode]=useState("");
  const [recovery,setRecovery]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function finish(result) {
    setToken(true);
    let user=result.user;
    if (user.role!=="admin" && user.role!=="doctor") {
      try {const mine=await api.me();user={...user,patientId:mine.patientId,role:"patient"};}
      catch (err) {if (err.status!==404) throw err;}
    }
    onLogin(user);
    navigate(user.role==="doctor" && /^[a-f0-9]{64}$/.test(cardToken) ? "/emergency/card#"+cardToken :
      user.role==="admin" ? "/admin" : user.role==="doctor" ? "/doctor" : user.patientId ? "/patient/me" : "/onboarding");
  }
  async function submit(event) {
    event.preventDefault();setBusy(true);setError("");
    try {
      if (!challenge && !mfa) {
        setChallenge(await api.requestPhoneCode(phone));setCode("");
        return;
      }
      const result=mfa ? await api.mfaComplete(mfa.mfaToken,code.trim()) : await api.verifyPhoneCode(challenge.challengeId,code.trim());
      setCode("");
      if (result.mfaRequired) {
        setMfa(result);
        if (result.enrollmentRequired) setSetup(await api.mfaSetup(result.mfaToken));
      } else if (result.recoveryCodes) {setSetup(null);setRecovery(result);}
      else await finish(result);
    } catch (err) {setError(err.message);}
    finally {setBusy(false);}
  }
  if (recovery) return <section className="panel">
    <h2>Save your recovery codes</h2>
    <p>Keep these codes private and separate from your phone. Each code replaces your authenticator code once. Phone verification is still required.</p>
    <pre>{recovery.recoveryCodes.join("\n")}</pre>
    <button onClick={()=>finish(recovery)}>I saved my codes. Continue</button>
  </section>;
  return <section className="dashboard"><div className="panel login-panel">
    <h1>Sign in to GoldenHour</h1>
    <p>Use your mobile number. Hospital staff also verify an authenticator code.</p>
    {setup && <div><p>Scan with your authenticator app, then enter its six-digit code.</p>
      <QRCodeSVG value={setup.uri} size={180}/><p>Manual setup key</p><code>{setup.secret}</code></div>}
    <form onSubmit={submit}>
      {!challenge && !mfa ? <label htmlFor="phone-number">Mobile number
        <input id="phone-number" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} required pattern="\+91[6-9][0-9]{9}" />
      </label> : <label htmlFor="login-code">{mfa ? "Authenticator or recovery code" : "SMS verification code"}
        <input id="login-code" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} required />
      </label>}
      <button className="primary" disabled={busy}>{busy ? "Please wait…" : !challenge && !mfa ? "Request sign-in code" : "Verify code"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {(challenge || mfa) && <button onClick={()=>{setChallenge(null);setMfa(null);setSetup(null);setCode("");setError("");}}>Restart sign-in</button>}
  </div></section>;
}
