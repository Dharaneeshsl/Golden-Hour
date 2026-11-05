import {useEffect,useState} from "react";
import {API_URL} from "../config/runtime";
export default function Support(){
 const [status,setStatus]=useState("Checking service availability…");
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);fetch(API_URL+"/api/health",{cache:"no-store",signal:controller.signal}).then(response=>setStatus(response.ok?"The API is responding. This check does not guarantee all clinical features are available.":"Service is currently unavailable.")).catch(()=>setStatus("Unable to reach the service. Follow the hospital’s usual care procedure.")).finally(()=>clearTimeout(timer));return ()=>{controller.abort();clearTimeout(timer);};},[]);
 const email=import.meta.env.VITE_SUPPORT_EMAIL;
 return <section className="panel"><h1>Support and service status</h1><p role="status">{status}</p><p>This is not an emergency response service. Contact your treating team for urgent care. If access fails, follow the hospital’s usual care procedure.</p><h2>Report a problem or privacy concern</h2>{email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?<a href={"mailto:"+email}>Contact support</a>:<p>Contact the hospital registration desk or the hospital’s designated privacy and incident contact.</p>}<p>Share the time, affected feature and request reference. Do not send medical records, passwords or OTP codes.</p></section>;
}
