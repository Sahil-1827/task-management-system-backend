const express = require("express");
const router = express.Router();
const ActivityLog = require("../models/ActivityLog");
const Task = require("../models/Task");
const Team = require("../models/Team");
const { protect } = require("../middleware/authMiddleware");

const activityLogRoutes = (io, connectedUsers) => {
  // Define the route handler directly as a callback function
  router.get("/", protect, async (req, res) => {
    try {
      const { user } = req;
      const { limit = 25 } = req.query; // Get limit from query, default to 25
      let query = {};

      if (user.role === "admin") {
        // Admins can see all logs
        query = {};
      } else {
        // For non-admins, fetch tasks where the user is an assignee OR a member of the assigned team
        const userTeams = await Team.find({ members: user._id }).select(
          "_id"
        );
        const teamIds = userTeams.map((team) => team._id);

        const userTasks = await Task.find({
          $or: [{ assignee: user._id }, { team: { $in: teamIds } }]
        }).select("_id");
        const taskIds = userTasks.map((task) => task._id);

        query = {
          $or: [
            { performedBy: user._id },
            { entity: "team", entityId: { $in: teamIds } },
            { entity: "task", entityId: { $in: taskIds } }
          ]
        };
      }

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
