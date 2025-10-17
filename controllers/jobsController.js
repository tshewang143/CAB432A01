// controllers/jobsController.js (CJS)
const os = require("os");
const {
  BUCKET,
  s3Put,
  presignUpload,      // for client → S3 direct uploads
  presignDownload,
  headObject,
} = require("../utils/videoProcessor");
const { transcodeS3ToS3 } = require("../config/transcoder");
const {
  createJobOnce,
  getJob,
  listJobsForUser,
  lockJob,
  completeJob,
} = require("../models/Job");
const { logEvent } = require("../models/Audit"); // RDS audit
const { enqueueMessage } = require("../config/sqs"); // <<< NEW: SQS producer

const WORKER_ID = `${os.hostname()}-${process.pid}`;
const RUN_INPROC_WORKER = String(process.env.START_WORKER_ON_API || "false").toLowerCase() === "true";

/* -------------------- helpers -------------------- */
async function tryLog(evt) {
  try { await logEvent(evt); }
  catch (e) { console.warn("[audit] logEvent failed:", e.message); }
}

/* --------------------------------------------------
 * FLOW A: Existing “proxy upload” (client → Node → S3)
 * -------------------------------------------------- */
async function createTranscodeJob(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "Missing file 'video'" });
    if (!BUCKET) throw new Error("S3_BUCKET env not set");

    const videoId = `v_${Date.now()}`;
    const rawKey = `raw/${user.userId}/${videoId}-${req.file.originalname}`;
    const outputKey = `transcoded/${user.userId}/${videoId}.mp4`;

    const title = req.body.title || "";
    const description = req.body.description || "";
    const format = (req.body.format || "mp4").toLowerCase();
    const resolution = req.body.resolution || "720p";

    // 1) upload raw to S3 (API proxy path)
    await s3Put(
      rawKey,
      req.file.buffer,
      req.file.mimetype || "application/octet-stream"
    );

    // 2) write DynamoDB metadata
    await createJobOnce({
      videoId,
      userId: String(user.userId),
      username: user.username || "",
      bucket: BUCKET,
      rawKey,
      outputKey,
      title,
      description,
      formatRequested: format,
      resolutionRequested: resolution,
      createdAt: new Date().toISOString(),
    });

    // AUDIT
    await tryLog({
      userId: String(user.userId),
      username: user.username || "",
      videoId,
      action: "JOB_CREATED",
      details: { source: "proxy", rawKey, outputKey, format, resolution, title, description },
    });

    // 3) enqueue to SQS (ECS workers will process)
    await enqueueMessage({
      type: "TRANSCODE",
      videoId,
      userId: String(user.userId),
      rawKey,
      outputKey,
      resolution,
      forceFormat: "mp4",
      preset: "slow",
      crf: "20",
    });

    // 4) respond ASAP
    res.status(202).json({ message: "queued", videoId });

    // 5) OPTIONAL: inline worker on API box (leave disabled in EC2 prod)
    if (RUN_INPROC_WORKER) {
      setImmediate(async () => {
        const got = await lockJob(videoId, WORKER_ID, 900);
        if (!got) return;

        await tryLog({
          userId: String(user.userId),
          username: user.username || "",
          videoId,
          action: "JOB_PROCESSING",
          details: { worker: WORKER_ID, path: "inline" },
        });

        try {
          await transcodeS3ToS3({
            inputKey: rawKey,
            outputKey,
            resolution,
            forceFormat: "mp4",
            preset: "slow",
            crf: "20",
          });

          await headObject(outputKey); // verify output exists
          await completeJob(videoId, true);

          await tryLog({
            userId: String(user.userId),
            username: user.username || "",
            videoId,
            action: "JOB_COMPLETED",
            details: { outputKey },
          });
        } catch (e) {
          await completeJob(videoId, false, e.message);

          await tryLog({
            userId: String(user.userId),
            username: user.username || "",
            videoId,
            action: "JOB_FAILED",
            details: { error: e.message },
          });
        }
      });
    }
  } catch (err) {
    console.error("[createTranscodeJob] error:", err);
    res.status(500).json({ error: err.message || "Failed to create job" });
  }
}

/* --------------------------------------------------
 * FLOW B: Pre-signed upload (client → S3 directly)
 * -------------------------------------------------- */

// Step 1: get a presigned PUT URL for the raw upload
async function presignRawUpload(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!BUCKET) throw new Error("S3_BUCKET env not set");

    const { filename, contentType } = req.body || {};
    if (!filename) return res.status(400).json({ error: "filename required" });

    const videoId = `v_${Date.now()}`;
    const rawKey = `raw/${user.userId}/${videoId}-${filename}`;

    const { uploadUrl, key } = await presignUpload(
      rawKey,
      contentType || "application/octet-stream",
      600
    );

    await tryLog({
      userId: String(user.userId),
      username: user.username || "",
      videoId,
      action: "PRESIGN_UPLOAD_ISSUED",
      details: { key, contentType: contentType || null, expiresIn: 600 },
    });

    return res.json({ videoId, rawKey: key, uploadUrl, bucket: BUCKET, expiresIn: 600 });
  } catch (err) {
    console.error("[presignRawUpload] error:", err);
    res.status(500).json({ error: err.message || "Failed to presign upload" });
  }
}

// Step 2: after browser PUTs to S3, call this to create job & enqueue transcode
async function startTranscodeFromS3(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!BUCKET) throw new Error("S3_BUCKET env not set");

    const {
      videoId,
      rawKey,
      title = "",
      description = "",
      format = "mp4",
      resolution = "720p",
    } = req.body || {};
    if (!videoId || !rawKey) return res.status(400).json({ error: "videoId and rawKey are required" });

    const outputKey = `transcoded/${user.userId}/${videoId}.mp4`;

    // Create job record
    await createJobOnce({
      videoId,
      userId: String(user.userId),
      username: user.username || "",
      bucket: BUCKET,
      rawKey,
      outputKey,
      title,
      description,
      formatRequested: String(format).toLowerCase(),
      resolutionRequested: resolution,
      createdAt: new Date().toISOString(),
    });

    await tryLog({
      userId: String(user.userId),
      username: user.username || "",
      videoId,
      action: "JOB_CREATED",
      details: { source: "directS3", rawKey, outputKey, format, resolution, title, description },
    });

    // ENQUEUE work to ECS workers
    await enqueueMessage({
      type: "TRANSCODE",
      videoId,
      userId: String(user.userId),
      rawKey,
      outputKey,
      resolution,
      forceFormat: "mp4",
      preset: "slow",
      crf: "20",
    });

    // Respond immediately
    res.status(202).json({ message: "queued", videoId });

    // OPTIONAL inline fallback (normally off)
    if (RUN_INPROC_WORKER) {
      setImmediate(async () => {
        const got = await lockJob(videoId, WORKER_ID, 900);
        if (!got) return;

        await tryLog({
          userId: String(user.userId),
          username: user.username || "",
          videoId,
          action: "JOB_PROCESSING",
          details: { worker: WORKER_ID, path: "inline" },
        });

        try {
          await transcodeS3ToS3({
            inputKey: rawKey,
            outputKey,
            resolution,
            forceFormat: "mp4",
            preset: "slow",
            crf: "20",
          });

          await headObject(outputKey);
          await completeJob(videoId, true);

          await tryLog({
            userId: String(user.userId),
            username: user.username || "",
            videoId,
            action: "JOB_COMPLETED",
            details: { outputKey },
          });
        } catch (e) {
          await completeJob(videoId, false, e.message);

          await tryLog({
            userId: String(user.userId),
            username: user.username || "",
            videoId,
            action: "JOB_FAILED",
            details: { error: e.message },
          });
        }
      });
    }
  } catch (err) {
    console.error("[startTranscodeFromS3] error:", err);
    res.status(500).json({ error: err.message || "Failed to start job" });
  }
}

/* -------------------- status & list & download -------------------- */
async function getJobStatus(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const job = await getJob(req.params.id);
  if (!job || String(job.userId) !== String(user.userId))
    return res.status(404).json({ error: "Not found" });

  res.json(job);
}

async function listMyJobs(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const items = await listJobsForUser(String(user.userId));
    const sortBy = req.query.sortBy || "createdAt";
    const order = (req.query.sortOrder || "DESC").toUpperCase();
    items.sort((a, b) => {
      const av = a[sortBy] || "";
      const bv = b[sortBy] || "";
      return order === "ASC"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    res.json({ jobs: items, pagination: { page: 1, pages: 1 } });
  } catch (err) {
    console.error("[listMyJobs] error:", err);
    res.status(500).json({ error: "Failed to list jobs" });
  }
}

async function downloadPresigned(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const job = await getJob(req.params.id);
  if (!job || String(job.userId) !== String(user.userId))
    return res.status(404).json({ error: "Not found" });
  if (job.status !== "COMPLETED") return res.status(409).json({ error: "Not ready" });

  const url = await presignDownload(job.outputKey, 600);

  await tryLog({
    userId: String(user.userId),
    username: user.username || "",
    videoId: job.videoId,
    action: "DOWNLOAD",
    details: { key: job.outputKey },
  });

  res.json({ url });
}

module.exports = {
  // existing
  createTranscodeJob,
  getJobStatus,
  listMyJobs,
  downloadPresigned,
  // new (pre-signed upload flow)
  presignRawUpload,
  startTranscodeFromS3,
};
