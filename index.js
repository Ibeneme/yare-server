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
const { Server } = require("socket.io");

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ===============================
// State Management
// ===============================
const rooms = {}; // { roomId: [socketId1, socketId2] }
const socketToRoom = {}; // { socketId: roomId }
const userDetails = {}; // { socketId: { username, id } }
const screenSharers = {}; // { roomId: socketId }
const roomMuteState = {};
const usernameToSocket = {}; // { username: socketId }

/**
 * Fully removes a socket from whatever room it's in, notifies everyone
 * else, and clears screen-share state if that socket was presenting.
 * Used by "leave-room", "disconnect", and the duplicate-username kick,
 * so cleanup logic only has to be correct in one place.
 */
function cleanupUserFromRoom(io, socketId) {
  const roomId = socketToRoom[socketId];
  if (!roomId) return null;

  if (rooms[roomId]) {
    rooms[roomId] = rooms[roomId].filter((id) => id !== socketId);
  }

  if (screenSharers[roomId] === socketId) {
    delete screenSharers[roomId];
    io.to(roomId).emit("stop-screen-share");
  }

  // Notify everyone else in the room (never the leaving socket itself)
  io.to(roomId).except(socketId).emit("user-left", socketId);

  const socketObj = io.sockets.sockets.get(socketId);
  if (socketObj) socketObj.leave(roomId);

  const username = userDetails[socketId]?.username;
  if (username && usernameToSocket[username] === socketId) {
    delete usernameToSocket[username];
  }

  delete socketToRoom[socketId];
  delete userDetails[socketId];

  if (rooms[roomId] && rooms[roomId].length === 0) {
    delete rooms[roomId];
    delete screenSharers[roomId];
  }

  return roomId;
}

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join", (roomId, username) => {
    console.log(`➡️ ${username} wants to join room ${roomId}`);

    // =====================================
    // 🔐 ENFORCE ONE ROOM PER USERNAME
    // =====================================
    const existingSocketId = usernameToSocket[username];

    if (existingSocketId && existingSocketId !== socket.id) {
      console.log(
        `⚠️ ${username} already connected elsewhere, cleaning up old session...`
      );
      cleanupUserFromRoom(io, existingSocketId);

      const oldSocket = io.sockets.sockets.get(existingSocketId);
      if (oldSocket) oldSocket.emit("force-leave-room");
    }

    // Update username mapping
    usernameToSocket[username] = socket.id;

    // =====================================
    // ✅ NORMAL JOIN FLOW
    // =====================================
    if (!rooms[roomId]) rooms[roomId] = [];

    // Guard against the same socket joining twice (e.g. rejoining without
    // a clean leave in between) — prevents duplicate entries in the room.
    if (!rooms[roomId].includes(socket.id)) {
      rooms[roomId].push(socket.id);
    }

    const userData = { id: socket.id, username };
    userDetails[socket.id] = userData;
    socketToRoom[socket.id] = roomId;

    const usersInRoom = rooms[roomId]
      .filter((id) => id !== socket.id)
      .map((id) => userDetails[id])
      .filter(Boolean);

    socket.emit("existing-users", usersInRoom, screenSharers[roomId] || null);

    socket.join(roomId);

    // Tell the current presenter a late joiner is arriving, so the client
    // can double check / repair the screen-share connection if the normal
    // "new-user-joined" flow races with it.
    if (screenSharers[roomId]) {
      io.to(screenSharers[roomId]).emit(
        "prepare-late-joiner-screen",
        socket.id
      );
    }

    socket.to(roomId).emit("new-user-joined", userData);

    console.log(`✅ ${username} joined room ${roomId}`);
  });

  // --- WebRTC Signaling ---
  socket.on("session-description", (sdp, targetId) => {
    // Forward the offer/answer to the specific peer
    io.to(targetId).emit("session-description", socket.id, sdp);
  });

  socket.on("ice-candidate", (candidate, targetId) => {
    // Forward ICE candidates to the specific peer
    io.to(targetId).emit("ice-candidate", socket.id, candidate);
  });

  // --- Media & Interaction States ---
  socket.on("media-toggle", (mediaStatus) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      socket.to(roomId).emit("media-toggle", {
        senderId: socket.id,
        mediaStatus,
      });
    }
  });

  socket.on("raise-hand", () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) io.in(roomId).emit("raise-hand", socket.id);
  });

  socket.on("lower-hand", () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) io.in(roomId).emit("lower-hand", socket.id);
  });

  // --- Screen Sharing ---
  socket.on("start-screen-share", () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      screenSharers[roomId] = socket.id;
      socket.to(roomId).emit("start-screen-share", socket.id);
    }
  });

  socket.on("stop-screen-share", () => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      if (screenSharers[roomId] === socket.id) delete screenSharers[roomId];
      socket.to(roomId).emit("stop-screen-share");
    }
  });

  // --- Social Features ---
  socket.on("chat-message", (msg) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      // Broadcast to everyone in room except sender
      socket.to(roomId).emit("chat-message", msg);
    }
  });

  socket.on("reaction", ({ reaction }) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      // Broadcast to everyone in the room (including the sender)
      // This ensures everyone sees the floating emoji
      io.in(roomId).emit("reaction", {
        userId: socket.id,
        reaction,
      });
    }
  });

  // ===============================
  // MUTE ALL / UNMUTE ALL
  // ===============================
  socket.on("mute-all", () => {
    const roomId = socketToRoom[socket.id];
    if (!roomId) return;

    // Send to everyone EXCEPT the sender
    socket.to(roomId).emit("force-mute", {
      triggeredBy: socket.id,
    });

    console.log(`🔇 Mute-all by ${socket.id} in room ${roomId}`);
  });

  socket.on("unmute-all", () => {
    const roomId = socketToRoom[socket.id];
    if (!roomId) return;

    // Send to everyone EXCEPT the sender
    socket.to(roomId).emit("force-unmute", {
      triggeredBy: socket.id,
    });

    console.log(`🔊 Unmute-all by ${socket.id} in room ${roomId}`);
  });

  socket.on("remove-all-users", () => {
    const roomId = socketToRoom[socket.id];
    if (!roomId || !rooms[roomId]) return;

    console.log(`🚨 Removing all users from room ${roomId}`);

    // Notify everyone in the room
    io.in(roomId).emit("room-ended", {
      endedBy: socket.id,
    });

    // Remove every socket from the room
    rooms[roomId].forEach((socketId) => {
      const s = io.sockets.sockets.get(socketId);
      if (s) s.leave(roomId);

      const username = userDetails[socketId]?.username;
      if (username && usernameToSocket[username] === socketId) {
        delete usernameToSocket[username];
      }

      delete socketToRoom[socketId];
      delete userDetails[socketId];
    });

    // Cleanup room state
    delete rooms[roomId];
    delete screenSharers[roomId];

    console.log(`✅ Room ${roomId} fully cleared`);
  });

  // --- Graceful leave (socket stays alive — e.g. user clicks "Leave
  // Room" and navigates elsewhere in the app, but the room needs to be
  // told they're gone right away instead of waiting for a disconnect
  // that may never come since the socket is shared globally) ---
  socket.on("leave-room", () => {
    const roomId = cleanupUserFromRoom(io, socket.id);
    if (roomId) console.log(`👋 ${socket.id} left room ${roomId} gracefully`);
  });

  // --- Disconnection ---
  socket.on("disconnect", () => {
    cleanupUserFromRoom(io, socket.id);
    console.log("User Disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send(`
    <h1>Yare LMS + Google Meet Video Call Server Running!</h1>
    <p>Rooms active: ${Object.keys(rooms).length}</p>
    <p>Users online: ${io.engine.clientsCount}</p>
  `);
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`YARE VIDEO SERVER RUNNING ON PORT ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
