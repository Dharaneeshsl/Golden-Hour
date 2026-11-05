import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Link, Route, Routes, useNavigate, useParams, Navigate } from "react-router-dom";

import ErrorBoundary from "./components/ErrorBoundary";
import { fullLogoutCleanup } from "./utils/session";
import { I18nProvider, useI18n, LanguageSelector } from "./config/i18n";

const PatientDashboard = lazy(() => import("./components/PatientDashboard"));
const DoctorDashboard = lazy(() => import("./components/DoctorDashboard"));
const EmergencyScanView = lazy(() => import("./components/EmergencyScanView"));
const PatientOnboarding = lazy(() => import("./components/PatientOnboarding"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const OfflineCard = lazy(() => import("./components/OfflineCard"));
const Support = lazy(() => import("./components/Support"));
const Login = lazy(() => import("./pages/login"));

function Home({ user }) {
  const { t } = useI18n();
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">{t("everySecondMatters")}</p>
        <h1>{t("heroTitle")}</h1>
        <p className="lead">
          {t("heroLead")}
        </p>
        <div className="hero-actions">
          {!user ? (
            <Link className="primary" to="/login">{t("signInRegister")}</Link>
          ) : user.role === "admin" ? (
            <Link className="primary" to="/admin">{t("goToAdmin")}</Link>
          ) : user.role === "doctor" ? (
            <Link className="primary" to="/doctor">{t("goToProvider")}</Link>
          ) : (
            <Link className="primary" to={user.patientId ? "/patient/me" : "/onboarding"}>
              {user.patientId ? t("goToPatient") : t("completeOnboarding")}
            </Link>
          )}
          <Link className="secondary" to="/emergency">{t("emergencyAccess")}</Link>
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

function AppContent() {
  const { t } = useI18n();
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("goldenhour_user") || "null")
  );
  const navigate = useNavigate();
  const loggingOutRef = useRef(false);
  const sessionGen = useRef(0);
  const [sessionNotice, setSessionNotice] = useState("");

  const login = (next) => {
    sessionGen.current += 1;
    loggingOutRef.current = false;
    setSessionNotice("");
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
    void fullLogoutCleanup().catch(error => setSessionNotice(error.message)).finally(() => {
      if (sessionGen.current !== gen) return;
      navigate("/login");
    });
  };

  useEffect(() => {
    const handleExpired = () => {
      logout();
    };
    window.addEventListener("goldenhour_session_expired", handleExpired);
    return () => window.removeEventListener("goldenhour_session_expired", handleExpired);
  }, [user]);

  return (
    <ErrorBoundary>
      <div className="app">
        <a className="skip-link" href="#main-content">{t("skipToContent")}</a>
        <header>
          <Link className="brand" to="/">
            <span className="mark">GH</span>
            <div>
              <strong>{t("title")}</strong>
              <small>{t("tagline")}</small>
            </div>
          </Link>
          <nav>
            {user?.role === "admin" && (
              <Link to="/admin">{t("adminPortal")}</Link>
            )}
            {user?.role === "doctor" && (
              <Link to="/doctor">{t("providerPortal")}</Link>
            )}
            {user?.role === "patient" && (
              user.patientId ? (
                <Link to="/patient/me">{t("patientPortal")}</Link>
              ) : (
                <Link to="/onboarding" style={{ color: "#10b981", fontWeight: "bold" }}>
                  {t("completeOnboarding")}
                </Link>
              )
            )}
            {user?.role === "unregistered" && (
              <Link to="/onboarding" style={{ color: "#10b981", fontWeight: "bold" }}>
                {t("accountOnboarding")}
              </Link>
            )}
            <Link to="/emergency">{t("emergencyAccess")}</Link>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <LanguageSelector />
            {user ? (
              <>
                <span className="badge" style={{ textTransform: "uppercase", fontSize: "0.75rem" }}>
                  {user.role}
                </span>
                <button className="logout-btn" onClick={logout}>
                  {t("signOut")}
                </button>
              </>
            ) : (
              <Link className="primary" to="/login">{t("signIn")}</Link>
            )}
          </div>
        </header>

        {sessionNotice && <p role="alert">{sessionNotice}</p>}
        <main id="main-content" tabIndex="-1">
          <Suspense fallback={<p role="status">{t("loadingWorkspace")}</p>}>
            <Routes>
              <Route path="/offline" element={<OfflineCard />} />
              <Route path="/support" element={<Support />} />
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
          <span>GoldenHour · <Link to="/offline">{t("savedQRCard")}</Link> · <Link to="/support">{t("supportAndStatus")}</Link></span>
          <span>{t("patientPrivacy")}</span>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
