function subjectId(value) {
  return typeof value==="string" && /^user:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value) ? value.slice(5) : null;
}
function ownsPatient(patient,user) {
  return Boolean(patient?.userId && user?.userId && patient.userId===user.userId) ||
    (typeof patient?.wallet==="string" && typeof user?.wallet==="string" && patient.wallet.toLowerCase()===user.wallet.toLowerCase());
}
module.exports={subjectId,ownsPatient};
