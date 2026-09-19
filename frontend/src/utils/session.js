const SESSION_PREFIX = "goldenhour_";
const DISCONNECTED_FLAG = "goldenhour_wallet_disconnected";

function removePrefixedKeys(storage) {
  if (!storage) return;
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(SESSION_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export function clearBrowserSession() {
  removePrefixedKeys(window.localStorage);
  removePrefixedKeys(window.sessionStorage);
  window.localStorage.setItem(DISCONNECTED_FLAG, "true");
}

export async function disconnectWalletProvider() {
  if (!window.ethereum?.request) return;
  try {
    await window.ethereum.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Some wallets do not support revoke; local session is still cleared.
  }
}

export async function fullLogoutCleanup() {
  clearBrowserSession();
  await disconnectWalletProvider();
}

export function isWalletDisconnected() {
  return window.localStorage.getItem(DISCONNECTED_FLAG) === "true";
}

export function markWalletConnected() {
  window.localStorage.removeItem(DISCONNECTED_FLAG);
}
