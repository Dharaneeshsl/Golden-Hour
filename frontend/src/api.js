import { clearBrowserSession, markWalletConnected } from "./utils/session";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

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
    if (r.status === 401 && path !== "/api/auth/verify") {
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
  nonce: (wallet) => request(`/api/auth/nonce/${wallet}`),
  verify: (body) => request("/api/auth/verify", { method: "POST", body: JSON.stringify(body) }),
  patient: (id) => request(`/api/patient/${id}`),
  createPatient: (body) => request("/api/patient", { method: "POST", body: JSON.stringify(body) }),
  updatePatient: (id, body) => request(`/api/patient/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  providerAccess: () => request("/api/doctor/me"),
  registerProvider: (body) => request("/api/doctor/register", { method: "POST", body: JSON.stringify(body) }),
  providerConsents: () => request("/api/doctor/consents"),
  patientConsents: (id) => request(`/api/patient/${id}/consents`),
  grantConsent: (id, body) => request(`/api/patient/${id}/consent`, { method: "POST", body: JSON.stringify(body) }),
  revokeConsent: (id, body) => request(`/api/patient/${id}/consent/revoke`, { method: "POST", body: JSON.stringify(body) }),
  emergency: (body) => request("/api/emergency", { method: "POST", body: JSON.stringify(body) }),
  emergencyCritical: (id) => request(`/api/emergency/${id}/critical`),
  addRecord: (id, body) => request(`/api/doctor/patient/${id}/record`, { method: "POST", body: JSON.stringify(body) }),
  verifyRecord: (cid) => request(`/api/record/verify/${cid}`),
  // Compliance API (DPDP / FHIR)
  exportFhir: (id) => request(`/api/compliance/export/${id}`),
  submitDSR: (body) => request("/api/compliance/dsr", { method: "POST", body: JSON.stringify(body) }),
};
