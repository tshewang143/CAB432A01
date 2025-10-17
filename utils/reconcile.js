// utils/reconcile.js (CJS) – heal stale PROCESSING jobs whose lockTTL has expired
require("../config/env"); // <<< ensure env present

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { objectExists } = require("../config/transcoder");
const { completeJob } = require("../models/Job");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const TABLE  = process.env.DDB_TABLE;
const BUCKET = process.env.S3_BUCKET;

const ddb = new DynamoDBClient({ region: REGION });

async function reconcile() {
  if (!TABLE || !BUCKET) {
    console.log("[reconcile] Missing TABLE or BUCKET env, skipping");
    return;
  }
  console.log("[reconcile] start");

  const scan = await ddb.send(new ScanCommand({ TableName: TABLE }));
  const items = (scan.Items || []).map(unmarshall);

  const now = Math.floor(Date.now() / 1000);
  for (const item of items) {
    if (item.status === "PROCESSING" && item.lockTTL && now > Number(item.lockTTL)) {
      try {
        const ok = await objectExists(BUCKET, item.outputKey);
        if (ok) {
          await completeJob(item.videoId, true);
          console.log(`[reconcile] ${item.videoId} -> COMPLETED (output exists)`);
        } else {
          await completeJob(item.videoId, false, "Stale lock and no output; marking FAILED");
          console.log(`[reconcile] ${item.videoId} -> FAILED (no output)`);
        }
      } catch (e) {
        console.warn(`[reconcile] ${item.videoId} error: ${e.message}`);
      }
    }
  }
  console.log("[reconcile] done");
}

module.exports = { reconcile };
