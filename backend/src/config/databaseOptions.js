const fs=require("fs");
function databaseOptions(input=process.env.DATABASE_URL) {
  if (!input) throw new Error("DATABASE_URL is required");
  const url=new URL(input);
  if (!["postgres:","postgresql:"].includes(url.protocol)) throw new Error("A PostgreSQL connection is required");
  const mode=url.searchParams.get("sslmode");
  if (["sslrootcert","sslcert","sslkey"].some(key=>url.searchParams.has(key))) throw new Error("Configure database certificates through trusted environment settings");
  const enabled=process.env.DB_SSL==="true" || ["require","verify-ca","verify-full"].includes(mode);
  if (process.env.NODE_ENV==="production" && (!enabled || mode==="disable" || process.env.DB_REJECT_UNAUTHORIZED==="false")) throw new Error("Production requires verified database TLS");
  url.searchParams.delete("sslmode");
  const binding=url.searchParams.get("channel_binding");
  url.searchParams.delete("channel_binding");
  let ca=process.env.DB_CA_PEM;
  if (!ca && process.env.DB_CA) ca=fs.readFileSync(process.env.DB_CA,"utf8");
  return {connectionString:url.href,enableChannelBinding:binding!=="disable",
    ...(enabled ? {ssl:{rejectUnauthorized:process.env.DB_REJECT_UNAUTHORIZED!=="false",...(ca ? {ca} : {})}} : {})};
}
module.exports={databaseOptions};
