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

app.get("/", (req, res) => {
  res.send("<h1>Yare LMS + Google Meet Video Call Server Running!</h1>");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const rooms = {};
const userDetails = {};
const screenSharers = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", (userData) => {
    const { id, username, userId, roomId } = userData;
    if (!roomId || !username || !userId) {
      console.log("Invalid join data:", userData);
      return;
    }

    console.log(
      `User joining: ${username} (userId: ${userId}, socketId: ${socket.id})`
    );

    const newUser = { ...userData, socketId: socket.id };

    if (!rooms[roomId]) {
      rooms[roomId] = [];
      screenSharers[roomId] = null;
      console.log(`Room ${roomId} created`);
    }

    const existingUsers = rooms[roomId].slice();

    rooms[roomId].push(newUser);
    userDetails[socket.id] = newUser;
    socket.join(roomId);

    console.log(`Added user ${username} to room ${roomId}`);
    console.log(`Current room users:`, rooms[roomId]);

    existingUsers.forEach((u) => {
      console.log(`Notifying existing user ${u.username} about new user`);
      socket.to(u.id).emit("new-user-joined", newUser);
    });

    socket.emit("existing-users", existingUsers, screenSharers[roomId]);
  });

  socket.on("ice-candidate", (candidate, targetId, user) => {
    console.log("Received ICE candidate from:", user, "| ID:", user.userId);
    console.log("Target peer ID:", targetId);
    console.log("Candidate object:", candidate);

    socket.to(targetId).emit("ice-candidate", candidate, user);

    console.log(`Forwarded ICE candidate from ${user.username} to ${targetId}`);
  });

  socket.on("media-toggle", (state) => {
    console.log("[SERVER] media-toggle received:", state);

    if (!state.userId || !state.roomId) {
      console.log("Missing userId or roomId. Ignoring media-toggle.");
      return;
    }

    console.log("Searching for matching socket in room:", state.roomId);
    console.log("Current userDetails:", userDetails);

    const targetSocketId = Object.keys(userDetails).find((sid) => {
      const u = userDetails[sid];
      const match = u.userId === state.userId && u.roomId === state.roomId;

      console.log(
        `   → Checking socket ${sid}:`,
        "userId:",
        u.userId,
        "roomId:",
        u.roomId,
        "match:",
        match
      );

      return match;
    });

    if (!targetSocketId) {
      console.log("No matching socket found for userId:", state.userId);
      return;
    }

    console.log("Found matching socket:", targetSocketId);

    const user = userDetails[targetSocketId];

    console.log("Before Update:", {
      username: user.username,
      isMuted: user.isMuted,
      isShowVideo: user.isShowVideo,
      isHandRaised: user.isHandRaised,
    });

    user.isMuted = state.mic;
    user.isShowVideo = state.video;
    user.isHandRaised = state.isHandRaised;

    console.log("After Update:", {
      username: user.username,
      isMuted: user.isMuted,
      isShowVideo: user.isShowVideo,
      isHandRaised: user.isHandRaised,
    });

    const payload = {
      id: targetSocketId,
      username: user.username,
      isMuted: user.isMuted,
      isShowVideo: user.isShowVideo,
      isHandRaised: user.isHandRaised,
    };

    console.log(
      `Broadcasting peer-media-update to room ${state.roomId}:`,
      payload
    );

    io.to(state.roomId).emit("peer-media-update", payload);
  });

  socket.on("session-description", (sdp, targetId) => {
    socket.to(targetId).emit("session-description", socket.id, sdp);
  });

  socket.on("chat-message", (msg) => {
    const user = userDetails[socket.id];

    console.log("Received chat message:", msg);

    if (!user) {
      console.log("User not found for socket ID:", socket.id);
      return;
    }

    const { roomId, username } = user;

    console.log(`User: ${username}, Socket ID: ${socket.id}, Room: ${roomId}`);
    io.to(roomId).emit("chat-message", msg);

    console.log(`Message broadcasted to room ${roomId}:`, msg);
  });

  socket.on("reaction", (reaction) => {
    console.warn("Received reaction:", reaction);

    if (!reaction?.roomId) return;

    const payload = {
      userId: reaction.userId,
      username: reaction.username,
      reaction: reaction.reaction,
      roomId: reaction.roomId,
    };

    io.to(reaction.roomId).emit("reaction", payload);
    console.log(`Reaction emitted to room ${reaction.roomId}:`, payload);
  });

  socket.on("start-screen-share", (userData) => {
    console.log("Received start-screen-share event:", userData);

    if (!userData.roomId || !userData.userId) {
      console.log("Missing roomId or userId in start-screen-share", userData);
      return;
    }

    const roomId = userData.roomId;
    console.log("Room ID:", roomId);

    screenSharers[roomId] = socket.id;
    console.log("Updated screenSharers map:", screenSharers);

    const prevUserDetails = userDetails[socket.id] || {};
    userDetails[socket.id] = {
      id: socket.id,
      ...prevUserDetails,
      ...userData,
      screenshared: true,
      isScreenSharing: true,
      screensharingid: socket.id,
    };
    console.log("Updated userDetails for sharer:", userDetails[socket.id]);

    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].map((u) =>
        u.id === socket.id
          ? { ...u, isScreenSharing: true, screenshared: true, id: socket.id }
          : u
      );
    }

    console.log("Updated rooms with screen sharing:", rooms[roomId]);

    io.to(roomId).emit("start-screen-share", {
      sharer: userDetails[socket.id],
      users: rooms[roomId],
    });
    console.log(`Broadcasted start-screen-share to room ${roomId}:`, {
      sharer: userDetails[socket.id],
      users: rooms[roomId],
    });

    console.log(
      `User ${userData.username} started screen sharing in room ${roomId}`
    );
  });

  socket.on("stop-screen-share", (userData) => {
    if (!userData.roomId || !userData.userId) {
      console.log("Missing roomId or userId in stop-screen-share");
      return;
    }

    const roomId = userData.roomId;

    if (screenSharers[roomId] === socket.id) {
      screenSharers[roomId] = null;
    }

    if (userDetails[socket.id]) {
      userDetails[socket.id] = {
        ...userDetails[socket.id],
        screenshared: false,
        isScreenSharing: false,
        screensharingid: null,
      };
    }

    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].map((u) =>
        u.id === socket.id
          ? { ...u, isScreenSharing: false, screenshared: false }
          : u
      );
    }

    io.to(roomId).emit("stop-screen-share");

    console.log(
      `User ${userData.username} stopped screen sharing in room ${roomId}`
    );
  });

  socket.on("mute-all", (roomId) => {
    socket.to(roomId).emit("mute-all");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    const user = userDetails[socket.id];
    if (!user) return;

    const { roomId, username, userId } = user;
    const roomUsers = rooms[roomId];

    if (roomUsers) {
      const index = roomUsers.findIndex((u) => u.id === socket.id);
      if (index !== -1) {
        roomUsers.splice(index, 1);
      }

      io.to(roomId).emit("user-left", socket.id);

      console.log(
        `User ${username} left room ${roomId}. Remaining: ${roomUsers.length}`
      );

      if (roomUsers.length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} closed.`);
      }
    }

    delete userDetails[socket.id];
  });
});

app.get("/", (req, res) => {
  res.send(`
    <h1>YARE VIDEO SERVER IS RUNNING!</h1>
    <p>Rooms active: ${Object.keys(rooms).length}</p>
    <p>Users online: ${io.engine.clientsCount}</p>
  `);
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`YARE VIDEO SERVER RUNNING ON PORT ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
