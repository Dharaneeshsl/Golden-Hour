class Doctor { constructor({ id, name, wallet, verified = false }) { Object.assign(this, { id, name, wallet, verified }); } }
module.exports = Doctor;
