const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth"); // your existing JWT/Cognito middleware
const { listRecentEvents } = require("../models/Audit");

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const rows = await listRecentEvents({ userId: req.user.userId, limit: 50 });
    res.json({ events: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
