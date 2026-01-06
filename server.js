const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const http = require("http");
const authRoutes = require("./routes/authRoutes");
const taskRoutes = require("./routes/taskRoutes");
const userRoutes = require("./routes/userRoutes");
const teamRoutes = require("./routes/teamRoutes");
const activityLogRoutes = require("./routes/activityLogRoutes"); // Add this line

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
});

const connectedUsers = new Set();
const socketUserMap = new Map(); // Map socket.id to userId

// Middleware
app.use(cors({ 
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
// });
// app.use(limiter);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Socket.IO Setup
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("join", (userId) => {
    if (!userId) {
      console.log("No userId provided for join event, socket:", socket.id);
      return;
    }
    socket.join(userId);
    connectedUsers.add(userId);
    socketUserMap.set(socket.id, userId); // Map socket.id to userId
    console.log(`User ${userId} joined room ${userId}`);
    console.log("Connected users:", Array.from(connectedUsers));
  });

  socket.on("disconnect", () => {
    const userId = socketUserMap.get(socket.id);
    if (userId) {
      connectedUsers.delete(userId);
      socketUserMap.delete(socket.id);
      console.log(`User ${userId} disconnected`);
      console.log("Connected users after disconnect:", Array.from(connectedUsers));
    }
    console.log("Client disconnected:", socket.id);
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes(io, connectedUsers));
app.use("/api/users", userRoutes);
app.use("/api/teams", teamRoutes(io, connectedUsers));
app.use("/api/activity-logs", activityLogRoutes(io, connectedUsers)); // Fixed: Pass io and connectedUsers
app.get("/", (req, res) => {
  res.json({ message: "Task Management API" });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;