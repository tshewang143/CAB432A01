// worker/worker.js
// No absolute .env path; rely on ECS task env (or a local .env if present)
try { require("dotenv").config(); } catch {}

const os = require("os");
const { receiveOne, deleteMessage, extendVisibility } = require("../config/sqs");
const { transcodeS3ToS3 } = require("../config/transcoder");
const { lockJob, completeJob } = require("../models/Job");
const { headObject } = require("../utils/videoProcessor");
const { logEvent } = require("../models/Audit");

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const VIS_SEC = Number(process.env.SQS_VISIBILITY_TIMEOUT || 900); // default 15 min

async function tryLog(evt) {
  try { await logEvent(evt); }
  catch (e) { console.warn("[audit] logEvent failed:", e.message); }
}

// Handle a parsed TRANSCODE body (NOT the SQS raw message)
async function handleTranscode(body) {
  const {
    videoId,
    userId,
    rawKey,
    outputKey,
    resolution = "720p",
    forceFormat = "mp4",
    preset = "slow",
    crf = "20"
  } = body || {};

  if (!videoId || !rawKey || !outputKey) {
    throw new Error("MISSING_FIELDS");
  }

  console.log(`[worker] Processing videoId=${videoId} rawKey=${rawKey} -> ${outputKey}`);

  // Acquire a lock so two workers don't process the same job
  const got = await lockJob(videoId, WORKER_ID, VIS_SEC);
  if (!got) {
    console.warn(`[worker] LOCK_NOT_ACQUIRED for ${videoId}; leaving message for retry`);
    // IMPORTANT: throw so caller DOES NOT delete the message
    const err = new Error("LOCK_NOT_ACQUIRED");
    err.code = "LOCK_NOT_ACQUIRED";
    throw err;
  }

  await tryLog({
    userId: userId || "unknown",
    videoId,
    action: "JOB_PROCESSING",
    details: { worker: WORKER_ID, rawKey, outputKey }
  });

  try {
    await transcodeS3ToS3({ inputKey: rawKey, outputKey, resolution, forceFormat, preset, crf });
    await headObject(outputKey); // verify output exists
    await completeJob(videoId, true);

    await tryLog({
      userId: userId || "unknown",
      videoId,
      action: "JOB_COMPLETED",
      details: { outputKey }
    });

    console.log(`[worker] Successfully processed ${videoId}`);
  } catch (e) {
    console.error(`[worker] Transcode failed for ${videoId}:`, e.message);
    await completeJob(videoId, false, e.message);
    await tryLog({
      userId: userId || "unknown",
      videoId,
      action: "JOB_FAILED",
      details: { error: e.message }
    });
    // Re-throw so caller DOES NOT delete the message (let SQS retry / DLQ)
    throw e;
  }
}

async function processMessage(msg) {
  const receipt = msg.ReceiptHandle;
  let body;
  try {
    body = JSON.parse(msg.Body || "{}");
  } catch (e) {
    console.error("[worker] Invalid JSON body; deleting message:", e.message);
    await deleteMessage(receipt); // malformed → drop
    return;
  }

  const type = body.type;
  if (type !== "TRANSCODE") {
    console.warn("[worker] Unknown message type; deleting:", type);
    await deleteMessage(receipt);
    return;
  }

  // Heartbeat: extend visibility during long ffmpeg runs
  const hb = setInterval(() => {
    extendVisibility(receipt, Math.max(300, VIS_SEC))
      .catch(err => console.warn("[worker] heartbeat failed:", err.message));
  }, 120_000);

  try {
    console.log("[worker] messageId:", msg.MessageId, "videoId:", body.videoId);
    await handleTranscode(body);
    await deleteMessage(receipt); // only on success
    console.log("[worker] Message deleted:", msg.MessageId);
  } catch (e) {
    if (e && e.code === "LOCK_NOT_ACQUIRED") {
      // Leave message for retry
      console.warn("[worker] Leaving message for retry due to lock");
    } else {
      console.error("[worker] Processing failed; will be retried:", e.message);
    }
  } finally {
    clearInterval(hb);
  }
}

async function mainLoop() {
  console.log("[worker] Starting worker:", WORKER_ID);
  console.log("[worker] SQS Queue:", process.env.SQS_QUEUE_URL);

  while (true) {
    try {
      const msg = await receiveOne(); // long poll
      if (msg) {
        await processMessage(msg);
      } else {
        // No message; small idle backoff
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      console.error("[worker] Error in main loop:", e.message);
      await new Promise(r => setTimeout(r, 3000)); // brief backoff
    }
  }
}

// Run if called directly
if (require.main === module) {
  mainLoop().catch(e => {
    console.error("[worker] Fatal error:", e);
    process.exit(1);
  });
}

module.exports = { mainLoop };
