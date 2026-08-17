import { describe, expect, it } from "vitest"; import { isWalletAddress, shortenAddress } from "./web3";
describe("wallet helpers", () => { it("shortens addresses safely", () => expect(shortenAddress("0x1234567890123456789012345678901234567890")).toBe("0x1234…7890")); it("validates an EVM address", () => expect(isWalletAddress("0x1234567890123456789012345678901234567890")).toBe(true)); });
