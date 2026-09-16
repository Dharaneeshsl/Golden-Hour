const { ethers } = require("ethers");

const API = "http://localhost:4000";

const WALLETS = {
  admin: new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), // 0xf39F...
  doctor: new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"), // 0x7099...
  patient: new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"), // 0x3C44...
};

async function login(signer) {
  const nRes = await fetch(`${API}/api/auth/nonce/${signer.address}`);
  const { nonce, message } = await nRes.json();
  const signature = await signer.signMessage(message);
  const vRes = await fetch(`${API}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: signer.address, signature }),
  });
  const data = await vRes.json();
  if (!vRes.ok) throw new Error("Login failed: " + JSON.stringify(data));
  return data.token;
}

async function seed() {
  console.log("=== GoldenHour Live Demo Data Seeder ===");

  // 1. Authenticate tokens
  const adminToken = await login(WALLETS.admin);
  const docToken = await login(WALLETS.doctor);
  const patToken = await login(WALLETS.patient);
  console.log("✅ Authenticated 3 roles: Admin, Provider, Patient");

  const regPat = await fetch(`${API}/api/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patToken}` },
    body: JSON.stringify({
      profile: { fullName: "John Doe", age: 34, gender: "Male", phone: "+1-555-0199" },
      critical: { bloodGroup: "O+", allergies: ["Penicillin", "Peanuts"], conditions: ["Asthma"], emergencyContact: "+1-555-0122" },
    }),
  });
  let patData = await regPat.json();
  let patientId = patData.id;
  if (!patientId) {
    const meRes = await fetch(`${API}/api/patients/me`, {
      headers: { Authorization: `Bearer ${patToken}` },
    });
    const meData = await meRes.json();
    patientId = meData.patientId;
  }
  console.log("✅ Patient ID:", patientId);

  // 3. Register Doctor & Admin Verify Doctor
  const regDoc = await fetch(`${API}/api/doctors/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      name: "Dr. Marcus Vance, MD",
      licenseNumber: "MD-98421-CA",
      specialty: "Trauma & Emergency Care",
    }),
  });
  console.log("✅ Provider Registered (Status: 201/200):", regDoc.status);

  const verifyDoc = await fetch(`${API}/api/doctors/${WALLETS.doctor.address}/verify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log("✅ Provider Status Updated to Verified by Admin:", (await verifyDoc.json()).status);

  // 4. Grant Consent from Patient to Doctor
  const grantRes = await fetch(`${API}/api/consents/${patientId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patToken}` },
    body: JSON.stringify({ wallet: WALLETS.doctor.address }),
  });
  console.log("✅ Consent Granted from Patient to Provider:", grantRes.status);

  // 5. Doctor Adds Medical Records for Patient
  const r1 = await fetch(`${API}/api/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      patientId,
      recordType: "Consultation",
      clinicalData: {
        title: "Annual Cardiology & Vital Assessment",
        bp: "120/80",
        heartRate: 72,
        diagnosis: "Patient exhibits normal sinus rhythm. Cardiovascular health within optimal parameters.",
        recommendations: "Maintain current exercise regime and balanced diet.",
      },
    }),
  });
  console.log("✅ Clinical Record 1 (Consultation) Created & Encrypted:", (await r1.json()).id);

  const r2 = await fetch(`${API}/api/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      patientId,
      recordType: "Lab Results",
      clinicalData: {
        title: "Complete Blood Count & Lipid Panel",
        cholesterol: "185 mg/dL",
        hdl: "58 mg/dL",
        ldl: "110 mg/dL",
        triglycerides: "120 mg/dL",
        status: "All lab parameters normal",
      },
    }),
  });
  console.log("✅ Clinical Record 2 (Lab Results) Created & Encrypted:", (await r2.json()).id);

  // 6. Doctor Triggers Emergency Access (Break-Glass)
  const emgRes = await fetch(`${API}/api/emergency-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      patientId,
      justification: "Severe acute respiratory distress following vehicle collision. Instant critical allergy retrieval required.",
    }),
  });
  const emgData = await emgRes.json();
  console.log("✅ Emergency Break-Glass Triggered:", emgData.accessId);

  // 7. Doctor Views Critical Payload
  const critRes = await fetch(`${API}/api/emergency-access/critical/${emgData.accessId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const critPayload = await critRes.json();
  console.log("✅ Critical Emergency Payload Accessed:", critPayload.critical);

  // 8. Admin Verification Audit Log Fetch
  const auditsRes = await fetch(`${API}/api/emergency-access/recent/all`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const audits = await auditsRes.json();
  console.log(`✅ Global Emergency Access Audit Log Count: ${audits.length} events logged`);
  console.log("========================================");
}

seed().catch((err) => console.error("Seeding error:", err));
