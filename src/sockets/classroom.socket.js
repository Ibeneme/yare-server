const nodemailer = require("nodemailer");
const { verifyToken } = require("../services/token.service");
const {
  getClassAccess,
  displayName,
} = require("../services/classAccess.service");
const Class = require("../models/Class");
const Assignment = require("../models/ClassAssignment");
const ClassroomNote = require("../models/ClassroomNote");
const { SOCKET_REQUIRE_AUTH } = require("../config/env");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const { getAccessState } = require("../services/access.service");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const state = require("./roomState");

const {
  rooms,
  socketToRoom,
  userDetails,
  screenSharers,
  usernameToSocket,
  notes,
  raisedHands,
} = state;
const REACTIONS = new Set([
  "👍",
  "👏",
  "❤️",
  "😂",
  "😮",
  "🎉",
  "🙏",
  "🔥",
  "😢",
]);
const NOTE_MAX = 50_000;
const CAPTION_MAX = 500;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB safety cap
const MAX_EMAIL_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB email attachment limit
const noteTimers = {}; // roomId -> debounce timer

const createMailTransporter = () => {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure:
      process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });
};

const mailTransporter = createMailTransporter();

const formatSeconds = (sec = 0) => {
  const total = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
};

const sendRecordingEmailToAdmins = async ({
  classDoc,
  recordingEntry,
  audioBuffer,
}) => {
  const admins = await Admin.find({
    isDeleted: { $ne: true },
    isSuspended: { $ne: true },
    email: { $exists: true, $ne: "" },
  })
    .select("email role superadmin")
    .lean();

  const recipients = [
    ...new Set(admins.map((a) => (a?.email || "").trim()).filter(Boolean)),
  ];

  if (!recipients.length) {
    console.warn("[classroom] no active admin/superadmin recipients found");
    return;
  }

  if (!mailTransporter) {
    console.warn(
      "[classroom] SMTP_HOST not configured; skipping recording email to admins",
    );
    return;
  }

  const classTitle = classDoc?.title?.trim() || `Class ${classDoc?._id}`;
  const durationLabel = formatSeconds(recordingEntry.durationSec);

  const attachments =
    audioBuffer && audioBuffer.length <= MAX_EMAIL_ATTACHMENT_BYTES
      ? [
          {
            filename: recordingEntry.fileName,
            content: audioBuffer,
            contentType: recordingEntry.mimeType,
          },
        ]
      : [];

  const fromAddress =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "no-reply@classroom.local";

  await mailTransporter.sendMail({
    from: fromAddress,
    to: recipients,
    subject: `New Call Recording: ${classTitle}`,
    html: `
      <p>A new call recording has been saved for <strong>${classTitle}</strong>.</p>
      <ul>
        <li><strong>Recorded by:</strong> ${recordingEntry.recordedBy}</li>
        <li><strong>Duration:</strong> ${durationLabel || "Unknown"}</li>
        <li><strong>File:</strong> ${recordingEntry.fileName}</li>
      </ul>
      <p><a href="${recordingEntry.url}">Listen / Download Recording</a></p>
    `,
    attachments,
  });
};

const toAudioBuffer = (payload = {}) => {
  if (Buffer.isBuffer(payload.audioBuffer)) {
    return payload.audioBuffer;
  }
  if (payload.audioBuffer instanceof ArrayBuffer) {
    return Buffer.from(payload.audioBuffer);
  }
  if (ArrayBuffer.isView(payload.audioBuffer)) {
    return Buffer.from(
      payload.audioBuffer.buffer,
      payload.audioBuffer.byteOffset,
      payload.audioBuffer.byteLength,
    );
  }
  if (typeof payload.audioBase64 === "string" && payload.audioBase64.trim()) {
    const clean = payload.audioBase64.includes(",")
      ? payload.audioBase64.split(",")[1]
      : payload.audioBase64;
    return Buffer.from(clean, "base64");
  }
  return null;
};

const leaveCleanup = (io, socketId) => {
  const roomId = socketToRoom[socketId];
  if (!roomId) return null;

  if (rooms[roomId])
    rooms[roomId] = rooms[roomId].filter((id) => id !== socketId);
  raisedHands[roomId]?.delete(socketId);

  if (screenSharers[roomId] === socketId) {
    delete screenSharers[roomId];
    io.to(roomId).emit("stop-screen-share");
  }
  io.to(roomId).except(socketId).emit("user-left", socketId);

  io.sockets.sockets.get(socketId)?.leave(roomId);

  const key = userDetails[socketId]?.userKey;
  if (key && usernameToSocket[key] === socketId) delete usernameToSocket[key];
  delete socketToRoom[socketId];
  delete userDetails[socketId];

  if (!rooms[roomId]?.length) {
    flushNotes(roomId);
    state.clearRoom(roomId);
  }
  return roomId;
};

const flushNotes = async (roomId) => {
  clearTimeout(noteTimers[roomId]);
  delete noteTimers[roomId];
  const n = notes[roomId];
  if (!n) return;
  try {
    await ClassroomNote.findOneAndUpdate(
      { classId: roomId },
      { content: n.content, version: n.version, lastEditedBy: n.lastEditedBy },
      { upsert: true },
    );
  } catch (e) {
    console.error("[classroom] saving notes failed:", e.message);
  }
};

const registerClassroomSockets = (io) => {
  // ---- authenticate every connection (token via io(url, { auth: { token } }))
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) {
      if (SOCKET_REQUIRE_AUTH)
        return next(new Error("Authentication required"));
      socket.data.user = null;
      return next();
    }
    try {
      const d = verifyToken(token);
      socket.data.user = { id: d.id, userType: d.userType };
      next();
    } catch (e) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const me = () => userDetails[socket.id];
    const roomOf = () => socketToRoom[socket.id];
    const isHost = () => Boolean(me()?.isHost);

    // Join: roomId is the class id. (roomId, username) signature kept from the old client.
    socket.on("join", async (roomId, username, ack) => {
      try {
        const user = socket.data.user;
        let isHostUser = false;
        let role = "guest";
        let name = username || "Guest";
        let userKey = `guest:${username}`;

        if (user) {
          const access = await getClassAccess({
            userId: user.id,
            userType: user.userType,
            classId: roomId,
          });
          if (!access.allowed) {
            socket.emit("join-denied", {
              reason: "You do not have access to this class",
            });
            return typeof ack === "function" && ack({ ok: false });
          }
          // View-only students cannot join live sessions. The wording never mentions fees.
          if (user.userType === "student") {
            const st = await Student.findById(user.id)
              .select(
                "isSubscribed isPaid subscriptionExpiredAt expiryGraceEndsAt adminGraceUntil trialEndsAt",
              )
              .lean();
            if (st && getAccessState(st).mode === "read_only") {
              socket.emit("join-denied", {
                reason:
                  "Live sessions aren't available on your account right now.",
                readOnly: true,
              });
              return (
                typeof ack === "function" && ack({ ok: false, readOnly: true })
              );
            }
          }
          isHostUser = access.isHost;
          role = access.role;
          name = (await displayName(user.id, user.userType)) || name;
          userKey = `${user.userType}:${user.id}`;
        }

        // one live session per person
        const existing = usernameToSocket[userKey];
        if (existing && existing !== socket.id) {
          leaveCleanup(io, existing);
          io.sockets.sockets.get(existing)?.emit("force-leave-room");
        }
        usernameToSocket[userKey] = socket.id;

        rooms[roomId] = rooms[roomId] || [];
        if (!rooms[roomId].includes(socket.id)) rooms[roomId].push(socket.id);

        const details = {
          id: socket.id,
          username: name,
          userId: user?.id || null,
          role,
          isHost: isHostUser,
          userKey,
          captionsEnabled: false,
        };
        userDetails[socket.id] = details;
        socketToRoom[socket.id] = roomId;

        const others = rooms[roomId]
          .filter((id) => id !== socket.id)
          .map((id) => publicUser(userDetails[id]))
          .filter(Boolean);
        // Late joiner sync: current presenter is sent with the user list
        socket.emit("existing-users", others, screenSharers[roomId] || null);
        socket.join(roomId);

        // Notes, chat history, raised hands, and existing recordings for the newcomer
        let snapshot = state.getRoomSnapshot(roomId);
        if (!snapshot.notes) {
          const saved = await ClassroomNote.findOne({ classId: roomId }).lean();
          if (saved)
            notes[roomId] = {
              content: saved.content,
              version: saved.version,
              lastEditedBy: saved.lastEditedBy,
            };
          snapshot = state.getRoomSnapshot(roomId);
        }
        const [assignments, classDoc] = await Promise.all([
          Assignment.find({ classId: roomId })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),
          Class.findById(roomId).select("recordings").lean(),
        ]);

        socket.emit("room-state", {
          ...snapshot,
          participants: snapshot.participants.map(publicUser),
          assignments,
          recordings: classDoc?.recordings || [],
          me: publicUser(details),
        });

        // Ask the presenter to open a stream to the newcomer
        if (screenSharers[roomId])
          io.to(screenSharers[roomId]).emit(
            "prepare-late-joiner-screen",
            socket.id,
          );
        socket.to(roomId).emit("new-user-joined", publicUser(details));
        if (typeof ack === "function")
          ack({
            ok: true,
            role,
            isHost: isHostUser,
            captionsEnabled: details.captionsEnabled,
          });
      } catch (err) {
        console.error("[classroom] join error:", err.message);
        socket.emit("join-denied", { reason: "Could not join the class" });
      }
    });

    // ---- WebRTC signalling (only between members of the same room)
    const sameRoom = (targetId) =>
      roomOf() && socketToRoom[targetId] === roomOf();
    socket.on(
      "session-description",
      (sdp, targetId) =>
        sameRoom(targetId) &&
        io.to(targetId).emit("session-description", socket.id, sdp),
    );
    socket.on(
      "ice-candidate",
      (candidate, targetId) =>
        sameRoom(targetId) &&
        io.to(targetId).emit("ice-candidate", socket.id, candidate),
    );

    socket.on("media-toggle", (mediaStatus) => {
      const r = roomOf();
      if (r)
        socket.to(r).emit("media-toggle", { senderId: socket.id, mediaStatus });
    });

    // ---- per-user live captions toggle & broadcast
    socket.on("captions:toggle", ({ enabled } = {}, ack) => {
      const r = roomOf();
      const sender = me();
      if (!r || !sender) {
        return (
          typeof ack === "function" &&
          ack({ ok: false, captionsEnabled: false })
        );
      }
      const nextEnabled = Boolean(enabled);
      sender.captionsEnabled = nextEnabled;
      socket.emit("captions:state", {
        userId: socket.id,
        captionsEnabled: nextEnabled,
      });
      socket.to(r).emit("captions:user-state", {
        userId: socket.id,
        username: sender.username,
        captionsEnabled: nextEnabled,
      });
      if (typeof ack === "function")
        ack({ ok: true, captionsEnabled: nextEnabled });
    });

    socket.on("caption", (payload = {}) => {
      const r = roomOf();
      const sender = me();
      if (!r || !sender) return;

      const text = String(payload?.text ?? payload?.caption ?? "")
        .slice(0, CAPTION_MAX)
        .trim();
      if (!text) return;

      io.in(r).emit("caption", {
        id: payload?.id || `${socket.id}-${Date.now()}`,
        senderId: socket.id,
        username: sender.username,
        text,
        isFinal: Boolean(payload?.isFinal),
        lang:
          typeof payload?.lang === "string"
            ? payload.lang.slice(0, 16)
            : "en-US",
        at: Date.now(),
      });
    });

    // ---- audio-only call recording -> Backblaze B2 -> Class.recordings
    // Does NOT require an active classroom room; uses roomOf() if present or payload.classId.
    socket.on("recording:save-audio", async (payload = {}, ack) => {
      try {
        const targetClassId = roomOf() || payload.classId || payload.roomId;
        if (!targetClassId) {
          return (
            typeof ack === "function" &&
            ack({ ok: false, error: "Class ID is required" })
          );
        }

        const audioBuffer = toAudioBuffer(payload);
        if (!audioBuffer || !audioBuffer.length) {
          return (
            typeof ack === "function" &&
            ack({ ok: false, error: "Missing or empty audio recording" })
          );
        }

        if (audioBuffer.length > MAX_AUDIO_BYTES) {
          return (
            typeof ack === "function" &&
            ack({ ok: false, error: "Audio recording exceeds size limit" })
          );
        }

        const sender = me();
        const recordedBy =
          sender?.username ||
          (typeof payload.recordedBy === "string" &&
            payload.recordedBy.trim()) ||
          (socket.data.user?.id
            ? `${socket.data.user.userType || "user"}:${socket.data.user.id}`
            : "Unknown");

        const mimeType =
          typeof payload.mimeType === "string" && payload.mimeType.trim()
            ? payload.mimeType.trim()
            : "audio/webm";

        const rawExt =
          typeof payload.extension === "string" && payload.extension.trim()
            ? payload.extension
            : mimeType.includes("mp4") || mimeType.includes("m4a")
              ? "m4a"
              : mimeType.includes("ogg")
                ? "ogg"
                : "webm";

        const safeExt =
          rawExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webm";
        const originalName = `class-${targetClassId}-call.${safeExt}`;

        const url = await uploadToBackblaze(
          audioBuffer,
          originalName,
          "call-recordings",
        );

        const recordingEntry = {
          url,
          fileName: originalName,
          mimeType,
          durationSec: Math.max(0, Number(payload.durationSec) || 0),
          recordedBy,
          recordedAt: new Date(),
        };

        const updatedClass = await Class.findByIdAndUpdate(
          targetClassId,
          { $push: { recordings: recordingEntry } },
          { new: true, runValidators: true },
        ).lean();

        if (!updatedClass) {
          return (
            typeof ack === "function" &&
            ack({ ok: false, error: "Class not found" })
          );
        }

        io.to(String(targetClassId)).emit("recording:saved", {
          classId: String(targetClassId),
          recording: recordingEntry,
        });

        sendRecordingEmailToAdmins({
          classDoc: updatedClass,
          recordingEntry,
          audioBuffer,
        }).catch((mailErr) => {
          console.error(
            "[classroom] failed to email admins recording:",
            mailErr.message,
          );
        });

        if (typeof ack === "function") {
          ack({ ok: true, url, recording: recordingEntry });
        }
      } catch (err) {
        console.error("[classroom] saving call audio failed:", err.message);
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message || "Failed to save recording" });
        }
      }
    });

    // ---- hands
    socket.on("raise-hand", () => {
      const r = roomOf();
      if (!r) return;
      (raisedHands[r] = raisedHands[r] || new Set()).add(socket.id);
      io.in(r).emit("raise-hand", socket.id);
    });
    socket.on("lower-hand", () => {
      const r = roomOf();
      if (!r) return;
      raisedHands[r]?.delete(socket.id);
      io.in(r).emit("lower-hand", socket.id);
    });

    // ---- screen sharing (host-only: teacher/admin present; others view)
    socket.on("start-screen-share", () => {
      const r = roomOf();
      if (!r || !isHost()) return;
      const previous = screenSharers[r];
      if (previous && previous !== socket.id)
        io.to(previous).emit("stop-screen-share");
      screenSharers[r] = socket.id;
      socket.to(r).emit("start-screen-share", socket.id);
    });
    socket.on("stop-screen-share", () => {
      const r = roomOf();
      if (!r) return;
      if (screenSharers[r] === socket.id) {
        delete screenSharers[r];
        socket.to(r).emit("stop-screen-share");
      }
    });

    // ---- chat
    socket.on("chat-message", (msg) => {
      const r = roomOf();
      if (!r || !me()) return;
      const text = String(
        typeof msg === "string" ? msg : (msg?.text ?? msg?.message ?? ""),
      )
        .slice(0, 2000)
        .trim();
      if (!text) return;
      const out = {
        ...(typeof msg === "object" ? msg : {}),
        text,
        message: text,
        senderId: socket.id,
        sender: me().username,
        at: Date.now(),
      };
      state.pushChat(r, out);
      socket.to(r).emit("chat-message", out);
    });

    // ---- reactions
    socket.on("reaction", ({ reaction } = {}) => {
      const r = roomOf();
      if (r && REACTIONS.has(reaction))
        io.in(r).emit("reaction", {
          userId: socket.id,
          username: me()?.username,
          reaction,
        });
    });

    // ---- shared notes (last write wins, versioned; saved to DB shortly after edits)
    socket.on("notes:update", ({ content, baseVersion } = {}) => {
      const r = roomOf();
      if (
        !r ||
        !me() ||
        typeof content !== "string" ||
        content.length > NOTE_MAX
      )
        return;
      const current = notes[r] || { content: "", version: 0 };
      const next = {
        content,
        version: current.version + 1,
        lastEditedBy: me().username,
      };
      notes[r] = next;
      socket.to(r).emit("notes:updated", {
        ...next,
        conflictWith:
          baseVersion !== undefined && baseVersion !== current.version,
      });
      socket.emit("notes:ack", { version: next.version });
      clearTimeout(noteTimers[r]);
      noteTimers[r] = setTimeout(() => flushNotes(r), 3000);
    });

    // ---- assignments posted during the live session (teacher/admin)
    socket.on(
      "assignment:create",
      async ({ title, instructions, dueDate } = {}, ack) => {
        const r = roomOf();
        if (!r || !isHost())
          return (
            typeof ack === "function" &&
            ack({ ok: false, error: "Only the teacher can post assignments" })
          );
        if (!title || !String(title).trim())
          return (
            typeof ack === "function" &&
            ack({ ok: false, error: "title is required" })
          );
        try {
          const doc = await Assignment.create({
            classId: r,
            teacherId: me().userId,
            title: String(title).trim(),
            instructions,
            dueDate,
            postedDuringLive: true,
          });
          io.in(r).emit("assignment:new", doc);
          typeof ack === "function" && ack({ ok: true, assignment: doc });
        } catch (e) {
          typeof ack === "function" && ack({ ok: false, error: e.message });
        }
      },
    );

    // ---- host controls
    socket.on(
      "mute-all",
      () =>
        roomOf() &&
        isHost() &&
        socket.to(roomOf()).emit("force-mute", { triggeredBy: socket.id }),
    );
    socket.on(
      "unmute-all",
      () =>
        roomOf() &&
        isHost() &&
        socket.to(roomOf()).emit("force-unmute", { triggeredBy: socket.id }),
    );
    socket.on("remove-all-users", () => {
      const r = roomOf();
      if (!r || !isHost() || !rooms[r]) return;
      io.in(r).emit("room-ended", { endedBy: socket.id });
      [...rooms[r]].forEach((id) => {
        io.sockets.sockets.get(id)?.leave(r);
        const key = userDetails[id]?.userKey;
        if (key && usernameToSocket[key] === id) delete usernameToSocket[key];
        delete socketToRoom[id];
        delete userDetails[id];
      });
      flushNotes(r);
      state.clearRoom(r);
    });

    socket.on("leave-room", () => leaveCleanup(io, socket.id));
    socket.on("disconnect", () => leaveCleanup(io, socket.id));
  });
};

// userKey is internal bookkeeping
const publicUser = (u) =>
  u && {
    id: u.id,
    username: u.username,
    role: u.role,
    isHost: u.isHost,
    captionsEnabled: Boolean(u.captionsEnabled),
  };

module.exports = { registerClassroomSockets };