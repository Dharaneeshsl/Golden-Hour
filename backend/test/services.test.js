const test = require("node:test");
const assert = require("node:assert/strict");
const encryption = require("../src/services/encryptionService");
const ipfs = require("../src/services/ipfsService");
const { canonicalJsonStringify } = require("../src/controllers/recordController");

test("encryptionService encrypts and decrypts clinical JSON data accurately", () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  const payload = { summary: "Patient bloodwork normal", allergies: ["Penicillin"] };
  const encrypted = encryption.encryptJson(payload);

  assert.ok(encrypted.ciphertext);
  assert.ok(encrypted.iv);
  assert.ok(encrypted.tag);

  const decrypted = encryption.decryptJson(encrypted);
  assert.deepEqual(decrypted, payload);
});

test("canonicalJsonStringify produces deterministic sorted JSON strings", () => {
  const obj1 = { z: 1, a: 2, m: { y: "b", x: "a" } };
  const obj2 = { a: 2, m: { x: "a", y: "b" }, z: 1 };
  assert.equal(canonicalJsonStringify(obj1), canonicalJsonStringify(obj2));
  assert.equal(
    canonicalJsonStringify(obj1),
    '{"a":2,"m":{"x":"a","y":"b"},"z":1}'
  );
});

test("ipfsService fetchEncrypted rejects invalid CID formats", async () => {
  await assert.rejects(
    async () => ipfs.fetchEncrypted("../path/injection"),
    /Invalid IPFS CID/
  );
});
