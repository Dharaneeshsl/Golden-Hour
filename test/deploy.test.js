const { expect } = require("chai");
const { ethers } = require("hardhat");
const { resolveRelayAddress } = require("../scripts/deploy");

describe("deployment relay configuration", function () {
  it("derives the relay address from BACKEND_PRIVATE_KEY", async function () {
    const key = `0x${"11".repeat(32)}`;
    const expected = new ethers.Wallet(key).address;
    expect(resolveRelayAddress(key, "0x0000000000000000000000000000000000000001")).to.equal(expected);
  });

  it("falls back to the deployer when no relay key is configured", async function () {
    const fallback = "0x0000000000000000000000000000000000000001";
    expect(resolveRelayAddress("", fallback)).to.equal(fallback);
    expect(resolveRelayAddress(undefined, fallback)).to.equal(fallback);
  });
});
