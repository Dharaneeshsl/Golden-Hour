const {build}=require("esbuild");
build({
  entryPoints:{app:"src/app.js",worker:"src/worker.js","worker-health":"src/worker-health.js",migrate:"src/config/migrate.js"},
  outdir:"dist",bundle:true,platform:"node",target:"node24",packages:"external",sourcemap:false
}).catch(()=>process.exitCode=1);
