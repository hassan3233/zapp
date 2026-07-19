import { Router } from "express";
import { requireAuth } from "../auth.js";
import {
  findOrCreateDirect,
  listConversations,
  getConversationMembers,
  isMember,
  listMessages,
  createMessage,
  getUserById,
  createGroup,
  getMessageById,
  deleteMessage,
  hideMessage,
  editMessage,
} from "../store.js";

export default function conversationsRouter(io) {
  const router = Router();

  // GET /api/conversations -> all conversations for the current user
  router.get("/", requireAuth, (req, res) => {
    res.json({ conversations: listConversations(req.user.id) });
  });

  // POST /api/conversations { userId } -> find or create a 1:1 chat
  router.post("/", requireAuth, (req, res) => {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (Number(userId) === req.user.id) {
      return res.status(400).json({ error: "cannot start a chat with yourself" });
    }
    if (!getUserById(userId)) {
      return res.status(404).json({ error: "user not found" });
    }
    const convId = findOrCreateDirect(req.user.id, Number(userId));
    res.status(201).json({
      conversation: {
        id: convId,
        members: getConversationMembers(convId),
      },
    });
  });

  // POST /api/conversations/group { title, memberIds: [] } -> create a group chat
  router.post("/group", requireAuth, (req, res) => {
    const title = (req.body?.title || "").toString().trim();
    const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
    if (!title) return res.status(400).json({ error: "group name is required" });
    if (memberIds.length < 1) {
      return res.status(400).json({ error: "add at least one other member" });
    }
    const convId = createGroup(req.user.id, title, memberIds);
    res.status(201).json({
      conversation: {
        id: convId,
        title,
        isGroup: true,
        members: getConversationMembers(convId),
      },
    });
  });

  // GET /api/conversations/:id/members -> members incl. E2EE public keys
  router.get("/:id/members", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    res.json({ members: getConversationMembers(convId) });
  });

  // GET /api/conversations/:id/messages?before=123
  router.get("/:id/messages", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const before = req.query.before ? Number(req.query.before) : undefined;
    res.json({ messages: listMessages(convId, { before, forUserId: req.user.id }) });
  });

  // PATCH /api/conversations/:id/messages/:messageId { body }
  // Sender-only message editing; broadcasts the updated message.
  router.patch("/:id/messages/:messageId", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    const messageId = Number(req.params.messageId);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const msg = getMessageById(messageId);
    if (!msg || msg.conversationId !== convId) {
      return res.status(404).json({ error: "message not found" });
    }
    if (msg.senderId !== req.user.id) {
      return res.status(403).json({ error: "you can only edit your own messages" });
    }
    const body = (req.body?.body || "").toString().trim();
    if (!body) return res.status(400).json({ error: "message body is required" });
    const updated = editMessage(messageId, body);
    io.to(`conversation:${convId}`).emit("message:edited", updated);
    res.json({ message: updated });
  });

  // DELETE /api/conversations/:id/messages/:messageId?scope=everyone|me
  // "everyone" (sender only) removes it for all members and broadcasts;
  // "me" just hides it for the caller.
  router.delete("/:id/messages/:messageId", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    const messageId = Number(req.params.messageId);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const msg = getMessageById(messageId);
    if (!msg || msg.conversationId !== convId) {
      return res.status(404).json({ error: "message not found" });
    }
    const scope = req.query.scope === "everyone" ? "everyone" : "me";
    if (scope === "everyone") {
      if (msg.senderId !== req.user.id) {
        return res.status(403).json({ error: "you can only delete your own messages for everyone" });
      }
      deleteMessage(messageId);
      io.to(`conversation:${convId}`).emit("message:deleted", {
        conversationId: convId,
        messageId,
      });
    } else {
      hideMessage(req.user.id, messageId);
    }
    res.json({ ok: true, scope });
  });

  // POST /api/conversations/:id/messages { body }
  // Persists, then broadcasts over Socket.IO to the conversation room.
  router.post("/:id/messages", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const body = (req.body?.body || "").toString().trim();
    if (!body) return res.status(400).json({ error: "message body is required" });

    const message = createMessage({
      conversationId: convId,
      senderId: req.user.id,
      body,
    });
    io.to(`conversation:${convId}`).emit("message:new", message);
    res.status(201).json({ message });
  });

  return router;
}
