import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function PatientOnboarding({ onComplete }) {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState("patient"); // 'patient' | 'doctor'

  // Patient Fields
  const [name, setName] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");
  const [medications, setMedications] = useState("");

  // Provider Fields
  const [docName, setDocName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialty, setSpecialty] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const list = (value) =>
    value
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const submitPatient = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const patient = await api.registerPatient({
        profile: { name },
        critical: {
          bloodGroup,
          allergies: list(allergies),
          conditions: list(conditions),
          medications: list(medications),
        },
      });
      onComplete(patient);
      navigate("/patient/me");
    } catch (err) {
      setError(err.message || "Patient registration failed");
    } finally {
      setBusy(false);
    }
  };

  const submitProvider = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.registerProvider({
        name: docName,
        licenseNumber,
        specialty,
      });
      onComplete({ role: "doctor" });
      navigate("/doctor");
    } catch (err) {
      setError(err.message || "Provider registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dashboard">
      <div className="panel form-panel">
        <p className="eyebrow">Account Onboarding & Role Selection</p>
        <h2>Welcome to GoldenHour</h2>
        <p className="muted">
          Your wallet address is connected. Please select your account role to complete registration.
        </p>

        <div className="admin-tabs" style={{ marginBottom: "1.5rem" }}>
          <button
            type="button"
            className={selectedRole === "patient" ? "active" : ""}
            onClick={() => {
              setSelectedRole("patient");
              setError("");
            }}
          >
            👤 Register as Patient
          </button>
          <button
            type="button"
            className={selectedRole === "doctor" ? "active" : ""}
            onClick={() => {
              setSelectedRole("doctor");
              setError("");
            }}
          >
            🩺 Register as Healthcare Provider
          </button>
        </div>

        {selectedRole === "patient" ? (
          <form onSubmit={submitPatient}>
            <h3>Create Patient Emergency Profile</h3>
            <label>
              Full Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
              />
            </label>
            <label>
              Blood Group
              <input
                required
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                placeholder="O+"
              />
            </label>
            <label>
              Allergies
              <input
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Penicillin, Peanuts (Comma separated)"
              />
            </label>
            <label>
              Pre-existing Conditions
              <input
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="Asthma, Diabetes (Comma separated)"
              />
            </label>
            <label>
              Current Medications
              <input
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                placeholder="Albuterol, Insulin (Comma separated)"
              />
            </label>
            <button className="primary full" disabled={busy} style={{ marginTop: "1rem" }}>
              {busy ? "Registering Profile…" : "Create Patient Profile"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitProvider}>
            <h3>Register Healthcare Provider Account</h3>
            <p className="muted">
              Note: Provider registrations require administrator verification before clinical features are unlocked.
            </p>
            <label>
              Full Name
              <input
                required
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Dr. Sarah Jenkins, MD"
              />
            </label>
            <label>
              Medical License Number
              <input
                required
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="MD-88491-CA"
              />
            </label>
            <label>
              Medical Specialty
              <input
                required
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Trauma & Emergency Medicine"
              />
            </label>
            <button className="primary full" disabled={busy} style={{ marginTop: "1rem" }}>
              {busy ? "Submitting Registration…" : "Submit Provider Registration for Approval"}
            </button>
          </form>
        )}

        {error && <p className="error" style={{ color: "#ef4444", marginTop: "1rem" }}>{error}</p>}
      </div>
    </section>
  );
}
