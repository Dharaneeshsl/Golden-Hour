const crypto = require("crypto");
class PostgresRateLimitStore {
  constructor(store, namespace) {
    this.store = store;
    this.namespace = namespace;
    this.prefix = namespace + ":";
    this.localKeys = false;
  }
  init(options) {this.windowMs = options.windowMs;}
  hash(key) {return crypto.createHash("sha256").update(key).digest("hex");}
  async increment(key) {
    const result = await this.store.query(
      `INSERT INTO http_rate_limits(namespace,key_hash,hits,expires_at)
       VALUES ($1,$2,1,now()+$3*interval '1 millisecond')
       ON CONFLICT(namespace,key_hash) DO UPDATE SET
       hits=CASE WHEN http_rate_limits.expires_at<=now() THEN 1 ELSE http_rate_limits.hits+1 END,
       expires_at=CASE WHEN http_rate_limits.expires_at<=now() THEN now()+$3*interval '1 millisecond' ELSE http_rate_limits.expires_at END
       RETURNING hits,expires_at`,[this.namespace,this.hash(key),this.windowMs]);
    return {totalHits:result.rows[0].hits,resetTime:new Date(result.rows[0].expires_at)};
  }
  async decrement(key) {
    await this.store.query("UPDATE http_rate_limits SET hits=greatest(0,hits-1) WHERE namespace=$1 AND key_hash=$2",[this.namespace,this.hash(key)]);
  }
  async resetKey(key) {
    await this.store.query("DELETE FROM http_rate_limits WHERE namespace=$1 AND key_hash=$2",[this.namespace,this.hash(key)]);
  }
}
module.exports={PostgresRateLimitStore};
