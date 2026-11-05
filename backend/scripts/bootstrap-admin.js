const {Pool} = require("pg");
const {PostgresStore} = require("../src/config/db");
const {ensurePhoneUser,validPhone} = require("../src/services/phoneAuthService");
const {databaseOptions} = require("../src/config/migrate");
async function main() {
  const phone=process.env.ADMIN_PHONE;
  if (!validPhone(phone) || !process.env.DATABASE_URL) throw new Error("Operator database credentials and ADMIN_PHONE required");
  const pool=new Pool(databaseOptions());
  try {
    const user=await ensurePhoneUser(new PostgresStore(pool),phone);
    console.info("Add this stable account ID to ADMIN_USER_IDS:",user.id);
  } finally {await pool.end();}
}
main().catch(()=>{console.error("Administrator provisioning failed");process.exitCode=1;});
