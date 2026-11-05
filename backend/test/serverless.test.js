const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const {createHandler} = require("../src/serverless");

test("serverless adapter shares cold-start initialization and preserves API paths",async () => {
  let starts = 0;
  const handler = createHandler(async () => {
    starts++;
    await new Promise(resolve => setTimeout(resolve,10));
    const api = express();
    api.get("/api/health",(_req,res) => res.json({status:"ok"}));
    return api;
  });
  const outer = express();
  outer.use(handler);
  const responses = await Promise.all(Array.from({length:8},() => request(outer).get("/api/health")));
  assert.equal(starts,1);
  for (const response of responses) assert.equal(response.body.status,"ok");
});
test("serverless cold-start failure returns a redacted error and retries later",async () => {
  let starts = 0;
  const handler = createHandler(async () => {
    if (++starts === 1) throw new Error("sensitive deployment value");
    return (_req,res) => res.end("recovered");
  });
  const app = express();
  app.use(handler);
  const failed = await request(app).get("/api/health");
  assert.equal(failed.status,503);
  assert.ok(!failed.text.includes("sensitive"));
  assert.equal((await request(app).get("/api/health")).text,"recovered");
});
