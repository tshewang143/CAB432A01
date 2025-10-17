// models/Job.js (CJS) — DynamoDB model with removeUndefinedValues
require("../config/env"); // ensure .env loaded before reading process.env

const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

// ---- config
const REGION  = process.env.AWS_REGION || "ap-southeast-2";
const TABLE   = process.env.DDB_TABLE;
const HAS_GSI = String(process.env.DDB_HAS_GSI || "false").toLowerCase() === "true";

if (!TABLE) {
  console.warn("[JobModel] DDB_TABLE is not set. Writes will fail.");
}

const ddb = new DynamoDBClient({ region: REGION });

// marshall helpers (removes any undefined in maps/arrays/sets)
const M_OPTS = { removeUndefinedValues: true, convertClassInstanceToMap: true };
const m = (obj) => marshall(obj, M_OPTS);

// ----------------- API -----------------

/** Create once (idempotent) – will fail if videoId already exists */
async function createJobOnce(item) {
  if (!TABLE) throw new Error("DDB_TABLE not configured");

  // Defensive defaults to avoid undefined
  const safe = {
    videoId: String(item.videoId),
    userId:  String(item.userId),
    username: item.username ?? "",
    status: "QUEUED",
    createdAt: item.createdAt || new Date().toISOString(),
    bucket: item.bucket ?? "",
    rawKey: item.rawKey ?? "",
    outputKey: item.outputKey ?? "",
    title: item.title ?? "",
    description: item.description ?? "",
    formatRequested: item.formatRequested ?? "mp4",
    resolutionRequested: item.resolutionRequested ?? "720p",
    // lock fields intentionally omitted until lockJob()
  };

  // Quick sanity check to catch the most common causes
  for (const k of ["videoId", "userId", "bucket", "rawKey", "outputKey"]) {
    if (!safe[k]) throw new Error(`[createJobOnce] required field '${k}' missing/empty`);
  }

  await ddb.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: m(safe),
      ConditionExpression: "attribute_not_exists(videoId)",
    })
  );

  return safe;
}

/** Acquire a processing lock (stateless worker safety) */
async function lockJob(videoId, workerId, ttlSeconds = 15 * 60) {
  if (!TABLE) throw new Error("DDB_TABLE not configured");

  const lockTTL = Math.floor(Date.now() / 1000) + ttlSeconds;

  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: m({ videoId }),
        UpdateExpression:
          "SET #status = :processing, lockedBy = :w, lockTTL = :t",
        ConditionExpression:
          "attribute_not_exists(#status) OR #status IN (:queued, :failed)",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: m({
          ":processing": "PROCESSING",
          ":queued": "QUEUED",
          ":failed": "FAILED",
          ":w": workerId,
          ":t": lockTTL,
        }),
        ReturnValues: "ALL_NEW",
      })
    );
    return true;
  } catch {
    return false; // another worker owns it
  }
}

/** Mark job as completed/failed and clear lock */
async function completeJob(videoId, ok, errMsg) {
  if (!TABLE) throw new Error("DDB_TABLE not configured");

  // Build update with marshalling that ignores undefined
  const names = {
    "#status": "status",
    "#completedAt": "completedAt",
  };
  let updateExpr = "SET #status = :s, #completedAt = :ts REMOVE lockedBy, lockTTL";
  const values = {
    ":s": ok ? "COMPLETED" : "FAILED",
    ":ts": new Date().toISOString(),
  };

  if (!ok && errMsg) {
    names["#errorMessage"] = "errorMessage";
    updateExpr = "SET #status = :s, #completedAt = :ts, #errorMessage = :e REMOVE lockedBy, lockTTL";
    values[":e"] = String(errMsg);
  }

  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: m({ videoId }),
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: m(values),
    })
  );
}

/** Generic partial update (still useful in places) */
async function updateJob(videoId, patch) {
  if (!TABLE) throw new Error("DDB_TABLE not configured");
  if (!patch || typeof patch !== "object") return;

  const names = {};
  const values = {};
  const sets = [];

  // filter out undefined to avoid marshall error
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const nk = `#${k}`;
    const vk = `:${k}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
  }
  if (!sets.length) return;

  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: m({ videoId }),
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: m(values),
    })
  );
}

/** Fetch one job by id */
async function getJob(videoId) {
  if (!TABLE) throw new Error("DDB_TABLE not configured");
  const out = await ddb.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: m({ videoId }),
    })
  );
  return out.Item ? unmarshall(out.Item) : null;
}

/** List jobs for a given user (use GSI if available, else Scan) */
async function listJobsForUser(userId) {
  if (!TABLE) throw new Error("DDB_TABLE not configured");

  if (HAS_GSI) {
    try {
      const out = await ddb.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: "byUserId",
          KeyConditionExpression: "userId = :u",
          ExpressionAttributeValues: m({ ":u": String(userId) }),
        })
      );
      return (out.Items || []).map(unmarshall);
    } catch (e) {
      console.warn("[JobModel] GSI query failed, falling back to Scan:", e.message);
    }
  }

  const scan = await ddb.send(new ScanCommand({ TableName: TABLE }));
  const all = (scan.Items || []).map(unmarshall);
  return all.filter((x) => String(x.userId) === String(userId));
}

module.exports = {
  createJobOnce,
  lockJob,
  completeJob,
  updateJob,
  getJob,
  listJobsForUser,
};
