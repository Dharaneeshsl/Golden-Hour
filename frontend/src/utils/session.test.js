import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBrowserSession, fullLogoutCleanup, isWalletDisconnected, markWalletConnected } from "./session";

function memoryStorage() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

describe("session cleanup", () => {
  beforeEach(() => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("window", {
      localStorage: local,
      sessionStorage: session,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes GoldenHour keys and blocks auto-reconnect", () => {
    localStorage.setItem("goldenhour_token", "tok");
    localStorage.setItem("goldenhour_user", "{\"wallet\":\"0x1\"}");
    sessionStorage.setItem("goldenhour_tmp", "1");
    localStorage.setItem("unrelated", "keep");

    clearBrowserSession();

    expect(localStorage.getItem("goldenhour_token")).toBeNull();
    expect(localStorage.getItem("goldenhour_user")).toBeNull();
    expect(sessionStorage.getItem("goldenhour_tmp")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(isWalletDisconnected()).toBe(true);
  });

  it("revokes wallet permissions when logging out fully", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    window.ethereum = { request };
    localStorage.setItem("goldenhour_token", "tok");

    await fullLogoutCleanup();

    expect(localStorage.getItem("goldenhour_token")).toBeNull();
    expect(isWalletDisconnected()).toBe(true);
    expect(request).toHaveBeenCalledWith({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  });

  it("clears the disconnected flag on a new connection", () => {
    clearBrowserSession();
    markWalletConnected();
    expect(isWalletDisconnected()).toBe(false);
  });
});
