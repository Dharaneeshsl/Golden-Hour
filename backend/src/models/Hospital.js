class Hospital {
  constructor({ id, name, registrationNumber, verified = false, createdAt }) {
    this.id = id;
    this.name = name;
    this.registrationNumber = registrationNumber;
    this.verified = Boolean(verified);
    this.createdAt = createdAt || new Date().toISOString();
  }

  static fromDb(row) {
    if (!row) return null;
    return new Hospital({
      id: row.id,
      name: row.name,
      registrationNumber: row.registration_number || row.registrationNumber,
      verified: row.verified,
      createdAt: row.created_at || row.createdAt,
    });
  }
}

module.exports = Hospital;
