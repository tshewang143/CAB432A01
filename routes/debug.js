const express = require("express");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// Debug endpoint to check user info from token
router.get("/user-info", authenticateToken, (req, res) => {
  console.log("=== DEBUG User Info ===");
  console.log("Full user object:", req.user);
  console.log("User ID:", req.user.userId);
  console.log("Username:", req.user.username);
  
  res.json({
    success: true,
    user: req.user,
    message: "User information extracted from JWT token"
  });
});

// Debug endpoint for jobs
router.get("/jobs-test", authenticateToken, async (req, res) => {
  try {
    const { listJobsForUser } = require("../models/Job");
    const user = req.user;
    
    console.log("=== DEBUG Jobs Test ===");
    console.log("User for jobs query:", user);
    console.log("User ID:", user.userId);
    console.log("User ID type:", typeof user.userId);
    
    const items = await listJobsForUser(String(user.userId));
    console.log("Found jobs:", items.length);
    
    res.json({
      success: true,
      user: user,
      jobsCount: items.length,
      jobs: items
    });
  } catch (error) {
    console.error("Debug jobs error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint without authentication to check basic connectivity
router.get("/status", (req, res) => {
  res.json({
    success: true,
    message: "Debug routes are working",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
