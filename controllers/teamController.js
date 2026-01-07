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
      managers: [req.user._id], // Add the creator to the managers array
      createdBy: req.user._id,
    });

    await team.save();

    // Log team creation
    await ActivityLog.create({
      action: 'create',
      entity: 'team',
      entityId: team._id,
      performedBy: req.user._id,
      details: `Team "${team.name}" was created by ${req.user.name}`
    });

    const populatedTeam = await Team.findById(team._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    // Notify members that they have been added to the team
    if (members && members.length > 0) {
      members.forEach((userId) => {
        const userIdStr = userId.toString();
        if (connectedUsers.has(userIdStr)) {
          io.to(userIdStr).emit('teamAdded', {
            team: populatedTeam,
            message: `You have been added to team "${name}" by ${req.user.name}`,
          });
        }
      });
    }

    res.status(201).json(populatedTeam);
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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

    const oldTeam = { ...team._doc }; // Create a copy of the original team document
    const oldMembers = team.members.map((id) => id.toString());

    // Update team fields
    if (name !== undefined) team.name = name;
    if (description !== undefined) team.description = description;
    if (members !== undefined) team.members = members;

    await team.save();

    // Log team update with more specific details
    let changes = [];
    if (oldTeam.name !== team.name)
      changes.push(`name from "${oldTeam.name}" to "${team.name}"`);
    if (oldTeam.description !== team.description)
      changes.push(`description`);

    // Handle members changes
    const newMembers = team.members.map((id) => id.toString());
    const addedMembers = newMembers.filter(m => !oldMembers.includes(m));
    const removedMembers = oldMembers.filter(m => !newMembers.includes(m));

    if (addedMembers.length > 0 || removedMembers.length > 0) {
      let memberChanges = [];
      if (addedMembers.length > 0) {
        memberChanges.push(`${addedMembers.length} member(s) added`);
      }
      if (removedMembers.length > 0) {
        memberChanges.push(`${removedMembers.length} member(s) removed`);
      }
      changes.push(`members: ${memberChanges.join(' and ')}`);
    }

    let logDetails = `Team "${team.name}" was updated by ${req.user.name}.`;
    if (changes.length > 0) {
      logDetails = `Team "${team.name}" updated by ${req.user.name}: ${changes.join(', ')}.`;
    }

    await ActivityLog.create({
      action: 'update',
      entity: 'team',
      entityId: team._id,
      performedBy: req.user._id,
      details: logDetails
    });
     // Create user-specific logs for added members
    for (const userId of addedMembers) {
      await ActivityLog.create({
        action: "assign",
        entity: "user",
        entityId: userId,
        performedBy: req.user._id,
        details: `You were added to team "${team.name}" by ${req.user.name}`
      });
    }

    // Create user-specific logs for removed members
    for (const userId of removedMembers) {
      await ActivityLog.create({
        action: "delete",
        entity: "user",
        entityId: userId,
        performedBy: req.user._id,
        details: `You were removed from team "${oldTeam.name}" by ${req.user.name}`
      });
    }


    const populatedTeam = await Team.findById(team._id)
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    // Notify new members
    addedMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        io.to(userIdStr).emit('teamAdded', {
          team: populatedTeam,
          message: `You have been added to team "${team.name}" by ${req.user.name}`,
        });
      }
    });

    // Notify removed members
    removedMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        io.to(userIdStr).emit('teamRemoved', {
          teamId: team._id,
          message: `You have been removed from team "${oldTeam.name}" by ${req.user.name}`,
        });
      }
    });

    // Notify all current members (including those who were already members and new members) about the team update
    populatedTeam.members.forEach((member) => {
      const userIdStr = member._id.toString();
      if (connectedUsers.has(userIdStr)) {
        io.to(userIdStr).emit('teamUpdated', {
          team: populatedTeam,
          message: `Team "${team.name}" has been updated by ${req.user.name}`,
        });
      }
    });

    res.json(populatedTeam);
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ message: error.message });
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
      details: `Team "${teamName}" was deleted by ${req.user.name}`
    });
     // Create user-specific logs for all members of the deleted team
    for (const userId of teamMembers) {
      if (userId !== req.user._id.toString()) { // Don't log for the user performing the action
        await ActivityLog.create({
          action: "delete",
          entity: "user",
          entityId: userId,
          performedBy: req.user._id,
          details: `The team "${teamName}" you were a member of was deleted by ${req.user.name}`
        });
      }
    }


    await Team.deleteOne({ _id: req.params.id });

    // Notify members that the team has been deleted
    teamMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        io.to(userIdStr).emit('teamRemoved', {
          teamId: req.params.id,
          message: `Team "${teamName}" has been deleted by ${req.user.name}`,
        });
      }
    });

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createTeam, getTeams, getTeamById, updateTeam, deleteTeam };