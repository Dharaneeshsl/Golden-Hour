process.env.JWT_SECRET="test-secret";
const test=require("node:test"),assert=require("node:assert/strict"),request=require("supertest"),jwt=require("jsonwebtoken");const{createApp}=require("../src/app");const{JsonStore}=require("../src/config/db");
const wallet="0x0000000000000000000000000000000000000001",token=jwt.sign({wallet,role:"patient"},process.env.JWT_SECRET,{issuer:"goldenhour"});
async function app(){return createApp({store:new JsonStore(`C:/tmp/goldenhour-${Date.now()}-${Math.random()}.json`)})}
test("health is public",async()=>{const response=await request(await app()).get("/health");assert.equal(response.status,200);assert.equal(response.body.status,"ok")});
test("patient registration and current-user resolution work",async()=>{const server=await app(),created=await request(server).post("/api/patients").set("Authorization",`Bearer ${token}`).send({profile:{name:"Test"},critical:{bloodGroup:"O+"}});assert.equal(created.status,201);const me=await request(server).get("/api/patients/me").set("Authorization",`Bearer ${token}`);assert.equal(me.status,200);assert.equal(me.body.patientId,created.body.id)});
test("protected routes reject missing auth",async()=>assert.equal((await request(await app()).post("/api/records").send({})).status,401));
