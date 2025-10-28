// worker/notifyWorker.js
require("dotenv").config();
const { receiveOne, deleteMessage } = require("../config/sqs");
const { logEvent } = require("../models/Audit");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.RDS_HOST,
  port: Number(process.env.RDS_PORT || 5432),
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DB,
  ssl: process.env.RDS_SSL ? { rejectUnauthorized: false } : undefined,
});

async function saveNotification({ userId, videoId, outputKey }) {
  const table = `${process.env.RDS_PREFIX}_notifications`;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${table}(
       id serial primary key,
       user_id text not null,
       video_id text not null,
       output_key text,
       created_at timestamptz default now()
     )`
  );
  await pool.query(
    `INSERT INTO ${table}(user_id, video_id, output_key) VALUES ($1,$2,$3)`,
    [userId, videoId, outputKey]
  );
}

async function handle(msg) {
  const body = JSON.parse(msg.Body || "{}");
  if (body.type !== "NOTIFY") return;

  const { userId, videoId, outputKey } = body;
  await saveNotification({ userId, videoId, outputKey });

  await logEvent({
    userId: userId || "unknown",
    videoId,
    action: "USER_NOTIFIED",
    details: { outputKey }
  });
  console.log(`[notify] recorded notification: videoId=${videoId} userId=${userId}`);
}

async function loop() {
  console.log("[notify] up");
  while (true) {
    try {
      const msg = await receiveOne();      // reads from SQS_QUEUE_URL env
      if (!msg) continue;
      await handle(msg);
      await deleteMessage(msg.ReceiptHandle);
    } catch (e) {
      console.error("[notify] error:", e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

if (require.main === module) {
  loop().catch(e => { console.error(e); process.exit(1); });
}
