class Doctor {
  constructor({ id, name, wallet, licenseNumber, specialty, status = "pending", createdAt }) {
    this.id = id;
    this.name = name;
    this.wallet = wallet;
    this.licenseNumber = licenseNumber;
    this.specialty = specialty;
    this.status = status;
    this.createdAt = createdAt;
  }

  isVerified() {
    return this.status === "verified";
  }

  isSuspended() {
    return this.status === "suspended";
  }

  static fromDb(row) {
    if (!row) return null;
    return new Doctor({
      id: row.id,
      name: row.name,
      wallet: row.wallet,
      licenseNumber: row.license_number || row.licenseNumber,
      specialty: row.specialty,
      status: row.status,
      createdAt: row.created_at || row.createdAt,
    });
  }
}

module.exports = Doctor;
