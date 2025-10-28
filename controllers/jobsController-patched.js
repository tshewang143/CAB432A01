const {
  createJobOnce,
  getJob,
  listJobsForUser,
  lockJob,
  completeJob,
} = require("../models/Job");

// Patched listMyJobs function to handle user ID issues
async function listMyJobs(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    console.log("=== listMyJobs DEBUG ===");
    console.log("User object:", user);
    console.log("User ID:", user.userId);
    console.log("Username:", user.username);

    let items = [];
    
    // Try multiple user ID formats to find jobs
    const possibleUserIds = [
      user.userId, // The Cognito sub from JWT
      user.username, // The username
      user.email, // The email
    ].filter(Boolean); // Remove empty values

    console.log("Trying user IDs:", possibleUserIds);

    for (const userId of possibleUserIds) {
      try {
        const userJobs = await listJobsForUser(String(userId));
        console.log(`Found ${userJobs.length} jobs for user ID: "${userId}"`);
        
        if (userJobs.length > 0) {
          items = userJobs;
          break; // Use the first one that finds jobs
        }
      } catch (error) {
        console.log(`No jobs found for user ID: "${userId}"`);
      }
    }

    // If still no jobs, try a scan approach (less efficient but comprehensive)
    if (items.length === 0) {
      console.log("No jobs found with direct user ID matching, trying alternative approach...");
      // You might need to implement a different query strategy here
    }

    // Apply sorting
    const sortBy = req.query.sortBy || "createdAt";
    const order = (req.query.sortOrder || "DESC").toUpperCase();
    
    items.sort((a, b) => {
      const av = a[sortBy] || "";
      const bv = b[sortBy] || "";
      return order === "ASC"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    console.log(`Returning ${items.length} jobs to user`);
    
    res.json({ jobs: items, pagination: { page: 1, pages: 1 } });
  } catch (err) {
    console.error("[listMyJobs] error:", err);
    res.status(500).json({ error: "Failed to list jobs" });
  }
}

// Keep other functions the same...
module.exports = {
  // ... your existing exports
  listMyJobs, // Use the patched version
};
