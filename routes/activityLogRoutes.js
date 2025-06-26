const express = require("express");
const router = express.Router();
const ActivityLog = require("../models/ActivityLog");
const { protect } = require("../middleware/authMiddleware");

const activityLogRoutes = (io, connectedUsers) => {
  // Define the route handler directly as a callback function
  router.get("/", protect, async (req, res) => {
    try {
      const { user } = req;
      const { limit = 25 } = req.query; // Get limit from query, default to 25
      let query = {};

      // Apply role-based filters
      // Removed role-based filtering to allow all users to see all logs
      // if (user.role === 'admin') {
      //   // Admins can see all logs
      //   query = {};
      // } else if (user.role === 'manager') {
      //   // Managers can see logs related to their teams and tasks
      //   query = {
      //     $or: [
      //       { performedBy: user._id },
      //       { entityId: { $in: user.teams } },
      //       { entityId: { $in: user.managedTasks } }
      //     ]
      //   };
      // } else {
      //   // Regular users can only see their own logs
      //   query = { performedBy: user._id };
      // }

      const logs = await ActivityLog.find(query)
        .populate("performedBy", "name email")
        .sort({ createdAt: -1 })
        .limit(parseInt(limit)); // Add the limit to the query

      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};

module.exports = activityLogRoutes;
