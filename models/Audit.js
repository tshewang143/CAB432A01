// models/Audit.js
const { getPool } = require("../config/rds");

function tableName() {
  const prefix = process.env.RDS_PREFIX || "demo";
  return `${prefix}_audit_log`;
}

async function logEvent({ userId, username, videoId, action, details }) {
  const p = getPool();
  const table = tableName();
  await p.query(
    `INSERT INTO ${table} (user_id, username, video_id, action, details)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId || null, username || null, videoId || null, action, details ? JSON.stringify(details) : null]
  );
}

async function listRecentEvents({ userId, limit = 50 }) {
  const p = getPool();
  const table = tableName();
  if (userId) {
    const { rows } = await p.query(
      `SELECT id, occurred_at, user_id, username, video_id, action, details
         FROM ${table}
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        LIMIT $2`,
      [String(userId), limit]
    );
    return rows;
  } else {
    const { rows } = await p.query(
      `SELECT id, occurred_at, user_id, username, video_id, action, details
         FROM ${table}
        ORDER BY occurred_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  }
}

module.exports = { logEvent, listRecentEvents };
