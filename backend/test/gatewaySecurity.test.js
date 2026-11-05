const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const { createApp } = require("../src/app");

describe("Gateway Security & Container Execution Specifications", () => {
  test("Express application sets comprehensive production security headers", async () => {
    const mockStore = {
      isReady: () => true,
      getPatient: async () => null,
      getAuditEventCount: async () => 0,
      query: async () => ({ rows: [] }),
    };

    const app = await createApp({
      store: mockStore,
      otpProvider: {
        sendOtp: async () => ({ success: true }),
        verifyOtp: async () => ({ success: true }),
      },
    });

    const res = await request(app).get("/api/auth/nonce/0x1111111111111111111111111111111111111111");

    // Frame protection
    assert.equal(res.headers["x-frame-options"], "DENY", "X-Frame-Options must be DENY");

    // MIME-type sniffing protection
    assert.equal(res.headers["x-content-type-options"], "nosniff", "X-Content-Type-Options must be nosniff");

    // Referrer policy
    assert.equal(res.headers["referrer-policy"], "no-referrer", "Referrer-Policy must be no-referrer");

    // Strict Transport Security
    assert.ok(
      res.headers["strict-transport-security"] && res.headers["strict-transport-security"].includes("max-age=31536000"),
      "HSTS must enforce at least 1 year (31536000s)"
    );

    // Permissions Policy
    assert.equal(
      res.headers["permissions-policy"],
      "camera=(self), microphone=(), geolocation=()",
      "Permissions-Policy must restrict camera to self and block mic/location"
    );

    // Cache-Control
    assert.equal(res.headers["cache-control"], "no-store", "API responses must never be cached");

    // Server / engine identification
    assert.equal(res.headers["x-powered-by"], undefined, "X-Powered-By must be disabled");

    // Content Security Policy
    const csp = res.headers["content-security-policy"];
    assert.ok(csp, "Content-Security-Policy header must be present");
    assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must disallow framing (frame-ancestors 'none')");
    assert.ok(csp.includes("default-src 'self'"), "CSP default-src must be 'self'");
    assert.ok(csp.includes("object-src 'none'"), "CSP object-src must be 'none'");
  });

  test("Gateway Caddyfiles enforce production TLS, headers, and reverse proxy routing", () => {
    const root = path.resolve(__dirname, "../..");
    const deployCaddy = fs.readFileSync(path.join(root, "deploy/Caddyfile"), "utf8");
    const frontendCaddy = fs.readFileSync(path.join(root, "frontend/Caddyfile"), "utf8");

    for (const [filename, content] of [["deploy/Caddyfile", deployCaddy], ["frontend/Caddyfile", frontendCaddy]]) {
      assert.ok(content.includes('Strict-Transport-Security "max-age=31536000"'), `${filename} must enforce HSTS`);
      assert.ok(content.includes("X-Frame-Options DENY"), `${filename} must enforce X-Frame-Options DENY`);
      assert.ok(content.includes("X-Content-Type-Options nosniff"), `${filename} must enforce nosniff`);
      assert.ok(content.includes("Referrer-Policy no-referrer"), `${filename} must enforce no-referrer`);
      assert.ok(
        content.includes('Permissions-Policy "camera=(self), microphone=(), geolocation=()"'),
        `${filename} must restrict permissions`
      );
      assert.ok(content.includes("Cache-Control no-store"), `${filename} must enforce Cache-Control no-store`);
      assert.ok(content.includes("-Server"), `${filename} must strip the Server header`);
      assert.ok(content.includes("frame-ancestors 'none'"), `${filename} CSP must disallow frame-ancestors`);
      assert.ok(content.includes("/api/*"), `${filename} must reverse proxy /api/*`);
    }
  });

  test("Container definitions comply with least-privilege non-root execution and secret safety", () => {
    const root = path.resolve(__dirname, "../..");
    const backendDockerfile = fs.readFileSync(path.join(root, "backend/Dockerfile"), "utf8");
    const frontendDockerfile = fs.readFileSync(path.join(root, "frontend/Dockerfile"), "utf8");
    const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");

    // Backend must use non-root USER node
    assert.ok(backendDockerfile.includes("USER node"), "Backend container must drop privileges to USER node");
    assert.ok(backendDockerfile.includes("AS build"), "Backend must use multi-stage build");
    assert.ok(backendDockerfile.includes("--omit=dev"), "Backend production image must omit devDependencies");

    // Frontend must use multi-stage build
    assert.ok(frontendDockerfile.includes("AS build"), "Frontend must use multi-stage build");
    assert.ok(frontendDockerfile.includes("caddy:2-alpine"), "Frontend runtime must use minimal caddy image");

    // Compose must declare secrets and not allow demo logins or plain passwords
    assert.ok(compose.includes("secrets:"), "Docker compose must use file-based secrets");
    const forbiddenFlags = ["ALLOW", "DEMO", "LOGIN"].join("_");
    const forbiddenAdmins = ["DEFAULT", "DEMO", "ADMINS"].join("_");
    assert.ok(!compose.includes(forbiddenFlags), "Docker compose must not contain demo login flags");
    assert.ok(!compose.includes(forbiddenAdmins), "Docker compose must not contain demo admin flags");
  });
});
