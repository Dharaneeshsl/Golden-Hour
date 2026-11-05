import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const command=fileURLToPath(new URL("../node_modules/vite/bin/vite.js",import.meta.url));
const result=spawnSync(process.execPath,[command,"build"],{stdio:"inherit",env:{...process.env,RAYON_NUM_THREADS:process.env.RAYON_NUM_THREADS || "1"}});
if(result.error)console.error("Frontend build could not start.");
process.exitCode=result.status ?? 1;
