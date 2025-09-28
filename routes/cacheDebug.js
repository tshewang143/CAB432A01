// routes/cacheDebug.js
const express = require("express");
const router = express.Router();
const { cacheEnabled, cacheGet } = require("../config/cache");

router.get("/peek/jobs/:userId", async (req, res) => {
  if (!cacheEnabled()) return res.json({ enabled: false, cached: false });
  const key = `jobs:user:${req.params.userId}`;
  const val = await cacheGet(key);
  res.json({ enabled: true, cached: !!val, key, sampleCount: Array.isArray(val) ? val.length : null });
});

module.exports = router;
