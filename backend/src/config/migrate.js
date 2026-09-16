const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");

if (!process.env.DATABASE_URL && require.main === module) {
  throw new Error("DATABASE_URL required for running database migrations");
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) return;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = path.join(__dirname, "../../migrations");
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const res = await pool.query(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (res.rowCount === 0) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1)",
            [file]
          );
          await client.query("COMMIT");
          console.log(`Successfully applied migration: ${file}`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`Migration failed on file ${file}:`, err);
          throw err;
        } finally {
          client.release();
        }
      } else {
        console.log(`Migration ${file} already applied.`);
      }
    }

    console.log("All database migrations complete.");
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runMigrations };