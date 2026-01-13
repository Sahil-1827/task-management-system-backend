const Team = require('../models/Team');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');


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
      managers: [req.user._id],
      createdBy: req.user._id,
    });

    await team.save();


    await ActivityLog.create({
      action: 'create',
      entity: 'team',
      entityId: team._id,
      performedBy: req.user._id,
      details: `Team "${team.name}" was created by ${req.user.name}`
    });

    const populatedTeam = await Team.findById(team._id)
      .populate('members', 'name email profilePicture')
      .populate('createdBy', 'name email profilePicture');


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


const getTeams = async (req, res) => {
  try {
    const { page = 1, limit = 9999, search = '', member } = req.query;


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
          { members: req.user._id },
        ],
      };
    } else {
      query = { members: req.user._id };
    }


    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }


    if (member) {
      query.members = member;
    }


    const teams = await Team.find(query)
      .populate('createdBy', 'name email profilePicture')
      .populate('members', 'name email profilePicture')
      .skip(skip)
      .limit(limitNum);


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


const getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('createdBy', 'name email profilePicture')
      .populate('members', 'name email profilePicture');

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

    const oldTeam = { ...team._doc };
    const oldMembers = team.members.map((id) => id.toString());


    if (name !== undefined) team.name = name;
    if (description !== undefined) team.description = description;
    if (members !== undefined) team.members = members;

    await team.save();


    let changes = [];
    if (oldTeam.name !== team.name)
      changes.push(`name from "${oldTeam.name}" to "${team.name}"`);
    if (oldTeam.description !== team.description)
      changes.push(`description`);


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

    for (const userId of addedMembers) {
      await ActivityLog.create({
        action: "assign",
        entity: "user",
        entityId: userId,
        performedBy: req.user._id,
        details: `You were added to team "${team.name}" by ${req.user.name}`
      });
    }


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
      .populate('members', 'name email profilePicture')
      .populate('createdBy', 'name email profilePicture');


    addedMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        io.to(userIdStr).emit('teamAdded', {
          team: populatedTeam,
          message: `You have been added to team "${team.name}" by ${req.user.name}`,
        });
      }
    });


    removedMembers.forEach((userId) => {
      const userIdStr = userId.toString();
      if (connectedUsers.has(userIdStr)) {
        io.to(userIdStr).emit('teamRemoved', {
          teamId: team._id,
          message: `You have been removed from team "${oldTeam.name}" by ${req.user.name}`,
        });
      }
    });


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


    await ActivityLog.create({
      action: 'delete',
      entity: 'team',
      entityId: team._id,
      performedBy: req.user._id,
      details: `Team "${teamName}" was deleted by ${req.user.name}`
    });

    for (const userId of teamMembers) {
      if (userId !== req.user._id.toString()) {
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