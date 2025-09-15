const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const adminRoutes = require("./routers/adminRoutes");
const adminParentRoutes = require("./routers/parentRoutes");
const departmentRoutes = require("./routers/departmentRoutes");
const coursesRouter = require("./routers/courseRouter");
const userRouter = require("./routers/usersRouter");
const classRoutes = require("./routers/classRoutes");
const gradeRoutes = require("./routers/gradeRoutes");
const resourceRouter = require("./routers/resourceRouter");
const settingsRouter = require("./routers/settings");
const payrouter = require("./routers/lessonFeePayments");
const http = require("http");
const awards = require('./routers/award.routes')
const { Server } = require("socket.io");

dotenv.config();
console.log("✅ Environment variables loaded");

try {
  connectDB();
  console.log("✅ Connected to MongoDB");
} catch (error) {
  console.error("❌ Failed to connect to MongoDB:", error);
  process.exit(1);
}

const app = express();

app.use(cors({ origin: "*", credentials: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.disable("x-powered-by");
console.log("✅ Middleware configured");

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





//settingsRouter
console.log("✅ Routes configured");

app.get("/", (req, res) => {
  console.log("🌍 Root route hit");
  res.send("Yare API is running...");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
console.log("✅ Socket.IO server created");

const activeRooms = {};

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join_room", (roomId) => {
    if (!activeRooms[roomId]) {
      activeRooms[roomId] = { participants: new Set(), screenSharer: null };
    }

    activeRooms[roomId].participants.add(socket.id);
    socket.join(roomId);
    socket.currentRoom = roomId;

    console.log(
      `User ${socket.id} joined room: ${roomId}. Occupants: ${activeRooms[roomId].participants.size}`
    );

    const existingParticipants = Array.from(
      activeRooms[roomId].participants
    ).filter((id) => id !== socket.id);

    socket.emit("room_joined", {
      roomId,
      existingParticipants,
      currentScreenSharer: activeRooms[roomId].screenSharer, // Send current screen sharer status
    });
    socket.to(roomId).emit("new_participant", socket.id);

    if (activeRooms[roomId].screenSharer) {
      socket.emit("screen_sharer_updated", {
        sharerId: activeRooms[roomId].screenSharer,
      });
    }
  });

  socket.on("message", (message) => {
    // Basic message relay, ensure it's in a room
    if (socket.currentRoom) {
      console.log(
        `[Message] From ${socket.id} in room ${socket.currentRoom}, Type: ${message.type}`
      );
      // Relay message to target or all peers in the room (excluding sender)
      if (message.targetId && message.targetId !== "all_peers_in_room") {
        io.to(message.targetId).emit("message", message);
      } else {
        socket.to(socket.currentRoom).emit("message", message);
      }
    } else {
      console.warn(
        `[Message] Received message from ${socket.id} but not in a room:`,
        message
      );
    }
  });

  // New Socket.IO event for screen share status
  socket.on("screen_share_status", ({ sharing, room }) => {
    if (!room || !activeRooms[room]) {
      console.warn(
        `[Screen Share] Received status for non-existent room: ${room}`
      );
      return;
    }

    if (sharing) {
      // User wants to start sharing
      if (
        activeRooms[room].screenSharer &&
        activeRooms[room].screenSharer !== socket.id
      ) {
        // Someone else is already sharing, deny the request
        console.log(
          `[Screen Share] Denying screen share from ${socket.id} in room ${room}. ${activeRooms[room].screenSharer} is already sharing.`
        );
        socket.emit("message", {
          type: "screen_share_denied",
          reason: "Another participant is already sharing their screen.",
          from: "server",
        });
        return;
      }
      // Allow sharing
      activeRooms[room].screenSharer = socket.id;
      console.log(
        `[Screen Share] ${socket.id} started sharing screen in room ${room}`
      );
      // Notify everyone in the room (including the sharer) about the new sharer
      io.to(room).emit("screen_sharer_updated", { sharerId: socket.id });
      // Also send a message about screen_share_started for specific client-side handling if needed
      io.to(room).emit("message", {
        type: "screen_share_started",
        from: socket.id,
        room: room,
      });
    } else {
      // User wants to stop sharing
      if (activeRooms[room].screenSharer === socket.id) {
        activeRooms[room].screenSharer = null;
        console.log(
          `[Screen Share] ${socket.id} stopped sharing screen in room ${room}`
        );
        // Notify everyone in the room that screen sharing has stopped
        io.to(room).emit("screen_sharer_updated", { sharerId: null });
        io.to(room).emit("message", {
          type: "screen_share_stopped",
          from: socket.id,
          room: room,
        });
      } else {
        console.warn(
          `[Screen Share] ${socket.id} tried to stop screen share but was not the active sharer in room ${room}`
        );
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomId = socket.currentRoom;
    if (roomId && activeRooms[roomId]) {
      activeRooms[roomId].participants.delete(socket.id);
      console.log(
        `User ${socket.id} left room: ${roomId}. Remaining occupants: ${activeRooms[roomId].participants.size}`
      );

      // If the disconnected user was the screen sharer, reset the screenSharer state
      if (activeRooms[roomId].screenSharer === socket.id) {
        activeRooms[roomId].screenSharer = null;
        console.log(
          `[Screen Share] Active screen sharer ${socket.id} disconnected. Resetting screen share state for room ${roomId}.`
        );
        io.to(roomId).emit("screen_sharer_updated", { sharerId: null });
        io.to(roomId).emit("message", {
          type: "screen_share_stopped",
          from: socket.id,
          room: roomId,
        });
      }

      // If no participants left, delete the room
      if (activeRooms[roomId].participants.size === 0) {
        delete activeRooms[roomId];
        console.log(`Room ${roomId} is now empty and deleted.`);
      } else {
        // Notify remaining participants that someone left
        socket.to(roomId).emit("participant_left", socket.id);
        // Also send a 'bye' message for WebRTC cleanup (though participant_left handles cleanup directly too)
        socket
          .to(roomId)
          .emit("message", { type: "bye", from: socket.id, room: roomId });
      }
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
