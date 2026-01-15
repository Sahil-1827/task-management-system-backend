const Task = require("../models/Task");
const Team = require("../models/Team");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");

const createTask = async (req, res, io, connectedUsers) => {
  try {
    const { title, description, status, priority, dueDate, assignee, team } =
      req.body;

    if (assignee && team) {
      return res.status(400).json({
        message:
          "Task can only be assigned to either a user or a team, not both",
      });
    }

    const task = new Task({
      title,
      description,
      status,
      priority,
      dueDate,
      assignee: assignee || null,
      team: team || null,
      createdBy: req.user._id,
      adminId: req.user.role === "admin" ? req.user._id : req.user.adminId,
    });

    await task.save();

    let logDetails = `Task "${task.title}" was created`;
    if (assignee) {
      const assignedUser = await User.findById(assignee);
      if (assignedUser) {
        logDetails += ` and assigned to ${assignedUser.name}`;
      }
    } else if (team) {
      const assignedTeam = await Team.findById(team);
      if (assignedTeam) {
        logDetails += ` and assigned to team ${assignedTeam.name}`;
      }
    }

    await ActivityLog.create({
      action: "create",
      entity: "task",
      entityId: task._id,
      performedBy: req.user._id,
      adminId: req.user.role === "admin" ? req.user._id : req.user.adminId,
      details: logDetails,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignee", "name email profilePicture")
      .populate("team", "name")
      .populate("createdBy", "name email profilePicture");

    if (assignee && connectedUsers.has(assignee.toString())) {
      io.to(assignee.toString()).emit("taskAssigned", {
        task: populatedTask,
        message: `Task "${title}" has been assigned to you by ${req.user.name}`,
      });
    }

    if (team) {
      const teamData = await Team.findById(team).populate(
        "members",
        "name email"
      );
      if (teamData) {
        const teamMembers = teamData.members.map((member) =>
          member._id.toString()
        );
        teamMembers.forEach((userId) => {
          if (connectedUsers.has(userId)) {
            io.to(userId).emit("taskAssignedToTeam", {
              task: populatedTask,
              message: `Task "${title}" has been assigned to your team "${teamData.name}" by ${req.user.name}`,
            });
          }
        });
      }
    }

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error("Create task error:", error);
    res.status(500).json({ message: error.message });
  }
};

const addTaskLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, url } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    task.links.push({ title, url });
    await task.save();

    res.status(201).json(task.links);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const removeTaskLink = async (req, res) => {
  try {
    const { id, linkId } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    task.links = task.links.filter(link => link._id.toString() !== linkId);
    await task.save();

    res.json(task.links);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTasks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 5,
      search = "",
      status,
      priority,
      assignee,
      sortField = "createdAt",
      sortDirection = "desc",
    } = req.query || {};

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const rootAdminId = req.user.role === "admin" ? req.user._id : req.user.adminId;
    const queryConditions = [{ adminId: rootAdminId }];

    if (req.user.role === "manager") {
      // queryConditions.push({
      //   $or: [{ createdBy: req.user._id }, { assignee: req.user._id }],
      // });
    } else if (req.user.role === "user") {
      const userTeams = await Team.find({ members: req.user._id }).select(
        "_id"
      );
      const teamIds = userTeams.map((team) => team._id);
      queryConditions.push({
        $or: [{ assignee: req.user._id }, { team: { $in: teamIds } }],
      });
    }

    if (search) {
      queryConditions.push({
        $or: [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      });
    }
    if (status) {
      const statuses = status.split(",");
      queryConditions.push({ status: { $in: statuses } });
    }
    if (priority) {
      queryConditions.push({ priority: priority });
    }
    if (assignee && assignee !== "undefined") {
      queryConditions.push({ assignee: assignee });
    }

    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};
    const sort = {};
    sort[sortField] = sortDirection === "asc" ? 1 : -1;

    const total = await Task.countDocuments(query);
    const tasks = await Task.find(query)
      .populate("assignee", "name email profilePicture")
      .populate("team", "name description")
      .populate("createdBy", "name email profilePicture")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    res.json({
      tasks,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalTasks: total,
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assignee", "name email profilePicture")
      .populate("team", "name")
      .populate("createdBy", "name email profilePicture");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const userTeams = await Team.find({ members: req.user._id }).select("_id");
    const teamIds = userTeams.map((team) => team._id);
    const isTeamMember =
      task.team &&
      teamIds.some((teamId) => teamId.toString() === task.team._id.toString());

    if (
      req.user.role !== "admin" &&
      task.createdBy._id.toString() !== req.user._id.toString() &&
      task.assignee?._id?.toString() !== req.user._id.toString() &&
      !isTeamMember
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this task" });
    }

    res.json(task);
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateTask = async (req, res, io, connectedUsers) => {
  try {
    const { title, description, status, priority, dueDate, assignee, team } =
      req.body;

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const canUpdate = await checkTaskUpdateAuth(req.user, task, req.body);
    if (!canUpdate) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task" });
    }

    if (assignee && team) {
      return res.status(400).json({
        message:
          "Task can only be assigned to either a user or a team, not both",
      });
    }

    const oldTask = { ...task._doc };
    const oldAssignee = oldTask.assignee ? oldTask.assignee.toString() : null;
    const oldTeam = oldTask.team ? oldTask.team.toString() : null;

    applyTaskUpdates(task, req.body, req.user);

    await task.save();

    let changes = [];
    if (oldTask.title !== task.title)
      changes.push(`title from "${oldTask.title}" to "${task.title}"`);
    if (oldTask.description !== task.description) changes.push(`description`);
    if (oldTask.status !== task.status)
      changes.push(`status from "${oldTask.status}" to "${task.status}"`);
    if (oldTask.priority !== task.priority)
      changes.push(`priority from "${oldTask.priority}" to "${task.priority}"`);

    const oldDueDate = oldTask.dueDate
      ? new Date(oldTask.dueDate).toISOString().split("T")[0]
      : "";
    const newDueDate = task.dueDate
      ? new Date(task.dueDate).toISOString().split("T")[0]
      : "";
    if (oldDueDate !== newDueDate) {
      changes.push(
        `due date from "${oldDueDate || "none"}" to "${newDueDate || "none"}"`
      );
    }

    const newAssigneeId = task.assignee ? task.assignee.toString() : null;
    if (oldAssignee !== newAssigneeId) {
      if (newAssigneeId) {
        changes.push(`assigned to a user`);
      } else if (oldAssignee) {
        changes.push(`unassigned from a user`);
      }
    }

    const newTeamId = task.team ? task.team.toString() : null;
    if (oldTeam !== newTeamId) {
      if (newTeamId) {
        changes.push(`assigned to a team`);
      } else if (oldTeam) {
        changes.push(`unassigned from a team`);
      }
    }

    let logDetails = `Task "${task.title}" was updated.`;
    if (changes.length > 0) {
      logDetails = `Task "${task.title}" updated: ${changes.join(", ")}.`;
    }

    await ActivityLog.create({
      action: "update",
      entity: "task",
      entityId: task._id,
      performedBy: req.user._id,
      adminId: req.user.role === "admin" ? req.user._id : req.user.adminId,
      details: logDetails,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignee", "name email profilePicture")
      .populate("team", "name")
      .populate("createdBy", "name email profilePicture");

    const adminsAndManagers = await User.find({
      role: { $in: ["admin", "manager"] },
      _id: { $ne: req.user._id },
      $or: [
        { _id: task.adminId },
        { adminId: task.adminId }
      ]
    });
    adminsAndManagers.forEach((user) => {
      if (connectedUsers.has(user._id.toString())) {
        io.to(user._id.toString()).emit("taskUpdated", {
          task: populatedTask,
          message: `Task "${task.title}" has been updated by ${req.user.name}`,
        });
      }
    });

    if (
      task.assignee &&
      connectedUsers.has(task.assignee.toString()) &&
      task.assignee.toString() !== req.user._id.toString()
    ) {
      io.to(task.assignee.toString()).emit("taskUpdated", {
        task: populatedTask,
        message: `Task "${task.title}" has been updated by ${req.user.name}`,
      });
    }

    if (task.team) {
      const teamData = await Team.findById(task.team).populate(
        "members",
        "name email profilePicture"
      );
      if (teamData) {
        teamData.members.forEach((member) => {
          if (
            connectedUsers.has(member._id.toString()) &&
            member._id.toString() !== req.user._id.toString()
          ) {
            io.to(member._id.toString()).emit("taskUpdated", {
              task: populatedTask,
              message: `Task "${task.title}" in team "${teamData.name}" has been updated by ${req.user.name}`,
            });
          }
        });
      }
    }

    if (newAssigneeId !== oldAssignee) {
      if (newAssigneeId && connectedUsers.has(newAssigneeId)) {
        io.to(newAssigneeId).emit("taskAssigned", {
          task: populatedTask,
          message: `Task "${task.title}" has been assigned to you by ${req.user.name}`,
        });
      }
      if (oldAssignee && connectedUsers.has(oldAssignee)) {
        io.to(oldAssignee).emit("taskUnassigned", {
          taskId: task._id,
          message: `Task "${task.title}" has been unassigned from you by ${req.user.name}`,
        });
      }
    }

    if (newTeamId !== oldTeam) {
      if (newTeamId) {
        const newTeamData = await Team.findById(newTeamId).populate(
          "members",
          "name email profilePicture"
        );
        if (newTeamData) {
          newTeamData.members.forEach((member) => {
            if (connectedUsers.has(member._id.toString())) {
              io.to(member._id.toString()).emit("taskAssignedToTeam", {
                task: populatedTask,
                message: `Task "${task.title}" has been assigned to your team "${newTeamData.name}" by ${req.user.name}`,
              });
            }
          });
        }
      }
      if (oldTeam) {
        const oldTeamData = await Team.findById(oldTeam).populate(
          "members",
          "name email profilePicture"
        );
        if (oldTeamData) {
          oldTeamData.members.forEach((member) => {
            if (connectedUsers.has(member._id.toString())) {
              io.to(member._id.toString()).emit("taskUnassigned", {
                taskId: task._id,
                message: `Task "${task.title}" has been unassigned from your team "${oldTeamData.name}" by ${req.user.name}`,
              });
            }
          });
        }
      }
    }

    res.json(populatedTask);
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({ message: error.message });
  }
};

const deleteTask = async (req, res, io, connectedUsers) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (
      req.user.role !== "admin" &&
      task.createdBy.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this task" });
    }

    const taskTitle = task.title;
    const assignee = task.assignee?.toString();
    const team = task.team?.toString();

    await ActivityLog.create({
      action: "delete",
      entity: "task",
      entityId: task._id,
      performedBy: req.user._id,
      adminId: req.user.role === "admin" ? req.user._id : req.user.adminId,
      details: `Task "${taskTitle}" was deleted`,
    });

    await Task.deleteOne({ _id: req.params.id });

    if (assignee && connectedUsers.has(assignee)) {
      io.to(assignee).emit("taskUnassigned", {
        taskId: req.params.id,
        message: `Task "${taskTitle}" has been deleted by ${req.user.name}`,
      });
    }

    if (team) {
      const teamData = await Team.findById(team).populate(
        "members",
        "name email"
      );
      if (teamData) {
        const teamMembers = teamData.members.map((member) =>
          member._id.toString()
        );
        teamMembers.forEach((userId) => {
          if (connectedUsers.has(userId)) {
            io.to(userId).emit("taskUnassigned", {
              taskId: req.params.id,
              message: `Task "${taskTitle}" has been deleted from your team "${teamData.name}" by ${req.user.name}`,
            });
          }
        });
      }
    }

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getTaskStatsByPriority = async (req, res) => {
  try {
    const pipeline = [];

    if (req.user.role === "user") {
      const userTeams = await Team.find({ members: req.user._id }).select(
        "_id"
      );
      const teamIds = userTeams.map((team) => team._id);
      pipeline.push({
        $match: {
          $or: [{ assignee: req.user._id }, { team: { $in: teamIds } }],
        },
      });
    } else if (req.user.role === "manager") {
      pipeline.push({
        $match: {
          $or: [{ createdBy: req.user._id }, { assignee: req.user._id }],
        },
      });
    }

    pipeline.push({
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    });

    const priorityStats = await Task.aggregate(pipeline);

    const counts = { low: 0, medium: 0, high: 0 };
    for (const stat of priorityStats) {
      if (!stat._id) continue;

      const priorityKey = stat._id.toLowerCase();
      if (counts.hasOwnProperty(priorityKey)) {
        counts[priorityKey] = stat.count;
      }
    }

    res.json(counts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const checkTaskUpdateAuth = async (user, task, updateData) => {
  const isCreator = task.createdBy.toString() === user._id.toString();
  const isAssignee =
    task.assignee && task.assignee.toString() === user._id.toString();

  let isTeamMember = false;
  let isTeamManager = false;
  if (task.team) {
    const teamData = await Team.findById(task.team);
    if (teamData) {
      isTeamMember = teamData.members.some(
        (memberId) => memberId.toString() === user._id.toString()
      );
      isTeamManager = teamData.managers.some(
        (managerId) => managerId.toString() === user._id.toString()
      );
    }
  }

  const isStatusUpdateOnly =
    Object.keys(updateData).length === 1 && updateData.hasOwnProperty("status");

  if (user.role === "admin") return true;

  if (user.role === "manager") {
    return isCreator || isTeamManager;
  }

  if (user.role === "user") {
    if (isStatusUpdateOnly && (isAssignee || isTeamMember)) {
      return true;
    }
  }

  return false;
};

const applyTaskUpdates = (task, updates, user) => {
  const { title, description, status, priority, dueDate, assignee, team } =
    updates;
  const isStatusUpdateOnly =
    Object.keys(updates).length === 1 && updates.hasOwnProperty("status");

  if (user.role === "user" && isStatusUpdateOnly) {
    task.status = status;
  } else {
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = dueDate;
    task.assignee = assignee === null ? null : assignee || task.assignee;
    task.team = team === null ? null : team || task.team;
    if (updates.comments !== undefined) task.comments = updates.comments;
    if (updates.links !== undefined) task.links = updates.links;
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStatsByPriority,
  addTaskLink,
  removeTaskLink
};
