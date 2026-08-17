const fs = require("fs");
const path = require("path");

class JsonStore {
  constructor(filePath = process.env.DATA_FILE || path.join(process.cwd(), ".data", "goldenhour.json")) {
    this.filePath = filePath;
    this.state = { patients: [], records: [], audit: [] };
    try { if (fs.existsSync(filePath)) this.state = { ...this.state, ...JSON.parse(fs.readFileSync(filePath, "utf8")) }; } catch { /* start clean when demo data is malformed */ }
  }
  save() { fs.mkdirSync(path.dirname(this.filePath), { recursive: true }); fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2)); }
  addPatient(patient) { this.state.patients.push(patient); this.save(); return patient; }
  patientById(id) { return this.state.patients.find((patient) => patient.id === String(id)); }
  patientByWallet(wallet) { return this.state.patients.find((patient) => patient.wallet.toLowerCase() === String(wallet).toLowerCase()); }
  addRecord(record) { this.state.records.push(record); this.save(); return record; }
  recordsForPatient(patientId) { return this.state.records.filter((record) => record.patientId === String(patientId)); }
  addAudit(event) { this.state.audit.push(event); this.save(); return event; }
  auditForPatient(patientId) { return this.state.audit.filter((event) => event.patientId === String(patientId)); }
}
module.exports = { JsonStore };
