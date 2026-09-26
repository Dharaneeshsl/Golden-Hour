const { execSync } = require("child_process");
const path = require("path");

const files = [
  "src/app.js",
  "src/config/db.js",
  "src/config/migrate.js",
  "src/config/authConfig.js",
  "src/config/contractConfig.js",
  "src/controllers/patientController.js",
  "src/controllers/doctorController.js",
  "src/controllers/consentController.js",
  "src/controllers/recordController.js",
  "src/controllers/emergencyController.js",
  "src/middleware/authMiddleware.js",
  "src/middleware/roleCheck.js",
  "src/routes/authRoutes.js",
  "src/routes/consentRoutes.js",
  "src/routes/doctorRoutes.js",
  "src/routes/emergencyRoutes.js",
  "src/routes/patientRoutes.js",
  "src/routes/recordRoutes.js",
  "src/services/chainService.js",
  "src/services/ipfsService.js",
  "src/services/encryptionService.js"
];

for (const f of files) {
  const filePath = path.resolve(__dirname, f);
  execSync(`"${process.execPath}" --check "${filePath}"`, { stdio: "inherit" });
}

console.log("Syntax check passed across all backend files");
