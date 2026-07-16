import { Router } from "express";
import { requireAuth } from "../auth.js";
import {
  searchUsers,
  publicUser,
  savePushToken,
  deletePushToken,
  getUserById,
  blockUser,
  unblockUser,
  hasBlocked,
  createReport,
} from "../store.js";

const router = Router();

// GET /api/users?q=foo  -> search for people to start a chat with
router.get("/", requireAuth, (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const results = searchUsers(q, req.user.id);
  res.json({ users: results.map(publicUser) });
});

// Register this device's FCM token so we can push notifications to the user.
router.post("/push-token", requireAuth, (req, res) => {
  const token = (req.body?.token || "").toString().trim();
  if (!token) return res.status(400).json({ error: "token is required" });
  savePushToken(req.user.id, token, req.body?.platform);
  res.json({ ok: true });
});

// Forget this device's token (e.g. on logout).
router.delete("/push-token", requireAuth, (req, res) => {
  const token = (req.body?.token || "").toString().trim();
  if (token) deletePushToken(token);
  res.json({ ok: true });
});

// View someone's profile (+ whether I've blocked them).
router.get("/:id(\\d+)", requireAuth, (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json({
    user: publicUser(user),
    blockedByMe: hasBlocked(req.user.id, user.id),
  });
});

// Block / unblock a user (stops messages and calls both ways).
router.post("/:id(\\d+)/block", requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: "cannot block yourself" });
  if (!getUserById(targetId)) return res.status(404).json({ error: "user not found" });
  blockUser(req.user.id, targetId);
  res.json({ ok: true, blocked: true });
});

router.delete("/:id(\\d+)/block", requireAuth, (req, res) => {
  unblockUser(req.user.id, Number(req.params.id));
  res.json({ ok: true, blocked: false });
});

// Report a user for abuse (stored for review).
router.post("/:id(\\d+)/report", requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: "cannot report yourself" });
  if (!getUserById(targetId)) return res.status(404).json({ error: "user not found" });
  const reason = (req.body?.reason || "").toString().trim().slice(0, 500);
  createReport(req.user.id, targetId, reason || null);
  res.json({ ok: true });
});

export default router;
