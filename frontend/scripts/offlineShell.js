import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
export function offlineShell(){return {name:"goldenhour-offline-shell",closeBundle(){
 const output=path.resolve("dist");
 const assets=["/index.html","/manifest.webmanifest","/icon.svg","/icon-192.png","/icon-512.png",...fs.readdirSync(path.join(output,"assets")).filter(name=>/\.(js|css)$/.test(name)).map(name=>"/assets/"+name)];
 const hash=crypto.createHash("sha256");for(const name of assets)hash.update(fs.readFileSync(path.join(output,name.slice(1))));
 fs.writeFileSync(path.join(output,"sw.js"),`const SHELL_VERSION=${JSON.stringify("goldenhour-shell-"+hash.digest("hex").slice(0,16))};\nconst SHELL_ASSETS=${JSON.stringify(assets)};\n`+fs.readFileSync("scripts/service-worker.js","utf8"));
}};}
