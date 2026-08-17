class Hospital { constructor({ id, name, registrationNumber, verified = false }) { Object.assign(this, { id, name, registrationNumber, verified }); } }
module.exports = Hospital;
