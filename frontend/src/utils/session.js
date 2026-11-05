import { API_URL } from "../config/runtime";
const SESSION_PREFIX = "goldenhour_";
function removePrefixedKeys(storage) {
  const keys = [];
  for (let index=0;index<storage.length;index++) {
    const key=storage.key(index);
    if (key?.startsWith(SESSION_PREFIX)) keys.push(key);
  }
  keys.forEach(key=>storage.removeItem(key));
}
export function clearBrowserSession() {
  removePrefixedKeys(window.localStorage);
  removePrefixedKeys(window.sessionStorage);
  window.localStorage.setItem("goldenhour_signed_out","true");
}
export function markAuthenticated() {
  window.localStorage.removeItem("goldenhour_signed_out");
  window.localStorage.removeItem("goldenhour_token");
  window.localStorage.setItem("goldenhour_authenticated","true");
}
export async function fullLogoutCleanup() {
  try {
    const response=await fetch(API_URL+"/api/auth/logout",{method:"POST",credentials:"include"});
    if (!response.ok) throw new Error("Sign-out could not be confirmed. Close this browser on a shared device.");
  } finally {clearBrowserSession();}
}
