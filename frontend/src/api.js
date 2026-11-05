import { clearBrowserSession, markAuthenticated } from "./utils/session";

const pendingWrites = new Map();
let refreshInFlight;

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST", credentials: "include", headers: {"Content-Type":"application/json"}, body: "{}"
    }).finally(() => { refreshInFlight = undefined; });
  }
  return refreshInFlight;
}

import { API_URL } from "./config/runtime";

export function setToken(authenticated) {
  if (typeof localStorage==="undefined") return;
  if (authenticated) markAuthenticated();
  else clearBrowserSession();
}

export function getToken() {
  return typeof localStorage!=="undefined" && localStorage.getItem("goldenhour_authenticated")==="true" ? "cookie" : null;
}

export async function request(path, options = {}, withPage = false) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();


  const method = (options.method || "GET").toUpperCase();
  const clinicalWrite = ["POST","PUT","PATCH","DELETE"].includes(method) &&
    /^\/api\/(patients|records|doctors|consents|emergency-access|recovery|compliance)(\/|$)/.test(path);
  let fingerprint;
  if (clinicalWrite) {
    const bytes = new TextEncoder().encode(JSON.stringify([method,path,token,options.body || ""]));
    fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),byte => byte.toString(16).padStart(2,"0")).join("");
    for (const [key,value] of pendingWrites) if (Date.now()-value.createdAt>15*60*1000) pendingWrites.delete(key);
    if (!pendingWrites.has(fingerprint)) pendingWrites.set(fingerprint,{key:crypto.randomUUID(),createdAt:Date.now()});
    headers["Idempotency-Key"] ||= pendingWrites.get(fingerprint).key;
  }
  let r;
  for (let attempt=0;attempt<2;attempt++) {
    try {
      r = await fetch(`${API_URL}${path}`, { ...options, headers, credentials:"include" });
      break;
    } catch (error) {
      if (!clinicalWrite || attempt===1 || options.signal?.aborted) throw error;
    }
  }
  if (r.status === 401 && token && !path.startsWith("/api/auth/") && !options.signal?.aborted) {
    const refreshed = await refreshSession();
    if (refreshed.ok && getToken()) {
      r = await fetch(`${API_URL}${path}`, { ...options, headers, credentials:"include" });
    } else if (!refreshed.ok && refreshed.status !== 401 && refreshed.status !== 403) {
      const error = new Error("Session renewal is temporarily unavailable. Please retry.");
      error.status = refreshed.status;
      throw error;
    }
  }
  const data = await r.json().catch(() => ({}));
  if (fingerprint && r.status<500) pendingWrites.delete(fingerprint);

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
  return withPage ? {items:data,nextCursor:r.headers?.get("X-Next-Cursor") || null} : data;
}

function pageRequest(path,cursor,filters={}) {
  const query = new URLSearchParams(filters);
  if (cursor) query.set("cursor",cursor);
  return request(path + (query.size ? "?" + query : ""),{},true);
}

export const api = {
  auditExport: (after,format) => request(`/api/compliance/audit-export?after=${encodeURIComponent(after)}&format=${format}&limit=100`),
  recordsPage: (id,cursor) => pageRequest(`/api/records/${encodeURIComponent(id)}`,cursor),
  auditPage: (id,cursor) => pageRequest(`/api/emergency-access/${encodeURIComponent(id)}`,cursor),
  patientsPage: cursor => pageRequest("/api/patients/all",cursor),
  providersPage: (status,cursor) => pageRequest("/api/doctors",cursor,status ? {status} : {}),
  consentsPage: (id,cursor) => pageRequest(`/api/consents/${encodeURIComponent(id)}`,cursor),
  providerConsentsPage: cursor => pageRequest("/api/consents/provider",cursor),
  recentAuditsPage: cursor => pageRequest("/api/emergency-access/recent/all",cursor),
  pendingReviewsPage: cursor => pageRequest("/api/emergency-access/reviews/pending",cursor),
  requestRecovery: body => request("/api/recovery",{method:"POST",body:JSON.stringify(body)}),
  recoveries: () => request("/api/recovery"),
  reviewRecovery: (id,decision) => request(`/api/recovery/${id}/review`,{method:"POST",body:JSON.stringify({decision,identityVerified:decision==="approve"})}),
  inviteStaff: phone => request("/api/doctors/invitations", {method:"POST",body:JSON.stringify({phone})}),
  myDataRequests: () => request("/api/compliance/me/requests"),
  resolveDataRequest: (id,body) => request(`/api/compliance/requests/${id}/resolve`,{method:"POST",body:JSON.stringify(body)}),
  dataRequests: () => request("/api/compliance/requests"),
  setRetentionHold: (id,body) => request(`/api/compliance/holds/${id}`,{method:"PUT",body:JSON.stringify(body)}),
  submitDataRequest: body => request("/api/compliance/dsr",{method:"POST",body:JSON.stringify(body)}),
  patientArchive: cursor => request("/api/compliance/me/archive" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : "")),
  jobs: () => request("/api/operations/jobs"),
  retryJob: id => request(`/api/operations/jobs/${id}/retry`,{method:"POST",body:JSON.stringify({deliveryReconciled:true})}),
  operations: () => request("/api/operations"),
  updateOperations: body => request("/api/operations", {method:"PUT",body:JSON.stringify(body)}),
  issueCard: () => request("/api/patients/me/card", { method: "POST" }),
  requestPhoneCode: phone => request("/api/auth/phone/request",{method:"POST",body:JSON.stringify({phone})}),
  verifyPhoneCode: (challengeId,code) => request("/api/auth/phone/verify",{method:"POST",body:JSON.stringify({challengeId,code})}),
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
