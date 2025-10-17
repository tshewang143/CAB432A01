// routes/stream.js (CJS)
const express = require("express");
const router = express.Router();

const authSSE = require("../middleware/authSSE");
const { openJobsStream } = require("../controllers/streamController");

// Live jobs stream for the current user (SSE)
router.get("/jobs", authSSE, openJobsStream);

module.exports = router;

