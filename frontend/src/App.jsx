import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Link, Route, Routes, useNavigate, useParams, Navigate } from "react-router-dom";
import WalletConnectButton from "./components/WalletConnectButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { fullLogoutCleanup } from "./utils/session";

const PatientDashboard = lazy(() => import("./components/PatientDashboard"));
const DoctorDashboard = lazy(() => import("./components/DoctorDashboard"));
const EmergencyScanView = lazy(() => import("./components/EmergencyScanView"));
const PatientOnboarding = lazy(() => import("./components/PatientOnboarding"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const Login = lazy(() => import("./pages/login"));

function Home({ user }) {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">Every second matters</p>
        <h1>Medical context when <em>minutes matter.</em></h1>
        <p className="lead">
          Encrypted records, wallet-verified authentication, patient-controlled access, and logged access history.
        </p>
        <div className="hero-actions">
          {!user ? (
            <Link className="primary" to="/login">Sign In / Register</Link>
          ) : user.role === "admin" ? (
            <Link className="primary" to="/admin">Go to Admin Portal</Link>
          ) : user.role === "doctor" ? (
            <Link className="primary" to="/doctor">Go to Provider Portal</Link>
          ) : (
            <Link className="primary" to={user.patientId ? "/patient/me" : "/onboarding"}>
              {user.patientId ? "Go to Patient Portal" : "Complete Patient Onboarding"}
            </Link>
          )}
          <Link className="secondary" to="/emergency">Emergency Access</Link>
        </div>
      </div>
    </section>
  );
}

function PatientRoute({ user }) {
  const { id } = useParams();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "doctor") return <Navigate to="/doctor" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (id === "me" && !user.patientId) return <Navigate to="/onboarding" replace />;
  return <PatientDashboard patientId={id === "me" ? user.patientId : id} wallet={user.wallet} />;
}

function DoctorRoute({ user }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "doctor" && user.role !== "admin") {
    return <Navigate to={user.patientId ? "/patient/me" : "/onboarding"} replace />;
  }
  return <DoctorDashboard wallet={user.wallet} />;
}

function AdminRoute({ user }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") {
    return <Navigate to={user.role === "doctor" ? "/doctor" : user.patientId ? "/patient/me" : "/login"} replace />;
  }
  return <AdminDashboard />;
}

function EmergencyRoute() {
  const { id } = useParams();
  return <EmergencyScanView initialPatientId={id === "card" ? "" : id || ""} cardToken={id === "card" ? window.location.hash.slice(1) : undefined} />;
}

export default function App() {
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("goldenhour_user") || "null")
  );
  const navigate = useNavigate();
  const loggingOutRef = useRef(false);
  const sessionGen = useRef(0);
  const ignoreEmptyAccountsUntil = useRef(0);

  const login = (next) => {
    sessionGen.current += 1;
    loggingOutRef.current = false;
    ignoreEmptyAccountsUntil.current = Date.now() + 2000;
    localStorage.setItem("goldenhour_user", JSON.stringify(next));
    setUser(next);
  };

  const complete = (payload = {}) =>
    login({
      ...user,
      ...payload,
      role: payload.role || user?.role,
      patientId: payload.id ?? payload.patientId ?? user?.patientId ?? null,
    });

  const logout = () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    const gen = sessionGen.current;
    setUser(null);
    void fullLogoutCleanup().finally(() => {
      if (sessionGen.current !== gen) return;
      navigate("/login");
    });
  };

  useEffect(() => {
    const handleExpired = () => {
      logout();
    };
    window.addEventListener("goldenhour_session_expired", handleExpired);

    const handleAccountsChanged = (accounts) => {
      if (!user || loggingOutRef.current) return;
      if (!accounts || accounts.length === 0) {
        if (Date.now() < ignoreEmptyAccountsUntil.current) return;
        logout();
        return;
      }
      const newAddress = accounts[0].toLowerCase();
      const currentAddress = (user.wallet || "").toLowerCase();
      if (newAddress !== currentAddress) {
        logout();
      }
    };

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
    }

    return () => {
      window.removeEventListener("goldenhour_session_expired", handleExpired);
      if (window.ethereum && window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, [user]);

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
            {user?.role === "admin" && (
              <Link to="/admin">🔑 Admin Portal</Link>
            )}
            {user?.role === "doctor" && (
              <Link to="/doctor">🩺 Provider Portal</Link>
            )}
            {user?.role === "patient" && (
              user.patientId ? (
                <Link to="/patient/me">👤 Patient Portal</Link>
              ) : (
                <Link to="/onboarding" style={{ color: "#10b981", fontWeight: "bold" }}>
                  📝 Complete Onboarding
                </Link>
              )
            )}
            {user?.role === "unregistered" && (
              <Link to="/onboarding" style={{ color: "#10b981", fontWeight: "bold" }}>
                📝 Account Onboarding
              </Link>
            )}
            <Link to="/emergency">🚨 Emergency Access</Link>
          </nav>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span className="badge" style={{ textTransform: "uppercase", fontSize: "0.75rem" }}>
                {user.role}
              </span>
              <button className="logout-btn" onClick={logout}>
                🚪 Disconnect & Logout
              </button>
            </div>
          ) : (
            <WalletConnectButton onConnected={() => navigate("/login")} />
          )}
        </header>

        <main>
          <Suspense fallback={<p role="status">Loading your workspace…</p>}>
          <Routes>
            <Route path="/" element={<Home user={user} />} />
            <Route
              path="/login"
              element={
                user ? (
                  <Navigate
                    to={
                      user.role === "admin"
                        ? "/admin"
                        : user.role === "doctor"
                        ? "/doctor"
                        : user.patientId
                        ? "/patient/me"
                        : "/onboarding"
                    }
                    replace
                  />
                ) : (
                  <Login onLogin={login} />
                )
              }
            />
            <Route
              path="/onboarding"
              element={user ? <PatientOnboarding onComplete={complete} /> : <Navigate to="/login" />}
            />
            <Route path="/patient/:id" element={<PatientRoute user={user} />} />
            <Route path="/doctor" element={<DoctorRoute user={user} />} />
            <Route path="/admin" element={<AdminRoute user={user} />} />
            <Route path="/emergency" element={<EmergencyRoute />} />
            <Route path="/emergency/:id" element={<EmergencyRoute />} />
          </Routes>
          </Suspense>
        </main>

        <footer>
          <span>GoldenHour</span>
          <span>Wallet Verification • AES-256-GCM Encryption • Authenticated API</span>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
