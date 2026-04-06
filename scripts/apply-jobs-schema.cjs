/**
 * Applies SQL to Supabase Postgres (password from .env.local).
 *
 *   node scripts/apply-jobs-schema.cjs           → reset_jobs_table.sql (jobs only)
 *   node scripts/apply-jobs-schema.cjs --nuke    → nuke_public_and_create_jobs.sql
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const NUKE = process.argv.includes("--nuke");

function loadEnvLocal() {
  const p = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(p)) {
    throw new Error("Missing .env.local (add SUPABASE_DB_PASSWORD)");
  }
  const env = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const password = env.SUPABASE_DB_PASSWORD;
  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD missing in .env.local");
  }

  const sqlFile = NUKE
    ? "nuke_public_and_create_jobs.sql"
    : "reset_jobs_table.sql";
  const sqlPath = path.join(__dirname, "..", "supabase", sqlFile);
  const sql = fs.readFileSync(sqlPath, "utf8");

  const connectionString = `postgresql://postgres:${encodeURIComponent(
    password
  )}@db.ozjccqonrkwnwttwruow.supabase.co:5432/postgres`;

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(sql);
  await client.end();
  if (NUKE) {
    console.log(
      "Done: dropped all public tables (except PostGIS catalogs), recreated jobs + RLS."
    );
  } else {
    console.log(
      "Done: dropped old jobs table (if any) and created a fresh one with RLS."
    );
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
