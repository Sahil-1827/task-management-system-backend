const express = require("express");
const router = express.Router();
const ActivityLog = require("../models/ActivityLog");
const Task = require("../models/Task");
const Team = require("../models/Team");
const { protect } = require("../middleware/authMiddleware");


router.get("/", protect, async (req, res) => {
  try {
    const { user } = req;
    const { limit = 25 } = req.query;
    let query = {};

    const rootAdminId = user.role === "admin" ? user._id : user.adminId;
    query = { adminId: rootAdminId };

    if (user.role === "admin") {
      // Admin sees all logs for their scope (already filtered by adminId)
    } else {

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
          { entity: "task", entityId: { $in: taskIds } },
          { entity: "user", entityId: user._id }
        ]
      };

      // Ensure we still scope to the adminId even for restricted views
      query.adminId = rootAdminId;
    }

    const logs = await ActivityLog.find(query)
      .populate("performedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;