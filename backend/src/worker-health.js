const fs=require("fs");
try {
  const time=Number(fs.readFileSync("/tmp/goldenhour-worker-health","utf8"));
  process.exit(Number.isFinite(time) && Date.now()-time<60000 ? 0 : 1);
} catch {process.exit(1);}
