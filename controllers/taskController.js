const Task = require('../models/Task');
const Team = require('../models/Team');
const ActivityLog = require('../models/ActivityLog');

// Create a new task
const createTask = async (req, res, io, connectedUsers) => {
  try {
    const { title, description, status, priority, dueDate, assignee, team } = req.body;

    // Validate that task is assigned to either an assignee or a team, but not both
    if (assignee && team) {
      return res.status(400).json({ message: 'Task can only be assigned to either a user or a team, not both' });
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
    });

    await task.save();

    // Log task creation
    await ActivityLog.create({
      action: 'create',
      entity: 'task',
      entityId: task._id,
      performedBy: req.user._id,
      details: `Task "${task.title}" was created`
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email')
      .populate('team', 'name')
      .populate('createdBy', 'name email');

    // Notify individual assignee
    if (assignee && connectedUsers.has(assignee.toString())) {
      io.to(assignee.toString()).emit('taskAssigned', {
        task: populatedTask,
        message: `Task "${title}" has been assigned to you by ${req.user.name}`,
      });
    }

    // Notify team members
    if (team) {
      const teamData = await Team.findById(team).populate('members', 'name email');
      if (teamData) {
        const teamMembers = teamData.members.map((member) => member._id.toString());
        teamMembers.forEach((userId) => {
          if (connectedUsers.has(userId)) {
            io.to(userId).emit('taskAssignedToTeam', {
              task: populatedTask,
              message: `Task "${title}" has been assigned to your team "${teamData.name}" by ${req.user.name}`,
            });
          }
        });
      }
    }

    res.status(201).json(populatedTask);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all tasks (filtered by role, with pagination, search, and filters)
const getTasks = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 5, 
      search = '', 
      status, 
      priority, 
      assignee, 
      sortField = 'createdAt', 
      sortDirection = 'desc' 
    } = req.query || {};

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    if (req.user.role === 'admin') {
      query = {};
    } else if (req.user.role === 'manager') {
      query = {
        $or: [
          { createdBy: req.user._id },
          { assignee: req.user._id },
        ],
      };
    } else {
      // For regular users, fetch tasks where they are the assignee OR they are a member of the assigned team
      const userTeams = await Team.find({ members: req.user._id }).select('_id');
      const teamIds = userTeams.map((team) => team._id);
      query = {
        $or: [
          { assignee: req.user._id },
          { team: { $in: teamIds } },
        ],
      };
    }

    // Add search condition if search term is provided
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Add status filter if provided
    if (status) {
      query.status = status;
    }

    // Add priority filter if provided
    if (priority) {
      query.priority = priority;
    }

    // Add assignee filter if provided
    if (assignee) {
      query.assignee = assignee;
    }

    const sort = {};
    sort[sortField] = sortDirection === 'asc' ? 1 : -1;

    const total = await Task.countDocuments(query);
    const tasks = await Task.find(query)
      .populate('assignee', 'name email')
      .populate('team', 'name description')
      .populate('createdBy', 'name email')
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
    console.error('Get tasks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a task by ID
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignee', 'name email')
      .populate('team', 'name')
      .populate('createdBy', 'name email');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Update authorization to also allow team members to view the task
    const userTeams = await Team.find({ members: req.user._id }).select('_id');
    const teamIds = userTeams.map((team) => team._id);
    const isTeamMember = task.team && teamIds.some((teamId) => teamId.toString() === task.team._id.toString());

    if (
      req.user.role !== 'admin' &&
      task.createdBy._id.toString() !== req.user._id.toString() &&
      task.assignee?._id?.toString() !== req.user._id.toString() &&
      !isTeamMember
    ) {
      return res.status(403).json({ message: 'Not authorized to view this task' });
    }

    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a task
const updateTask = async (req, res, io, connectedUsers) => {
  try {
    const { title, description, status, priority, dueDate, assignee, team } = req.body;

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (
      req.user.role !== 'admin' &&
      task.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to update this task' });
    }

    if (assignee && team) {
      return res.status(400).json({ message: 'Task can only be assigned to either a user or a team, not both' });
    }

    const oldAssignee = task.assignee?.toString();
    const oldTeam = task.team?.toString();

    // Update task fields
    if (title) task.title = title;
    if (description) task.description = description;
    if (status) task.status = status;
    if (priority) task.priority = priority;
    if (dueDate) task.dueDate = dueDate;
    task.assignee = assignee === null ? null : (assignee || task.assignee);
    task.team = team === null ? null : (team || task.team);

    await task.save();

    // Log task update
    let logDetails = `Task "${task.title}" was updated`;
    let logAction = 'update';

    if (status && status !== task.status) {
      logAction = 'status';
      logDetails = `Task status changed to ${status}`;
    } else if (assignee !== undefined && assignee !== task.assignee?.toString()) {
      logAction = 'assign';
      logDetails = assignee ? `Task assigned to user` : `Task unassigned from user`;
    } else if (team !== undefined && team !== task.team?.toString()) {
      logAction = 'assign';
      logDetails = team ? `Task assigned to team` : `Task unassigned from team`;
    }

    await ActivityLog.create({
      action: logAction,
      entity: 'task',
      entityId: task._id,
      performedBy: req.user._id,
      details: logDetails
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignee', 'name email')
      .populate('team', 'name')
      .populate('createdBy', 'name email');

    // Send update notification to current assignee
    if (task.assignee && connectedUsers.has(task.assignee.toString())) {
      io.to(task.assignee.toString()).emit('taskUpdated', {
        task: populatedTask,
        message: `Task "${task.title}" has been updated by ${req.user.name}`
      });
    }

    // Send update notification to team members
    if (task.team) {
      const teamData = await Team.findById(task.team).populate('members', 'name email');
      if (teamData) {
        teamData.members.forEach(member => {
          if (connectedUsers.has(member._id.toString())) {
            io.to(member._id.toString()).emit('taskUpdated', {
              task: populatedTask,
              message: `Task "${task.title}" in team "${teamData.name}" has been updated by ${req.user.name}`
            });
          }
        });
      }
    }

    // Handle assignee changes
    if (assignee !== undefined && assignee !== oldAssignee) {
      if (assignee && connectedUsers.has(assignee.toString())) {
        io.to(assignee.toString()).emit('taskAssigned', {
          task: populatedTask,
          message: `Task "${task.title}" has been assigned to you by ${req.user.name}`
        });
      }

      if (oldAssignee && connectedUsers.has(oldAssignee)) {
        io.to(oldAssignee).emit('taskUnassigned', {
          taskId: task._id,
          message: `Task "${task.title}" has been unassigned from you by ${req.user.name}`
        });
      }
    }

    // Handle team changes
    if (team !== undefined && team !== oldTeam) {
      if (team) {
        const newTeamData = await Team.findById(team).populate('members', 'name email');
        if (newTeamData) {
          newTeamData.members.forEach(member => {
            if (connectedUsers.has(member._id.toString())) {
              io.to(member._id.toString()).emit('taskAssignedToTeam', {
                task: populatedTask,
                message: `Task "${task.title}" has been assigned to your team "${newTeamData.name}" by ${req.user.name}`
              });
            }
          });
        }
      }

      if (oldTeam) {
        const oldTeamData = await Team.findById(oldTeam).populate('members', 'name email');
        if (oldTeamData) {
          oldTeamData.members.forEach(member => {
            if (connectedUsers.has(member._id.toString())) {
              io.to(member._id.toString()).emit('taskUnassigned', {
                taskId: task._id,
                message: `Task "${task.title}" has been unassigned from your team "${oldTeamData.name}" by ${req.user.name}`
              });
            }
          });
        }
      }
    }

    res.json(populatedTask);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a task
const deleteTask = async (req, res, io, connectedUsers) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (
      req.user.role !== 'admin' &&
      task.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    const taskTitle = task.title;
    const assignee = task.assignee?.toString();
    const team = task.team?.toString();

    // Log task deletion before actually deleting
    await ActivityLog.create({
      action: 'delete',
      entity: 'task',
      entityId: task._id,
      performedBy: req.user._id,
      details: `Task "${taskTitle}" was deleted`
    });

    await Task.deleteOne({ _id: req.params.id });

    // Notify individual assignee
    if (assignee && connectedUsers.has(assignee)) {
      io.to(assignee).emit('taskUnassigned', {
        taskId: req.params.id,
        message: `Task "${taskTitle}" has been deleted by ${req.user.name}`,
      });
    }

    // Notify team members
    if (team) {
      const teamData = await Team.findById(team).populate('members', 'name email');
      if (teamData) {
        const teamMembers = teamData.members.map((member) => member._id.toString());
        teamMembers.forEach((userId) => {
          if (connectedUsers.has(userId)) {
            io.to(userId).emit('taskUnassigned', {
              taskId: req.params.id,
              message: `Task "${taskTitle}" has been deleted from your team "${teamData.name}" by ${req.user.name}`,
            });
          }
        });
      }
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createTask, getTasks, getTaskById, updateTask, deleteTask };