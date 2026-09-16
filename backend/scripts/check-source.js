const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "../src");
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && file.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
      if (result.status !== 0) {
        failures.push({ file: path.relative(root, file), output: `${result.stdout || ""}${result.stderr || ""}`.trim() });
      }
    }
  }
}

walk(root);
if (failures.length) {
  for (const failure of failures) console.error(`Syntax error in ${failure.file}\n${failure.output}`);
  process.exit(1);
}
console.log(`Checked ${countFiles(root)} backend source JavaScript files.`);

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(file);
    else if (entry.isFile() && file.endsWith(".js")) count += 1;
  }
  return count;
}
