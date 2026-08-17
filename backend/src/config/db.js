// Database seam: replace this adapter with a reviewed PostgreSQL/Mongo implementation in production.
module.exports = { databaseUrl: process.env.DATABASE_URL || "memory://goldenhour-demo" };
