import {useEffect,useRef,useState} from "react";
import {useNavigate} from "react-router-dom";
import {cardUrl} from "../utils/offlineCard";
export default function CardScanner() {
  const video=useRef(null),generation=useRef(0),stream=useRef(null),timer=useRef(null);
  const [active,setActive]=useState(false),[error,setError]=useState(""),[manual,setManual]=useState("");
  const navigate=useNavigate();
  function stop(){generation.current++;clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setActive(false);}
  useEffect(()=>()=>{generation.current++;clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());},[]);
  function open(value){try {const url=cardUrl(value,window.location.origin);stop();navigate(url.pathname+url.hash);}catch(err){setError(err.message);}}
  async function start(){
    stop();setError("");const id=++generation.current;
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera unavailable. Use the phone camera app or paste the card link below.");
      const source=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:640}}});
      if(id!==generation.current){source.getTracks().forEach(track=>track.stop());return;}
      stream.current=source;setActive(true);video.current.srcObject=source;await video.current.play();
      const {default:decode}=await import("jsqr");
      const canvas=document.createElement("canvas"),context=canvas.getContext("2d",{willReadFrequently:true});
      const scan=()=>{
        if(id!==generation.current)return;
        if(video.current?.readyState>=2){const vw=video.current.videoWidth||640,vh=video.current.videoHeight||480;canvas.width=640;canvas.height=Math.max(1,Math.round(640*vh/vw));context.drawImage(video.current,0,0,canvas.width,canvas.height);const pixels=context.getImageData(0,0,canvas.width,canvas.height);const found=decode(pixels.data,pixels.width,pixels.height);if(found){open(found.data);if(id!==generation.current)return;}}
        timer.current=setTimeout(scan,250);
      };scan();
    }catch {if(id===generation.current){stop();setError("Camera access failed. Allow camera access in your browser, use your phone camera app, or paste the card link below.");}}
  }
  return <div className="panel"><h3>Scan hospital QR card</h3><video ref={video} muted playsInline aria-label="QR camera preview" hidden={!active} style={{width:"100%",maxWidth:480}}/>
    <button type="button" onClick={active?stop:start}>{active?"Stop camera":"Start camera"}</button>
    <form onSubmit={event=>{event.preventDefault();open(manual);}}><label>Or paste this hospital’s card link<input type="url" value={manual} onChange={event=>setManual(event.target.value)} required autoComplete="off"/></label><button>Open card</button></form>
    {error&&<p role="alert">{error}</p>}<p>No camera images leave this device.</p></div>;
}
