const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
} = require("../controllers/teamController");

module.exports = (io, connectedUsers) => {
  router.use(protect);
  router.post("/", (req, res) => createTeam(req, res, io, connectedUsers));
  router.get("/", getTeams);
  router.get("/:id", getTeamById);
  router.put("/:id", (req, res) => updateTeam(req, res, io, connectedUsers));
  router.delete("/:id", (req, res) => deleteTeam(req, res, io, connectedUsers));

  return router;
};