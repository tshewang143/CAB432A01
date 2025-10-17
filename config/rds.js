// config/rds.js
const { Pool } = require("pg");

function makePool() {
  const sslMode = (process.env.RDS_SSL || "require").toLowerCase();
  // For RDS shared cluster: sslmode=require (verify CA not necessary here)
  const ssl =
    sslMode === "require"
      ? { rejectUnauthorized: false }
      : false;

  return new Pool({
    host: process.env.RDS_HOST,
    port: Number(process.env.RDS_PORT || 5432),
    database: process.env.RDS_DB,
    user: process.env.RDS_USER,
    password: process.env.RDS_PASSWORD,
    ssl,
    max: 5, // light pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
}

let pool;
function getPool() {
  if (!pool) pool = makePool();
  return pool;
}

// Create a per-student audit table (namespaced by RDS_PREFIX)
async function migrateAudit() {
  const p = getPool();
  const prefix = process.env.RDS_PREFIX || "demo";
  const table = `${prefix}_audit_log`;

  const ddl = `
    CREATE TABLE IF NOT EXISTS ${table} (
      id           BIGSERIAL PRIMARY KEY,
      occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id      TEXT,
      username     TEXT,
      video_id     TEXT,
      action       TEXT NOT NULL,
      details      JSONB
    );
    CREATE INDEX IF NOT EXISTS ${table}_idx_occurred_at ON ${table}(occurred_at DESC);
    CREATE INDEX IF NOT EXISTS ${table}_idx_user ON ${table}(user_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS ${table}_idx_action ON ${table}(action, occurred_at DESC);
  `;
  await p.query(ddl);
  return table;
}

module.exports = { getPool, migrateAudit };
