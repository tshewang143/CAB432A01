// routes/jobs.js (CJS)
const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/auth");
const upload = require("../config/multer"); // legacy server-upload

const {
  createTranscodeJob,       // legacy (multer) path
  getJobStatus,
  listMyJobs,
  downloadPresigned,
  presignRawUpload,         // NEW (pre-signed PUT to S3)
  startTranscodeFromS3,     // NEW (kick off job after PUT)
} = require("../controllers/jobsController");

// If your app already has app.use(express.json()), you can remove express.json() below.

// NEW: Pre-signed upload flow (preferred)
router.post(
  "/presign-upload",
  authenticateToken,
  express.json(),
  presignRawUpload
);

router.post(
  "/start",
  authenticateToken,
  express.json(),
  startTranscodeFromS3
);

// Legacy: server receives file (multer) and streams to S3
router.post(
  "/",
  authenticateToken,
  upload.single("video"),      // field name must be "video"
  createTranscodeJob
);

// Listing & status
router.get("/", authenticateToken, listMyJobs);
router.get("/:id", authenticateToken, getJobStatus);

// Download (S3 pre-signed GET)
router.get("/:id/download", authenticateToken, downloadPresigned);

module.exports = router;
