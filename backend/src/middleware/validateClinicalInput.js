const {requireAuth} = require("./authMiddleware");
function validateClinicalInput(req,res,next) {
  if (!["POST","PUT","PATCH","DELETE"].includes(req.method) ||
      !/^\/(patients|records|doctors|consents|emergency-access|recovery|compliance)(\/|$)/.test(req.path)) return next();
  return requireAuth(req,res,()=>validateBody(req,res,next));
}
function validateBody(req,res,next) {
  const body = req.body;
  if (body!==undefined && (body===null || typeof body!=="object" || Array.isArray(body))) return res.status(400).json({error:"A JSON object is required"});
  for (const key of ["wallet","oldWallet","invitationToken","cardToken"]) {
    if (body?.[key]!==undefined && (typeof body[key]!=="string" || body[key].length>200)) return res.status(400).json({error:"Invalid identity field"});
  }
  for (const key of ["notes","details","justification","proofReference","caseReference","facility","reasonCode","recordType"]) {
    if (body?.[key]!==undefined && (typeof body[key]!=="string" || body[key].length>2000)) return res.status(400).json({error:"Text fields must contain at most 2000 characters"});
  }
  if (req.path==="/records" && req.method==="POST" &&
      (typeof body?.recordType!=="string" || !body.recordType.trim() || body.recordType.length>200)) {
    return res.status(400).json({error:"recordType must contain 1 to 200 characters"});
  }
  if (req.app.get("store")?.query && ["/records","/emergency-access"].includes(req.path) && !body?.cardToken &&
      (typeof body?.patientId!=="string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.patientId))) {
    return res.status(400).json({error:"A valid patient identifier is required"});
  }
  next();
}
module.exports={validateClinicalInput};
