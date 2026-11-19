/**
 * In-memory state for live rooms (one room per class). Lives here so the REST layer can
 * report on it and the socket handlers share one source of truth.
 */
const rooms = {}; // roomId -> [socketId]
const socketToRoom = {}; // socketId -> roomId
const userDetails = {}; // socketId -> { id, username, userId, role, isHost }
const screenSharers = {}; // roomId -> socketId
const usernameToSocket = {}; // userKey -> socketId (one live session per person)
const chatHistory = {}; // roomId -> last N messages
const notes = {}; // roomId -> { content, version, lastEditedBy }
const raisedHands = {}; // roomId -> Set(socketId)

const CHAT_LIMIT = 100;

const pushChat = (roomId, msg) => {
  chatHistory[roomId] = chatHistory[roomId] || [];
  chatHistory[roomId].push(msg);
  if (chatHistory[roomId].length > CHAT_LIMIT) chatHistory[roomId].shift();
};

/** Everything a late joiner needs to catch up. */
const getRoomSnapshot = (roomId) => ({
  participants: (rooms[roomId] || []).map((id) => userDetails[id]).filter(Boolean),
  screenSharerId: screenSharers[roomId] || null,
  chat: chatHistory[roomId] || [],
  notes: notes[roomId] || null,
  raisedHands: [...(raisedHands[roomId] || [])],
});

const clearRoom = (roomId) => {
  delete rooms[roomId];
  delete screenSharers[roomId];
  delete chatHistory[roomId];
  delete notes[roomId];
  delete raisedHands[roomId];
};

module.exports = {
  rooms,
  socketToRoom,
  userDetails,
  screenSharers,
  usernameToSocket,
  chatHistory,
  notes,
  raisedHands,
  pushChat,
  getRoomSnapshot,
  clearRoom,
};
