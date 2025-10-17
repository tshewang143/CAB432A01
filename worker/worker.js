require("../config/env");
const os = require("os");

const { receiveOne, deleteMessage } = require("../config/sqs");
const { transcodeS3ToS3 } = require("../config/transcoder");
const { getJob, lockJob, completeJob } = require("../models/Job");
const { headObject } = require("../utils/videoProcessor");
const { logEvent } = require("../models/Audit");

const WORKER_ID = `${os.hostname()}-${process.pid}`;

async function tryLog(evt) {
  try { await logEvent(evt); }
  catch (e) { console.warn("[audit] logEvent failed:", e.message); }
}

async function handleTranscode(msg) {
  const {
    videoId, userId, rawKey, outputKey,
    resolution, forceFormat = "mp4", preset = "slow", crf = "20"
  } = msg;

  // Acquire a lock so two workers don't process same job (idempotency safety)
  const got = await lockJob(videoId, WORKER_ID, Number(process.env.SQS_VISIBILITY_TIMEOUT || 900));
  if (!got) return; // another worker took it

  await tryLog({ userId, videoId, action: "JOB_PROCESSING", details: { worker: WORKER_ID } });

  try {
    await transcodeS3ToS3({ inputKey: rawKey, outputKey, resolution, forceFormat, preset, crf });
    await headObject(outputKey); // verify output exists
    await completeJob(videoId, true);
    await tryLog({ userId, videoId, action: "JOB_COMPLETED", details: { outputKey } });
  } catch (e) {
    await completeJob(videoId, false, e.message);
    await tryLog({ userId, videoId, action: "JOB_FAILED", details: { error: e.message } });
    // By NOT deleting the SQS message, it can be retried after visibility timeout.
    // If you prefer 1 try only, just fall through to delete below on failure.
    throw e;
  }
}

async function loop() {
  console.log("[worker] up:", WORKER_ID);
  while (true) {
    try {
      const msg = await receiveOne();   // long poll
      if (!msg) continue;

      const body = JSON.parse(msg.Body || "{}");
      if (body.type === "TRANSCODE") {
        try {
          await handleTranscode(body);
          await deleteMessage(msg.ReceiptHandle); // done
        } catch (e) {
          // Leave the message to reappear after visibility timeout.
          // Add DLQ on the queue to avoid infinite retries.
          console.error("[worker] transcode failed; will be retried:", e.message);
        }
      } else {
        console.warn("[worker] unknown message type; deleting");
        await deleteMessage(msg.ReceiptHandle);
      }
    } catch (e) {
      console.error("[worker] loop error:", e);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

loop();
