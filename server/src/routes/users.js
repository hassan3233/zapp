import { Router } from "express";
import { requireAuth } from "../auth.js";
import { searchUsers, publicUser } from "../store.js";

const router = Router();

// GET /api/users?q=foo  -> search for people to start a chat with
router.get("/", requireAuth, (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const results = searchUsers(q, req.user.id);
  res.json({ users: results.map(publicUser) });
});

export default router;
