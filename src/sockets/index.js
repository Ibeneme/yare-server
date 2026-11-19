const { Server } = require("socket.io");
const { CORS_ORIGINS } = require("../config/env");
const { registerClassroomSockets } = require("./classroom.socket");

const initSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: CORS_ORIGINS.includes("*") ? "*" : CORS_ORIGINS, methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e6,
  });
  registerClassroomSockets(io);
  return io;
};

module.exports = { initSockets };
