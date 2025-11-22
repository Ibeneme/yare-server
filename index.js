const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const adminRoutes = require("./routers/adminRoutes");
const adminParentRoutes = require("./routers/parentRoutes");
const departmentRoutes = require("./routers/departmentRoutes");
const coursesRouter = require("./routers/courseRouter");
const userRouter = require("./routers/users.router");
const classRoutes = require("./routers/classRoutes");
const gradeRoutes = require("./routers/gradeRoutes");
const resourceRouter = require("./routers/resource.router");
const settingsRouter = require("./routers/settings");
const payrouter = require("./routers/lessonfee.router");
const awards = require("./routers/award.routes");
const subjectRouter = require("./routers/subject.router");
const gradesRouter = require("./routers/grade.router");
const classRouter = require("./routers/class.router");
const accountsRouter = require("./routers/accounts.router");
const runSubscriptionExpiryCheck = require("./cron/subscription");
const http = require("http");
const { Server } = require("socket.io"); // <-- CORRECTED IMPORT

runSubscriptionExpiryCheck();
dotenv.config();
console.log("Environment variables loaded");

try {
  connectDB();
  console.log("Connected to MongoDB");
} catch (error) {
  console.error("Failed to connect to MongoDB:", error);
  process.exit(1);
}

const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable("x-powered-by");
console.log("Middleware configured");

// Your existing routes
app.use("/api/admin", adminRoutes);
app.use("/api/admin-parent", adminParentRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/courses", coursesRouter);
app.use("/api/users", userRouter);
app.use("/api/admin-classes", classRoutes);
app.use("/api/admin/grades", gradeRoutes);
app.use("/api/admin/resource", resourceRouter);
app.use("/api/admin/yare/settings", settingsRouter);
app.use("/api/payment/yare/pay", payrouter);
app.use("/api/awards-for-student/awarding", awards);
app.use("/api/subject", subjectRouter);
app.use("/api/grades/grades", gradesRouter);
app.use("/api/class/class", classRouter);
app.use("/api/accounts", accountsRouter);

app.get("/", (req, res) => {
  res.send("<h1>Yare LMS + Google Meet Video Call Server Running!</h1>");
});
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// --- Socket.IO Signaling Logic for Group Mesh ---
const rooms = {};

// Store a reverse map to easily find a user's username/room on disconnect
// { 'socketId': { roomId: '...', username: '...' } }
const userDetails = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // 1. User joins the room (Now requires username)
  socket.on("join", (roomId, username) => {
    if (!roomId || !username) return;

    // 1a. Create the user object
    const newUser = { id: socket.id, username };

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    // Find existing users in the room (The full objects)
    const existingUsers = rooms[roomId].slice();

    // Add new user to the room list and reverse map
    rooms[roomId].push(newUser);
    userDetails[socket.id] = { roomId, username };
    socket.join(roomId);

    console.log(
      `User ${username} (${socket.id}) joined room: ${roomId}. Users: ${rooms[roomId].length}`
    );

    // 1b. Notify all EXISTING users about the NEW user.
    // Send the NEW user's ID and Username.
    existingUsers.forEach((existingUser) => {
      socket.to(existingUser.id).emit("new-user-joined", newUser);
    });

    // 1c. Notify the NEW user about all EXISTING users.
    // Send the list of existing user objects.
    socket.emit("existing-users", existingUsers);
  });

  // 2. Relay ICE candidates (No change needed here, still uses IDs)
  socket.on("ice-candidate", (candidate, targetId) => {
    socket.to(targetId).emit("ice-candidate", socket.id, candidate);
  });

  socket.on("peer-media-toggle", (peerId, state) => {
    const videoEl = document.getElementById(`video-${peerId}`);
    if (videoEl && videoEl.srcObject) {
      const stream = videoEl.srcObject;
      stream.getAudioTracks().forEach((t) => (t.enabled = state.mic));
      stream.getVideoTracks().forEach((t) => (t.enabled = state.video));
    }

    // Optional: update label or status to show peer is muted or camera off
    const labelEl = document.getElementById(`label-${peerId}`);
    if (labelEl) {
      const muteIcon = state.mic ? "" : " 🔇";
      const camIcon = state.video ? "" : " 📷❌";
      labelEl.textContent = `${
        peerData[peerId] || peerId
      }${muteIcon}${camIcon}`;
    }
  });

  // 3. Relay Session Description (Offer/Answer) (No change needed here, still uses IDs)
  socket.on("session-description", (sdp, targetId) => {
    socket.to(targetId).emit("session-description", socket.id, sdp);
  });

  // Add inside io.on("connection")
  socket.on("chat-message", (msg) => {
    const user = userDetails[socket.id];
    if (!user) return;
    const { roomId } = user;
    io.to(roomId).emit("chat-message", msg);
  });

  // Reactions
  socket.on("reaction", (reaction) => {
    const roomsOfUser = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsOfUser.forEach((roomId) => {
      socket.to(roomId).emit("reaction", reaction);
    });
  });

  // Raise / lower hand
  socket.on("raise-hand", (userId) => {
    const roomsOfUser = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsOfUser.forEach((roomId) => {
      socket.to(roomId).emit("raise-hand", userId);
    });
  });

  socket.on("lower-hand", (userId) => {
    const roomsOfUser = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsOfUser.forEach((roomId) => {
      socket.to(roomId).emit("lower-hand", userId);
    });
  });

  // screen-share events
  socket.on("start-screen-share", () => {
    const roomsOfUser = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsOfUser.forEach((roomId) => {
      socket.to(roomId).emit("start-screen-share", socket.id);
    });
  });

  socket.on("stop-screen-share", () => {
    const roomsOfUser = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsOfUser.forEach((roomId) => {
      socket.to(roomId).emit("stop-screen-share", socket.id);
    });
  });
  // Handle mute-all from host
  socket.on("mute-all", () => {
    // find all rooms this socket is in
    const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsJoined.forEach((roomId) => {
      socket.to(roomId).emit("mute-all"); // broadcast to everyone else
    });
  });

  // 4. Handle Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    const user = userDetails[socket.id];
    if (!user) return; // User wasn't in a managed room

    const { roomId, username } = user;
    const roomUsers = rooms[roomId];

    if (roomUsers) {
      // Remove user from the room list
      const index = roomUsers.findIndex((u) => u.id === socket.id);
      if (index !== -1) {
        roomUsers.splice(index, 1);
      }

      // Notify all remaining users in the room that this user left (send the ID)
      io.to(roomId).emit("user-left", socket.id);

      console.log(
        `User ${username} left room ${roomId}. Remaining: ${roomUsers.length}`
      );

      if (roomUsers.length === 0) {
        delete rooms[roomId]; // Clean up empty room
        console.log(`Room ${roomId} closed.`);
      }
    }

    // Remove from reverse map
    delete userDetails[socket.id];
  });
});

app.get("/", (req, res) => {
  res.send(`
    <h1>YARE VIDEO SERVER IS RUNNING!</h1>
    <p>Rooms active: ${rooms.size}</p>
    <p>Users online: ${io.engine.clientsCount}</p>
  `);
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`YARE VIDEO SERVER RUNNING ON PORT ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
