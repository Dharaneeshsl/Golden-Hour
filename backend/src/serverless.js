function createHandler(initialize) {
  let pending;
  return async function handler(req,res) {
    try {
      pending ||= Promise.resolve().then(initialize);
      const app = await pending;
      return app(req,res);
    } catch {
      pending = undefined;
      res.setHeader("Cache-Control","no-store");
      res.statusCode = 503;
      res.setHeader("Content-Type","application/json");
      res.end(JSON.stringify({error:"Service unavailable. Follow the hospital's usual care procedure."}));
    }
  };
}
module.exports={createHandler};
