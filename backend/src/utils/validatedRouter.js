const express = require("express");
const {ethers} = require("ethers");
function validatedRouter() {
  const router = express.Router();
  for (const name of ["id","patientId","recordId","accessId"]) {
    router.param(name,(req,res,next,value) => {
      const strict = Boolean(req.app.get("store")?.query);
      const valid = strict ? /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value) : /^[A-Za-z0-9_-]{1,128}$/.test(value);
      return valid ? next() : res.status(400).json({error:"Invalid resource identifier"});
    });
  }
  router.param("wallet",(req,res,next,value) => (ethers.isAddress(value) || /^user:[a-f0-9-]{36}$/i.test(value)) ? next() : res.status(400).json({error:"Invalid wallet address"}));
  return router;
}
module.exports={validatedRouter};
