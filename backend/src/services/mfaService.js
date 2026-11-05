const crypto = require("crypto");
const OTPAuth = require("otpauth");
const jwt = require("jsonwebtoken");
const encryption = require("./encryptionService");
const {getJwtSecret} = require("../config/authConfig");
const {AuditChainService} = require("./auditChainService");

function totp(secret, wallet) {
  return new OTPAuth.TOTP({issuer:"GoldenHour", label:wallet, algorithm:"SHA1", digits:6, period:30,
    secret:OTPAuth.Secret.fromBase32(secret)});
}
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

class MfaService {
  constructor(store) {this.store = store;}

  async challenge(wallet) {
    const id = crypto.randomUUID();
    await this.store.query("DELETE FROM mfa_challenges WHERE expires_at <= now()");
    await this.store.query("INSERT INTO mfa_challenges(id,wallet,expires_at) VALUES ($1,$2,now()+interval '5 minutes')",[id,wallet]);
    const factor = (await this.store.query("SELECT enabled FROM staff_mfa WHERE wallet=$1",[wallet])).rows[0];
    return {
      mfaRequired:true, enrollmentRequired:!factor?.enabled,
      mfaToken:jwt.sign({wallet,id,purpose:"mfa"},getJwtSecret(),{expiresIn:"5m",algorithm:"HS256",issuer:"goldenhour"})
    };
  }

  verifyTicket(token) {
    const ticket = jwt.verify(token,getJwtSecret(),{algorithms:["HS256"],issuer:"goldenhour"});
    if (ticket.purpose !== "mfa" || !ticket.id || !ticket.wallet) throw new Error("Invalid MFA ticket");
    return ticket;
  }

  async setup(token) {
    const {id,wallet} = this.verifyTicket(token);
    return this.store.transaction(async tx => {
      const challenge = (await tx.query("SELECT id FROM mfa_challenges WHERE id=$1 AND wallet=$2 AND expires_at>now() AND NOT consumed AND attempts<5 FOR UPDATE",[id,wallet])).rows[0];
      if (!challenge) throw new Error("MFA challenge unavailable");
      const secret = new OTPAuth.Secret({size:20}).base32;
      await tx.query("INSERT INTO staff_mfa(wallet,encrypted_secret) VALUES ($1,$2) ON CONFLICT(wallet) DO NOTHING",[wallet,encryption.encryptJson({secret})]);
      const factor = (await tx.query("SELECT * FROM staff_mfa WHERE wallet=$1",[wallet])).rows[0];
      if (factor.enabled) throw new Error("Authenticator already enrolled");
      const current = encryption.decryptJson(factor.encrypted_secret).secret;
      return {secret:current, uri:totp(current,wallet).toString()};
    });
  }

  async complete(token, code) {
    const {id,wallet} = this.verifyTicket(token);
    if (typeof code !== "string" || code.length>64) throw new Error("Invalid MFA code");
    // Commit each attempt even when verification fails, including across replicas.
    const attempted = await this.store.query("UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=$1 AND wallet=$2 AND expires_at>now() AND NOT consumed AND attempts<5 RETURNING id",[id,wallet]);
    if (!attempted.rowCount) throw new Error("MFA challenge unavailable");
    if (!await this.store.emergencyQuota("mfa:" + wallet,5)) throw new Error("Authenticator attempts temporarily locked");
    return this.store.transaction(async tx => {
      const challenge = (await tx.query("SELECT id FROM mfa_challenges WHERE id=$1 AND expires_at>now() AND NOT consumed FOR UPDATE",[id])).rows[0];
      if (!challenge) throw new Error("MFA challenge unavailable");
      const factor = (await tx.query("SELECT * FROM staff_mfa WHERE wallet=$1 FOR UPDATE",[wallet])).rows[0];
      if (!factor) throw new Error("Set up an authenticator first");
      const secret = encryption.decryptJson(factor.encrypted_secret).secret;
      const generator = totp(secret,wallet);
      const timestamp = Date.now();
      const delta = /^\d{6}$/.test(code) ? generator.validate({token:code,window:1,timestamp}) : null;
      const step = Math.floor(timestamp/30000) + (delta ?? 0);
      let hashes = factor.recovery_hashes;
      const recoveryIndex = factor.enabled ? hashes.indexOf(digest(code)) : -1;
      const validOtp = delta !== null && step > Number(factor.last_step);
      if (!validOtp && recoveryIndex<0) throw new Error("Invalid or already used MFA code");
      if (recoveryIndex>=0) hashes = hashes.filter((_,index) => index!==recoveryIndex);
      let recoveryCodes;
      if (!factor.enabled) {
        recoveryCodes = Array.from({length:8},() => crypto.randomBytes(16).toString("hex"));
        hashes = recoveryCodes.map(digest);
      }
      await tx.query("UPDATE staff_mfa SET enabled=true,last_step=$2,recovery_hashes=$3 WHERE wallet=$1",[wallet,validOtp ? step : factor.last_step,JSON.stringify(hashes)]);
      await tx.query("UPDATE mfa_challenges SET consumed=true WHERE id=$1",[id]);
      await tx.query("DELETE FROM emergency_quota WHERE wallet=$1",["mfa:" + wallet]);
      await new AuditChainService(tx).appendAuditEvent({actor:wallet,action:factor.enabled ? "STAFF_MFA_VERIFIED" : "STAFF_MFA_ENROLLED",details:{recoveryCodeUsed:recoveryIndex>=0}});
      return {wallet,recoveryCodes};
    });
  }
}
module.exports={MfaService,totp};
