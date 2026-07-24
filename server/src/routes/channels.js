import { Router } from "express";
import { requireAuth } from "../auth.js";
import {
  createChannel,
  getChannel,
  listChannels,
  subscribeToChannel,
  unsubscribeFromChannel,
  isChannelOwner,
  getConversationMembers,
} from "../store.js";

// Broadcast channels. A channel is a conversation with is_channel=1, so posts,
// media and the socket layer are all shared with normal chats — the only extra
// rules are "anyone can subscribe" and "only the owner posts" (enforced in
// sockets.js). Posts are NOT end-to-end encrypted: see the note in db.js.
export default function channelsRouter() {
  const router = Router();

  // GET /api/channels?q= -> every channel, annotated for this viewer
  router.get("/", requireAuth, (req, res) => {
    res.json({ channels: listChannels(req.user.id, req.query?.q) });
  });

  // POST /api/channels { title, description } -> create one (creator = owner)
  router.post("/", requireAuth, (req, res) => {
    const title = (req.body?.title || "").toString().trim();
    const description = (req.body?.description || "").toString().trim();
    if (!title) return res.status(400).json({ error: "channel name is required" });
    if (title.length > 60) {
      return res.status(400).json({ error: "channel name is too long" });
    }
    const id = createChannel(req.user.id, title, description);
    res.status(201).json({ channel: { ...getChannel(id), subscribed: true, isOwner: true } });
  });

  // GET /api/channels/:id
  router.get("/:id", requireAuth, (req, res) => {
    const ch = getChannel(Number(req.params.id));
    if (!ch) return res.status(404).json({ error: "channel not found" });
    const members = getConversationMembers(ch.id);
    res.json({
      channel: {
        ...ch,
        subscribed: members.some((m) => m.id === req.user.id),
        isOwner: isChannelOwner(ch.id, req.user.id),
      },
    });
  });

  // POST /api/channels/:id/subscribe
  router.post("/:id/subscribe", requireAuth, (req, res) => {
    const ch = getChannel(Number(req.params.id));
    if (!ch) return res.status(404).json({ error: "channel not found" });
    subscribeToChannel(ch.id, req.user.id);
    res.json({ ok: true, subscribed: true });
  });

  // DELETE /api/channels/:id/subscribe — the owner can't leave their own channel
  router.delete("/:id/subscribe", requireAuth, (req, res) => {
    const ch = getChannel(Number(req.params.id));
    if (!ch) return res.status(404).json({ error: "channel not found" });
    const left = unsubscribeFromChannel(ch.id, req.user.id);
    if (!left) {
      return res.status(400).json({ error: "the owner cannot leave their own channel" });
    }
    res.json({ ok: true, subscribed: false });
  });

  return router;
}
