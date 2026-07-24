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
  setReaction,
  attachReactions,
  setStar,
  attachStarred,
  getStarredMessages,
  setPinned,
  getPinnedMessage,
  isChannel,
  isChannelOwner,
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
    // Channels are public broadcasts: anyone may read them, so you can preview
    // one from Discover before subscribing. Posting stays owner-only.
    if (!isChannel(convId) && !isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const before = req.query.before ? Number(req.query.before) : undefined;
    res.json({
      messages: attachStarred(
        attachReactions(listMessages(convId, { before, forUserId: req.user.id })),
        req.user.id
      ),
      pinnedMessage: getPinnedMessage(convId),
    });
  });

  // Starred (personal) — star/unstar + list.
  router.put("/:id/messages/:messageId/star", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    setStar(req.user.id, Number(req.params.messageId), req.body?.starred !== false);
    res.json({ ok: true });
  });

  router.get("/:id/starred", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    res.json({ messages: attachReactions(getStarredMessages(req.user.id, convId)) });
  });

  // Pinned (shared) — pin/unpin, broadcast to the room.
  router.put("/:id/pin", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const messageId = req.body?.messageId ? Number(req.body.messageId) : null;
    setPinned(convId, messageId);
    const pinnedMessage = getPinnedMessage(convId);
    io.to(`conversation:${convId}`).emit("message:pinned", {
      conversationId: convId,
      pinnedMessage,
    });
    res.json({ pinnedMessage });
  });

  router.delete("/:id/pin", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    setPinned(convId, null);
    io.to(`conversation:${convId}`).emit("message:pinned", {
      conversationId: convId,
      pinnedMessage: null,
    });
    res.json({ ok: true });
  });

  // PUT /api/conversations/:id/messages/:messageId/reaction { emoji }
  // Toggles the caller's reaction and broadcasts the new set.
  router.put("/:id/messages/:messageId/reaction", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    const messageId = Number(req.params.messageId);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const msg = getMessageById(messageId);
    if (!msg || msg.conversationId !== convId) {
      return res.status(404).json({ error: "message not found" });
    }
    const emoji = (req.body?.emoji || "").toString().trim().slice(0, 8);
    if (!emoji) return res.status(400).json({ error: "emoji is required" });
    const reactions = setReaction(messageId, req.user.id, emoji);
    io.to(`conversation:${convId}`).emit("message:reaction", {
      conversationId: convId,
      messageId,
      reactions,
    });
    res.json({ reactions });
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
    // Channels are broadcast-only: subscribers can read but not post.
    if (isChannel(convId) && !isChannelOwner(convId, req.user.id)) {
      return res.status(403).json({ error: "only the channel owner can post" });
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
