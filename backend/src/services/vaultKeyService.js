const fs = require("fs");

class VaultKeyService {
  constructor({address = process.env.VAULT_ADDR, key = process.env.VAULT_TRANSIT_KEY,
    tokenFile = process.env.VAULT_TOKEN_FILE, token = process.env.VAULT_TOKEN, fetchImpl = fetch} = {}) {
    const url = new URL(address);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        !/^[a-zA-Z0-9_-]+$/.test(key || "") || (!tokenFile && !token)) {
      throw new Error("Configure HTTPS Vault address, transit key and token file");
    }
    this.address = url.href.replace(/\/$/, "");
    this.key = key;
    this.tokenFile = tokenFile;
    this.token = token;
    this.fetch = fetchImpl;
  }

  async call(operation, payload) {
    // Reread the agent-managed token for renewal without an application restart.
    const token = this.tokenFile ? fs.readFileSync(this.tokenFile, "utf8").trim() : this.token?.trim();
    if (!token) throw new Error("Vault authentication unavailable");
    const response = await this.fetch(this.address + "/v1/transit/" + operation + "/" + this.key, {
      method:"POST", headers:{"Content-Type":"application/json","X-Vault-Token":token},
      body:JSON.stringify(payload), signal:AbortSignal.timeout(5000), redirect:"error"
    });
    if (!response.ok) throw new Error("Key service operation failed");
    const result = await response.json();
    if (!result.data) throw new Error("Invalid key service response");
    return result.data;
  }

  async wrap(raw) {
    const {ciphertext} = await this.call("encrypt",{plaintext:raw.toString("base64")});
    if (!/^vault:v[0-9]+:[A-Za-z0-9+/=]+$/.test(ciphertext || "")) throw new Error("Invalid wrapped key");
    return ciphertext;
  }

  async unwrap(ciphertext) {
    const {plaintext} = await this.call("decrypt",{ciphertext});
    const raw = Buffer.from(plaintext || "", "base64");
    if (raw.length !== 32) throw new Error("Invalid unwrapped key");
    return raw;
  }

  async rewrap(ciphertext) {
    const result = await this.call("rewrap",{ciphertext});
    if (!/^vault:v[0-9]+:[A-Za-z0-9+/=]+$/.test(result.ciphertext || "")) throw new Error("Invalid wrapped key");
    return result.ciphertext;
  }
}
module.exports={VaultKeyService};
