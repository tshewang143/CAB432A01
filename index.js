// index.js (CJS)
require("./config/env"); // <<< load env FIRST, do not move this line

const express = require("express");
const path = require("path");

// Routers
const authRouter = require("./routes/auth");
const jobsRouter = require("./routes/jobs");
const auditRouter = require("./routes/audit"); // <<< NEW: audit routes (optional UI/demo)
const streamRouter = require("./routes/stream");

// RDS migration (create per-student audit table on boot)
const { migrateAudit } = require("./config/rds"); // <<< NEW

const app = express();
app.use(express.json());

// static frontend
app.use(express.static(path.join(__dirname, "public")));

// API routes (keep these mount points to match your frontend)
app.use("/api/auth", authRouter);
app.use("/api/v1/jobs", jobsRouter);
app.use("/api/v1/audit", auditRouter); // <<< NEW route
app.use("/api/v1/stream", streamRouter);

//for debug
//app.use("/api/debug/cache", require("./routes/cacheDebug"));

// simple health
app.get("/health", (_req, res) => res.json({ ok: true }));

// optional: run reconcile on boot (auto-heals stale PROCESSING jobs)
try {
  const { reconcile } = require("./utils/reconcile");
  reconcile().catch((e) => console.warn("[reconcile] error on boot:", e.message));
} catch (e) {
  // reconcile module is optional
}

// Kick off RDS migration BEFORE starting server (non-blocking if it fails)
(async () => {
  try {
    await migrateAudit();
    console.log("[rds] audit table ready");
  } catch (e) {
    console.error("[rds] migrate error:", e.message);
  }
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
