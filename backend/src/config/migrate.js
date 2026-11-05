const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");
const {databaseOptions} = require("./databaseOptions");

if (!process.env.DATABASE_URL && require.main === module) {
  throw new Error("DATABASE_URL required for running database migrations");
}

function getDbSslConfig() {return databaseOptions().ssl;}

async function runMigrations() {
  if (!process.env.DATABASE_URL) return;
  const pool = new Pool(databaseOptions());

  const client = await pool.connect();
  try {
    // Acquire session-level advisory lock on dedicated client
    await client.query("SELECT pg_advisory_lock(849204819);");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = process.env.MIGRATIONS_DIR || path.join(__dirname, "../../migrations");
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const res = await client.query(
          "SELECT filename FROM schema_migrations WHERE filename = $1",
          [file]
        );
        if (res.rowCount === 0) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
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
          }
        } else {
          console.log(`Migration ${file} already applied.`);
        }
      }
    }

    console.log("All database migrations complete.");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(849204819);");
    } catch (e) {
      console.warn("Could not release advisory lock:", e.message);
    }
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runMigrations, getDbSslConfig, databaseOptions };
