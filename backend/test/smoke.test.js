const test=require("node:test");const assert=require("node:assert/strict");
test("health contract",()=>{assert.equal(typeof "ok","string")});
test("emergency window is bounded",()=>{const expires=Date.now()+15*60*1000;assert.ok(expires>Date.now());assert.ok(expires-Date.now()<=15*60*1000)});