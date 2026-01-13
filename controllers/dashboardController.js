const Task = require("../models/Task");
const Team = require("../models/Team");
const User = require("../models/User");

const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    // Use last 30 days vs previous 30 days for trend
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const getTrend = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    let taskQuery = {};
    if (req.user.role === "manager") {
      taskQuery = {
        $or: [{ createdBy: req.user._id }, { assignee: req.user._id }],
      };
    } else if (req.user.role === "user") {
      const userTeams = await Team.find({ members: req.user._id }).select(
        "_id"
      );
      const teamIds = userTeams.map((team) => team._id);
      taskQuery = {
        $or: [{ assignee: req.user._id }, { team: { $in: teamIds } }],
      };
    }

    // 1. Total Tasks
    const totalTasks = await Task.countDocuments(taskQuery);

    const currentPeriodQuery = {
      ...taskQuery,
      createdAt: { $gte: thirtyDaysAgo },
    };
    const lastPeriodQuery = {
      ...taskQuery,
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    };

    const tasksCurrentPeriod = await Task.countDocuments(currentPeriodQuery);
    const tasksLastPeriod = await Task.countDocuments(lastPeriodQuery);
    const tasksTrend = getTrend(tasksCurrentPeriod, tasksLastPeriod);

    // 2. Pending Tasks
    const pendingQuery = {
      ...taskQuery,
      status: { $in: ["To Do", "In Progress"] },
    };
    const pendingTasks = await Task.countDocuments(pendingQuery);
    // Using task creation trend as proxy for pending trend

    // 3. Completed Tasks
    const completedQuery = { ...taskQuery, status: "Done" };
    const completedTasks = await Task.countDocuments(completedQuery);

    // Completed Trend - using updatedAt as proxy for completion time
    const completedCurrentPeriod = await Task.countDocuments({
      ...completedQuery,
      updatedAt: { $gte: thirtyDaysAgo },
    });
    const completedLastPeriod = await Task.countDocuments({
      ...completedQuery,
      updatedAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    });
    const completedTrend = getTrend(
      completedCurrentPeriod,
      completedLastPeriod
    );

    // 4. Teams - Active Teams
    let teamQuery = {};
    if (req.user.role === "manager") {
      teamQuery = {
        $or: [{ createdBy: req.user._id }, { members: req.user._id }],
      };
    } else if (req.user.role === "user") {
      teamQuery = { members: req.user._id };
    }

    const activeTeams = await Team.countDocuments(teamQuery);
    const teamsCurrentPeriod = await Team.countDocuments({
      ...teamQuery,
      createdAt: { $gte: thirtyDaysAgo },
    });
    const teamsLastPeriod = await Team.countDocuments({
      ...teamQuery,
      createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
    });
    const teamsTrend = getTrend(teamsCurrentPeriod, teamsLastPeriod);

    // 5. High Priority Tasks
    const highPriorityTasks = await Task.countDocuments({
      ...taskQuery,
      priority: "High",
    });

    // 6. Total Users (for admin/manager)
    let totalUsers = 0;
    if (req.user.role === "admin" || req.user.role === "manager") {
      totalUsers = await User.countDocuments({});
    }

    res.json({
      totalTasks: { value: totalTasks, trend: tasksTrend },
      pendingTasks: { value: pendingTasks, trend: tasksTrend },
      completedTasks: { value: completedTasks, trend: completedTrend },
      activeTeams: { value: activeTeams, trend: teamsTrend },
      highPriorityTasks,
      totalUsers,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getDashboardStats };
