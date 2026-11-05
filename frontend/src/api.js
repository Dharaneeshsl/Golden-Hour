import { clearBrowserSession, markWalletConnected } from "./utils/session";

const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:4000")).replace(/\/$/, "");

export function setToken(t) {
  if (typeof localStorage === "undefined") return;
  if (t) {
    localStorage.setItem("goldenhour_token", t);
    markWalletConnected();
  } else {
    localStorage.removeItem("goldenhour_token");
  }
}

export function getToken() {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("goldenhour_token");
  }
  return null;
}

export async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    if (r.status === 401 && !path.startsWith("/api/auth/")) {
      clearBrowserSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("goldenhour_session_expired"));
      }
    }
    const error = new Error(data.error || `Request failed: ${r.status}`);
    error.status = r.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export const api = {
  requestRecovery: body => request("/api/recovery",{method:"POST",body:JSON.stringify(body)}),
  recoveries: () => request("/api/recovery"),
  reviewRecovery: (id,decision) => request(`/api/recovery/${id}/review`,{method:"POST",body:JSON.stringify({decision,identityVerified:decision==="approve"})}),
  inviteStaff: wallet => request("/api/doctors/invitations", {method:"POST",body:JSON.stringify({wallet})}),
  patientArchive: () => request("/api/compliance/me/archive"),
  operations: () => request("/api/operations"),
  updateOperations: body => request("/api/operations", {method:"PUT",body:JSON.stringify(body)}),
  issueCard: () => request("/api/patients/me/card", { method: "POST" }),
  mfaSetup: mfaToken => request("/api/auth/mfa/setup", {method:"POST", body:JSON.stringify({mfaToken})}),
  mfaComplete: (mfaToken,code) => request("/api/auth/mfa/complete", {method:"POST", body:JSON.stringify({mfaToken,code})}),
  nonce: (w) => request(`/api/auth/nonce/${w}`),
  verify: (body) => request("/api/auth/verify", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/api/patients/me"),
  patient: (id) => request(`/api/patients/${id}`),
  allPatients: () => request("/api/patients/all"),
  registerPatient: (body) => request("/api/patients", { method: "POST", body: JSON.stringify(body) }),
  updatePatient: (id, body) => request(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  records: (id) => request(`/api/records/${id}`),
  recordDetail: (pid, rid) => request(`/api/records/${pid}/${rid}`),
  addRecord: (body) => request("/api/records", { method: "POST", body: JSON.stringify(body) }),
  emergency: (body) => request("/api/emergency-access", { method: "POST", body: JSON.stringify(body) }),
  emergencyCritical: (id) => request(`/api/emergency-access/critical/${id}`),
  audit: (id) => request(`/api/emergency-access/${id}`),
  pendingReviews: () => request("/api/emergency-access/reviews/pending"),
  reviewEmergency: (id, decision) => request(`/api/emergency-access/reviews/${id}`, {method:"POST", body:JSON.stringify({decision})}),
  recentAudits: () => request("/api/emergency-access/recent/all"),
  providerAccess: () => request("/api/doctors/access"),
  registerProvider: (body) => request("/api/doctors/register", { method: "POST", body: JSON.stringify(body) }),
  providers: (s) => request(`/api/doctors${s ? `?status=${encodeURIComponent(s)}` : ""}`),
  updateProviderStatus: (w, status) => request(`/api/doctors/${encodeURIComponent(w)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  consents: (id) => request(`/api/consents/${id}`),
  providerConsents: () => request("/api/consents/provider"),
  grantConsent: (id, body) => request(`/api/consents/${id}`, { method: "POST", body: JSON.stringify(body) }),
  revokeConsent: (id, body) => request(`/api/consents/${id}/revoke`, { method: "POST", body: JSON.stringify(body) }),
  exportFhir: (id) => request(`/api/compliance/export/${id}`),
  submitDSR: (body) => request("/api/compliance/dsr", { method: "POST", body: JSON.stringify(body) }),
};
