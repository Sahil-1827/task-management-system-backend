const Team = require('../models/Team');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// Create a new team
const createTeam = async (req, res, io, connectedUsers) => {
  try {
    const { name, description, members } = req.body;

    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Not authorized to create teams' });
    }

    const team = new Team({
      name,
      description,
      members: members || [],
      createdBy: req.user._id,
    });

    await team.save();

    // Log team creation
    await ActivityLog.create({
      action: 'create',
      entity: 'team',
      entityId: team._id,
      performedBy: req.user._id,
      details: `Team "${team.name}" was created`
    });

    const populatedTeam = await Team.findById(team._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    // Notify members that they have been added to the team
    if (members && members.length > 0) {
      console.log('Connected users:', Array.from(connectedUsers));
      members.forEach((userId) => {
        const userIdStr = userId.toString();
        if (connectedUsers.has(userIdStr)) {
          console.log(`Emitting teamAdded to connected user ${userIdStr}`);
          io.to(userIdStr).emit('teamAdded', {
            team: populatedTeam,
            message: `You have been added to team "${name}" by ${req.user.name}`,
          });
        } else {
          console.log(`User ${userIdStr} is not connected, skipping teamAdded notification`);
        }
      });
    }

    res.status(201).json(populatedTeam);
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all teams (filtered by role, with pagination, search, and filters)
const getTeams = async (req, res) => {
  try {
    const { page = 1, limit = 9999, search = '', member } = req.query;

    // Convert page and limit to integers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build the query based on user role
    let query = {};
    if (req.user.role === 'admin') {
      query = {};
    } else if (req.user.role === 'manager') {
      query = {
        $or: [
          { createdBy: req.user._id },
          { members: req.user._id },
        ],
      };
    } else {
      query = { members: req.user._id };
    }

    // Add search filter (search by name or description)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } }, // Case-insensitive search
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Add member filter
    if (member) {
      query.members = member;
    }

    // Fetch teams with pagination
    const teams = await Team.find(query)
      .populate('createdBy', 'name email')
      .populate('members', 'name email')
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const totalTeams = await Team.countDocuments(query);

    res.json({
      teams,
      totalTeams,
      currentPage: pageNum,
      totalPages: Math.ceil(totalTeams / limitNum),
    });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a team by ID
const getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('members', 'name email');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (
      req.user.role !== 'admin' &&
      team.createdBy._id.toString() !== req.user._id.toString() &&
      !team.members.some((member) => member._id.toString() === req.user._id.toString())
    ) {
      return res.status(403).json({ message: 'Not authorized to view this team' });
    }

    res.json(team);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a team
const updateTeam = async (req, res, io, connectedUsers) => {
  try {
    const { name, description, members } = req.body;
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (
      req.user.role !== 'admin' &&
      team.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to update this team' });
    }

    const oldMembers = team.members.map((id) => id.toString());
    team.name = name || team.name;
    team.description = description || team.description;
    team.members = members || team.members;

    await team.save();

    // Log team update
    let logDetails = `Team "${team.name}" was updated`;
    let logAction = 'update';

    if (members && JSON.stringify(oldMembers) !== JSON.stringify(members)) {
      logAction = 'assign';
      const addedCount = members.filter(m => !oldMembers.includes(m.toString())).length;
      const removedCount = oldMembers.filter(m => !members.includes(m.toString())).length;
      logDetails = `Team members updated: ${addedCount} added, ${removedCount} removed`;
    }

    await ActivityLog.create({
      action: logAction,
      entity: 'team',
      entityId: team._id,
      performedBy: req.user._id,
      details: logDetails
    });

    const populatedTeam = await Team.findById(team._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    // Notify all current members about the team update
    members.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        console.log(`Emitting teamAdded to connected user ${userIdStr}`);
        io.to(userIdStr).emit('teamAdded', {
          team: populatedTeam,
          message: `Team "${name}" has been updated by ${req.user.name}`,
        });
      }
    });

    // Notify new members
    const newMembers = members.filter(
      (userId) => !oldMembers.includes(userId.toString())
    );
    newMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        console.log(`Emitting teamAdded to connected user ${userIdStr}`);
        io.to(userIdStr).emit('teamAdded', {
          team: populatedTeam,
          message: `You have been added to team "${name}" by ${req.user.name}`,
        });
      } else {
        console.log(`User ${userIdStr} is not connected, skipping teamAdded notification`);
      }
    });

    // Notify removed members
    const removedMembers = oldMembers.filter(
      (userId) => !members.includes(userId.toString())
    );
    removedMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        console.log(`Emitting teamRemoved to connected user ${userIdStr}`);
        io.to(userIdStr).emit('teamRemoved', {
          teamId: team._id,
          message: `You have been removed from team "${name}" by ${req.user.name}`,
        });
      } else {
        console.log(`User ${userIdStr} is not connected, skipping teamRemoved notification`);
      }
    });

    res.json(populatedTeam);
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a team
const deleteTeam = async (req, res, io, connectedUsers) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    if (
      req.user.role !== 'admin' &&
      team.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to delete this team' });
    }

    const teamMembers = team.members.map((id) => id.toString());
    const teamName = team.name;

    // Log team deletion before actually deleting
    await ActivityLog.create({
      action: 'delete',
      entity: 'team',
      entityId: team._id,
      performedBy: req.user._id,
      details: `Team "${teamName}" was deleted`
    });

    await Team.deleteOne({ _id: req.params.id });

    // Notify members that the team has been deleted
    teamMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        console.log(`Emitting teamRemoved to connected user ${userIdStr}`);
        io.to(userIdStr).emit('teamRemoved', {
          teamId: req.params.id,
          message: `Team "${teamName}" has been deleted by ${req.user.name}`,
        });
      } else {
        console.log(`User ${userIdStr} is not connected, skipping teamRemoved notification`);
      }
    });

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createTeam, getTeams, getTeamById, updateTeam, deleteTeam };