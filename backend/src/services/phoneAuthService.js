const crypto = require("crypto");
const {getJwtSecret} = require("../config/authConfig");

function validPhone(phone) {return typeof phone==="string" && /^\+91[6-9]\d{9}$/.test(phone);}
function subjectId(subject) {
  return typeof subject==="string" && /^user:[a-f0-9-]{36}$/i.test(subject) ? subject.slice(5) : null;
}
async function ensurePhoneUser(store,phone) {
  return store.transaction(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["phone-account:"+phone]);
    const identity = (await tx.query("SELECT u.* FROM users u JOIN identities i ON i.user_id=u.id WHERE i.provider_type='phone_otp' AND i.identifier=$1",[phone])).rows[0];
    if (identity) return identity;
    const id = crypto.randomUUID();
    const user = (await tx.query("INSERT INTO users(id,full_name,status) VALUES ($1,'New account','active') RETURNING *",[id])).rows[0];
    await tx.query("INSERT INTO identities(id,user_id,provider_type,identifier) VALUES ($1,$2,'phone_otp',$3)",[crypto.randomUUID(),id,phone]);
    return user;
  });
}
class Msg91OtpProvider {
  async send({phone,code}) {
    if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_FLOW_ID) throw new Error("Phone sign-in service unavailable");
    const variable = process.env.MSG91_OTP_VARIABLE || "otp";
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(variable)) throw new Error("Invalid OTP template configuration");
    const response = await fetch("https://control.msg91.com/api/v5/flow",{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(5000),
      headers:{"Content-Type":"application/json",authkey:process.env.MSG91_AUTH_KEY},
      body:JSON.stringify({template_id:process.env.MSG91_FLOW_ID,short_url:"0",
        recipients:[{mobiles:phone.slice(1),[variable]:code}]})
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok || result.type!=="success") throw new Error("Phone sign-in service unavailable");
  }
}
class PhoneAuthService {
  constructor(store,provider=new Msg91OtpProvider()) {this.store=store;this.provider=provider;}
  hash(id,code) {return crypto.createHmac("sha256",getJwtSecret()).update(id+":"+code).digest("hex");}
  async request(phone) {
    if (!validPhone(phone)) {const error=new Error("Enter an Indian mobile number with +91");error.status=400;throw error;}
    if (!this.store.query) throw new Error("Phone sign-in requires PostgreSQL");
    if (!await this.store.emergencyQuota("otp-send:"+phone,5)) {const error=new Error("Too many code requests. Try again in 15 minutes.");error.status=429;throw error;}
    const id=crypto.randomUUID(),code=String(crypto.randomInt(0,1000000)).padStart(6,"0");
    await this.store.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["otp-send:"+phone]);
      await tx.query("UPDATE phone_login_challenges SET consumed=true WHERE phone=$1 AND NOT consumed",[phone]);
      await tx.query("INSERT INTO phone_login_challenges(id,phone,code_hash,expires_at) VALUES ($1,$2,$3,now()+interval '5 minutes')",[id,phone,this.hash(id,code)]);
    });
    try {await this.provider.send({phone,code});}
    catch {
      await this.store.query("UPDATE phone_login_challenges SET consumed=true WHERE id=$1",[id]);
      throw new Error("Phone sign-in service unavailable. Please try again.");
    }
    return {challengeId:id,expiresIn:300};
  }
  async verify(id,code) {
    if (typeof id!=="string" || !/^[a-f0-9-]{36}$/i.test(id) || typeof code!=="string" || !/^\d{6}$/.test(code)) throw new Error("Invalid or expired code");
    const challenge = (await this.store.query("UPDATE phone_login_challenges SET attempts=attempts+1 WHERE id=$1 AND NOT consumed AND attempts<5 AND expires_at>now() RETURNING *",[id])).rows[0];
    if (!challenge || !await this.store.emergencyQuota("otp-verify:"+challenge.phone,5)) throw new Error("Invalid or expired code");
    if (!crypto.timingSafeEqual(Buffer.from(challenge.code_hash,"hex"),Buffer.from(this.hash(id,code),"hex"))) throw new Error("Invalid or expired code");
    return this.store.transaction(async tx => {
      const consumed = await tx.query("UPDATE phone_login_challenges SET consumed=true WHERE id=$1 AND NOT consumed AND expires_at>now() RETURNING phone",[id]);
      if (!consumed.rowCount) throw new Error("Invalid or expired code");
      const user = await ensurePhoneUser(tx,challenge.phone);
      if (user.status!=="active") throw new Error("Account unavailable");
      await tx.query("DELETE FROM emergency_quota WHERE wallet=$1",["otp-verify:"+challenge.phone]);
      return {userId:user.id,subject:"user:"+user.id};
    });
  }
}
module.exports={PhoneAuthService,Msg91OtpProvider,ensurePhoneUser,validPhone,subjectId};
