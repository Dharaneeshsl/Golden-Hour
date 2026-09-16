import { useState, useEffect } from "react";
import { Link, Route, Routes, useNavigate, useParams, Navigate } from "react-router-dom";
import PatientDashboard from "./components/PatientDashboard";
import DoctorDashboard from "./components/DoctorDashboard";
import EmergencyScanView from "./components/EmergencyScanView";
import PatientOnboarding from "./components/PatientOnboarding";
import AdminDashboard from "./components/AdminDashboard";
import Login from "./pages/login";
import WalletConnectButton from "./components/WalletConnectButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { setToken } from "./api";

function Home() {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">Every second matters</p>
        <h1>Medical context when <em>minutes matter.</em></h1>
        <p className="lead">
          Encrypted records, wallet-verified authentication, patient-controlled access, and immutable audit trails.
        </p>
        <div className="hero-actions">
          <Link className="primary" to="/login">Secure Sign In</Link>
          <Link className="secondary" to="/emergency">Emergency Access</Link>
        </div>
      </div>
    </section>
  );
}

function PatientRoute({ user }) {
  const { id } = useParams();
  if (!user) return <Navigate to="/login" replace />;
  if (id === "me" && !user.patientId) return <Navigate to="/onboarding" replace />;
  return <PatientDashboard patientId={id === "me" ? user.patientId : id} wallet={user.wallet} />;
}

function EmergencyRoute() {
  const { id } = useParams();
  return <EmergencyScanView initialPatientId={id || ""} />;
}

export default function App() {
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("goldenhour_user") || "null")
  );
  const navigate = useNavigate();

  useEffect(() => {
    const handleExpired = () => {
      logout();
    };
    window.addEventListener("goldenhour_session_expired", handleExpired);
    return () => window.removeEventListener("goldenhour_session_expired", handleExpired);
  }, []);

  const login = (next) => {
    localStorage.setItem("goldenhour_user", JSON.stringify(next));
    setUser(next);
  };

  const complete = (patient) => login({ ...user, patientId: patient.id });

  const logout = () => {
    setToken(null);
    localStorage.removeItem("goldenhour_user");
    setUser(null);
    navigate("/");
  };

  return (
    <ErrorBoundary>
      <div className="app">
        <header>
          <Link className="brand" to="/">
            <span className="mark">GH</span>
            <div>
              <strong>GoldenHour</strong>
              <small>Trusted Emergency History</small>
            </div>
          </Link>
          <nav>
            {user?.role === "admin" && <Link to="/admin">Admin Portal</Link>}
            {user && (user.patientId || user.role === "patient") && (
              <Link to="/patient/me">Patient Portal</Link>
            )}
            {user && (user.role === "doctor" || user.role === "admin") && (
              <Link to="/doctor">Provider Portal</Link>
            )}
            <Link to="/emergency">Emergency Access</Link>
          </nav>
          {user ? (
            <button className="wallet" onClick={logout}>Sign Out</button>
          ) : (
            <WalletConnectButton onConnected={() => navigate("/login")} />
          )}
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login onLogin={login} />} />
            <Route
              path="/onboarding"
              element={user ? <PatientOnboarding onComplete={complete} /> : <Navigate to="/login" />}
            />
            <Route path="/patient/:id" element={<PatientRoute user={user} />} />
            <Route
              path="/doctor"
              element={user ? <DoctorDashboard wallet={user.wallet} /> : <Navigate to="/login" />}
            />
            <Route
              path="/admin"
              element={user?.role === "admin" ? <AdminDashboard /> : <Navigate to="/login" />}
            />
            <Route path="/emergency" element={<EmergencyRoute />} />
            <Route path="/emergency/:id" element={<EmergencyRoute />} />
          </Routes>
        </main>

        <footer>
          <span>GoldenHour</span>
          <span>Wallet Verification • AES-256-GCM Encryption • Authenticated API</span>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
