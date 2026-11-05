import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBrowserSession, fullLogoutCleanup, markAuthenticated } from "./session";

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
    expect(localStorage.getItem("goldenhour_signed_out")).toBe("true");
  });

  it("revokes the server session when signing out", async () => {
    const send=vi.fn().mockResolvedValue({ok:true});
    vi.stubGlobal("fetch",send);
    localStorage.setItem("goldenhour_authenticated","true");
    await fullLogoutCleanup();
    expect(localStorage.getItem("goldenhour_authenticated")).toBeNull();
    expect(send).toHaveBeenCalledWith(expect.stringContaining("/api/auth/logout"),{method:"POST",credentials:"include"});
  });

  it("clears the disconnected flag on a new connection", () => {
    clearBrowserSession();
    markAuthenticated();
    expect(localStorage.getItem("goldenhour_signed_out")).toBeNull();
    expect(localStorage.getItem("goldenhour_authenticated")).toBe("true");
  });
});
