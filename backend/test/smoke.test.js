const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const os = require("os");
const path = require("path");
const { createApp } = require("../src/app");
const { JsonStore } = require("../src/config/db");

test("Express application initializes cleanly and responds to health checks", async () => {
  const store = new JsonStore(path.join(os.tmpdir(), `goldenhour-smoke-${Date.now()}.json`));
  const app = await createApp({ store });
  assert.ok(app);

  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});