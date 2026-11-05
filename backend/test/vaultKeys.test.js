const test = require("node:test");
const assert = require("node:assert/strict");
const {EnvelopeEncryptionService} = require("../src/services/envelopeEncryptionService");

test("Vault adapter sends authenticated requests and rejects failed responses",async t => {
  const fs = require("fs"), os = require("os"), path = require("path");
  const {VaultKeyService} = require("../src/services/vaultKeyService");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),"gh-vault-"));
  const file = path.join(dir,"token");
  fs.writeFileSync(file,"synthetic-token");
  t.after(() => {fs.unlinkSync(file);fs.rmdirSync(dir);});
  const raw = Buffer.alloc(32,7);
  const calls = [];
  let fail = false;
  const vault = new VaultKeyService({address:"https://vault.example",key:"hospital",
    tokenFile:file,fetchImpl:async (url,options) => {
      calls.push({url,options});
      if (fail) return {ok:false};
      return {ok:true,json:async () => ({data:url.includes("/decrypt/") ?
        {plaintext:raw.toString("base64")} : {ciphertext:"vault:v2:ZmFrZQ=="}})};
    }});
  assert.equal(await vault.wrap(raw),"vault:v2:ZmFrZQ==");
  assert.deepEqual(await vault.unwrap("vault:v1:ZmFrZQ=="),raw);
  assert.equal(await vault.rewrap("vault:v1:ZmFrZQ=="),"vault:v2:ZmFrZQ==");
  assert.equal(calls[0].options.headers["X-Vault-Token"],"synthetic-token");
  assert.equal(calls[0].options.redirect,"error");
  fs.writeFileSync(file,"renewed-token");
  fail = true;
  await assert.rejects(vault.unwrap("vault:v1:ZmFrZQ=="),/failed/);
  assert.equal(calls.at(-1).options.headers["X-Vault-Token"],"renewed-token");
  assert.throws(() => new VaultKeyService({address:"http://vault.example",key:"hospital",tokenFile:file}),/HTTPS/);
});
