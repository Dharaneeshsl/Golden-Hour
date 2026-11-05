const crypto=require("crypto");
function privateObjectStore(store) {
  return {
    async uploadEncrypted(payload) {
      const cid=crypto.randomUUID();
      await store.query("INSERT INTO encrypted_objects(id,payload) VALUES ($1,$2)",[cid,payload]);
      return {cid,persisted:true};
    },
    async fetchEncrypted(cid) {
      if (typeof cid!=="string" || !/^[a-f0-9-]{36}$/i.test(cid)) throw new Error("Invalid private object identifier");
      const result=await store.query("SELECT payload FROM encrypted_objects WHERE id=$1",[cid]);
      if (!result.rowCount) throw new Error("Private record object unavailable");
      return result.rows[0].payload;
    }
  };
}
module.exports={privateObjectStore};
