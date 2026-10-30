const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function getJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (file.endsWith(".js") && !file.endsWith(".min.js")) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcDir = path.resolve(__dirname, "src");
const testDir = path.resolve(__dirname, "test");
const allFiles = [...getJsFiles(srcDir), ...getJsFiles(testDir)];

console.log(`Auditing and syntax-checking ${allFiles.length} backend source & test files...`);

for (const filePath of allFiles) {
  try {
    execSync(`"${process.execPath}" --check "${filePath}"`, { stdio: "pipe" });
  } catch (err) {
    console.error(`Syntax error in ${filePath}:`, err.message);
    process.exit(1);
  }
}

console.log(`Syntax check passed across all ${allFiles.length} backend files`);
