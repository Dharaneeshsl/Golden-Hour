function listRecords(records, req, res) { return res.json([...records.values()].filter((record) => record.patientId === req.params.patientId)); }
module.exports = { listRecords };
