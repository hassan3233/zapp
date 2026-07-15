import { Router } from "express";
import { requireAuth } from "../auth.js";
import { searchUsers, publicUser, savePushToken, deletePushToken } from "../store.js";

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

export default router;
