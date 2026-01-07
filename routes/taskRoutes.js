const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStatsByPriority,
} = require("../controllers/taskController");

module.exports = (io, connectedUsers) => {
  router.use(protect);
  router.post("/", (req, res) => createTask(req, res, io, connectedUsers));
  router.get("/", getTasks);
  
  // Route for statistics
  router.get("/stats/priority", getTaskStatsByPriority);

  router.get("/:id", getTaskById);
  router.put("/:id", (req, res) => updateTask(req, res, io, connectedUsers));
  router.delete("/:id", (req, res) => deleteTask(req, res, io, connectedUsers));

  return router;
};
