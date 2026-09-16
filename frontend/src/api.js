const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function setToken(t) {
  if (t) localStorage.setItem("goldenhour_token", t);
  else localStorage.removeItem("goldenhour_token");
}

export function getToken() {
  return localStorage.getItem("goldenhour_token");
}

export async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const error = new Error(data.error || `Request failed: ${r.status}`);
    error.status = r.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

export const api = {
  nonce: (w) => request(`/api/auth/nonce/${w}`),
  verify: (body) => request("/api/auth/verify", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/api/patients/me"),
  patient: (id) => request(`/api/patients/${id}`),
  allPatients: () => request("/api/patients/all"),
  registerPatient: (body) => request("/api/patients", { method: "POST", body: JSON.stringify(body) }),
  updatePatient: (id, body) => request(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  records: (id) => request(`/api/records/${id}`),
  recordDetail: (patientId, recordId) => request(`/api/records/${patientId}/${recordId}`),
  addRecord: (body) => request("/api/records", { method: "POST", body: JSON.stringify(body) }),
  emergency: (body) => request("/api/emergency-access", { method: "POST", body: JSON.stringify(body) }),
  emergencyCritical: (id) => request(`/api/emergency-access/critical/${id}`),
  audit: (id) => request(`/api/emergency-access/${id}`),
  recentAudits: () => request("/api/emergency-access/recent/all"),
  providerAccess: () => request("/api/doctors/access"),
  registerProvider: (body) => request("/api/doctors/register", { method: "POST", body: JSON.stringify(body) }),
  providers: (status) => request(`/api/doctors${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  verifyProvider: (wallet) => request(`/api/doctors/${encodeURIComponent(wallet)}/verify`, { method: "POST" }),
  updateProviderStatus: (wallet, status) => request(`/api/doctors/${encodeURIComponent(wallet)}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  consents: (id) => request(`/api/consents/${id}`),
  providerConsents: () => request("/api/consents/provider"),
  grantConsent: (id, body) => request(`/api/consents/${id}`, { method: "POST", body: JSON.stringify(body) }),
  revokeConsent: (id, body) => request(`/api/consents/${id}/revoke`, { method: "POST", body: JSON.stringify(body) }),
};
