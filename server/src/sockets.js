import { verifyToken } from "./auth.js";
import {
  isMember,
  createMessage,
  getMessageById,
  createCall,
  finishCall,
  getUserById,
  publicUser,
} from "./store.js";

// Presence: how many live sockets each user has, and when they were last seen.
const onlineCounts = new Map(); // userId -> socket count
const lastSeenMap = new Map(); // userId -> ISO timestamp

export function registerSockets(io) {
  // Authenticate every socket connection using the JWT from the handshake.
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("authentication required"));
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error("invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Personal room so we can target a specific user across devices.
    socket.join(`user:${socket.user.id}`);

    // ---------- Presence ----------
    const uid = socket.user.id;
    const prevCount = onlineCounts.get(uid) || 0;
    onlineCounts.set(uid, prevCount + 1);
    if (prevCount === 0) {
      io.emit("presence:update", { userId: uid, online: true });
    }
    // Tell the freshly-connected client who is currently online.
    socket.emit("presence:state", {
      online: [...onlineCounts.keys()],
      lastSeen: Object.fromEntries(lastSeenMap),
    });

    socket.on("disconnect", () => {
      const n = (onlineCounts.get(uid) || 1) - 1;
      if (n <= 0) {
        onlineCounts.delete(uid);
        const ts = new Date().toISOString();
        lastSeenMap.set(uid, ts);
        io.emit("presence:update", { userId: uid, online: false, lastSeen: ts });
      } else {
        onlineCounts.set(uid, n);
      }
    });

    // Client asks to join a conversation room (must be a member).
    socket.on("conversation:join", (conversationId, ack) => {
      const convId = Number(conversationId);
      if (!isMember(convId, socket.user.id)) {
        if (typeof ack === "function") ack({ ok: false, error: "forbidden" });
        return;
      }
      socket.join(`conversation:${convId}`);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("conversation:leave", (conversationId) => {
      socket.leave(`conversation:${Number(conversationId)}`);
    });

    // Send a message over the socket (real-time path).
    socket.on("message:send", ({ conversationId, body } = {}, ack) => {
      const convId = Number(conversationId);
      const text = (body || "").toString().trim();
      if (!text) {
        if (typeof ack === "function") ack({ ok: false, error: "empty message" });
        return;
      }
      if (!isMember(convId, socket.user.id)) {
        if (typeof ack === "function") ack({ ok: false, error: "forbidden" });
        return;
      }
      const message = createMessage({
        conversationId: convId,
        senderId: socket.user.id,
        body: text,
      });
      io.to(`conversation:${convId}`).emit("message:new", message);
      if (typeof ack === "function") ack({ ok: true, message });
    });

    // Lightweight typing indicator relayed to the other members.
    socket.on("typing", ({ conversationId, isTyping } = {}) => {
      const convId = Number(conversationId);
      socket.to(`conversation:${convId}`).emit("typing", {
        conversationId: convId,
        userId: socket.user.id,
        isTyping: !!isTyping,
      });
    });

    // ---------- Calls (signaling) ----------
    const toUser = (id) => `user:${Number(id)}`;

    // Caller starts a call. Creates a call record and rings the callee.
    socket.on("call:invite", ({ toUserId, media } = {}, ack) => {
      const callee = getUserById(Number(toUserId));
      if (!callee) {
        if (typeof ack === "function") ack({ ok: false, error: "user not found" });
        return;
      }
      const call = createCall({
        callerId: socket.user.id,
        calleeId: Number(toUserId),
        media: media === "video" ? "video" : "audio",
      });
      io.to(toUser(toUserId)).emit("call:incoming", {
        callId: call.id,
        media: call.media,
        from: publicUser(getUserById(socket.user.id)),
      });
      if (typeof ack === "function") ack({ ok: true, callId: call.id });
    });

    socket.on("call:accept", ({ callId, toUserId } = {}) => {
      io.to(toUser(toUserId)).emit("call:accepted", { callId, by: socket.user.id });
    });

    socket.on("call:reject", ({ callId, toUserId } = {}) => {
      if (callId) finishCall(Number(callId), "declined", 0);
      io.to(toUser(toUserId)).emit("call:rejected", { callId });
    });

    socket.on("call:cancel", ({ callId, toUserId } = {}) => {
      if (callId) finishCall(Number(callId), "canceled", 0);
      io.to(toUser(toUserId)).emit("call:canceled", { callId });
    });

    socket.on("call:end", ({ callId, toUserId, durationSec, answered } = {}) => {
      if (callId) finishCall(Number(callId), answered ? "ended" : "missed", durationSec || 0);
      io.to(toUser(toUserId)).emit("call:ended", { callId });
    });

    // WebRTC signaling relay (offer / answer / ICE candidates).
    socket.on("webrtc:offer", ({ toUserId, callId, sdp } = {}) => {
      io.to(toUser(toUserId)).emit("webrtc:offer", {
        callId,
        sdp,
        from: socket.user.id,
      });
    });
    socket.on("webrtc:answer", ({ toUserId, callId, sdp } = {}) => {
      io.to(toUser(toUserId)).emit("webrtc:answer", { callId, sdp, from: socket.user.id });
    });
    socket.on("webrtc:ice", ({ toUserId, callId, candidate } = {}) => {
      io.to(toUser(toUserId)).emit("webrtc:ice", {
        callId,
        candidate,
        from: socket.user.id,
      });
    });
  });
}
