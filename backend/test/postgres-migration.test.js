const test = require("node:test");
const assert = require("node:assert/strict");
const { runMigrations } = require("../src/config/migrate");

test("runMigrations handles empty/missing DATABASE_URL gracefully without crashing", async () => {
  delete process.env.DATABASE_URL;
  await assert.doesNotReject(async () => {
    await runMigrations();
  });
});
