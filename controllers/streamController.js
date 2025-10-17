// controllers/streamController.js
const { listJobsForUser } = require("../models/Job");

// Helper: write an SSE event
function sse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function openJobsStream(req, res) {
  // token is already verified by authSSE, and req.user is set
  const user = req.user;
  if (!user) return res.sendStatus(401);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Immediately send a hello + initial snapshot
  sse(res, "hello", { userId: user.userId, ts: Date.now() });

  // Keep a small in-connection memory of last statuses (stateless overall; fine to lose)
  let lastDigest = "";

  // Poll DDB every 5s; if different from last digest, send an update
  const pollMs = 5000;

  async function pollOnce() {
    try {
      const jobs = await listJobsForUser(String(user.userId));
      // Create a quick digest of ids+status to detect changes
      const digest = jobs.map(j => `${j.videoId}:${j.status}:${j.completedAt || ""}`).sort().join("|");
      if (digest !== lastDigest) {
        lastDigest = digest;
        sse(res, "jobs", { jobs });
      }
    } catch (e) {
      // send a transient error event; client can decide what to do
      sse(res, "error", { message: e.message || "poll failed" });
    }
  }

  // heartbeats keep the connection alive (and help load balancers)
  const heartbeat = setInterval(() => sse(res, "heartbeat", { ts: Date.now() }), 15000);
  const poller = setInterval(pollOnce, pollMs);

  // Kick off first poll
  pollOnce();

  // Clean up when client disconnects
  req.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(poller);
    try { res.end(); } catch {}
  });
}

module.exports = { openJobsStream };

