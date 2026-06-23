import { Router } from "express";
import { requireAuth } from "../auth.js";
import { listCalls } from "../store.js";

const router = Router();

// GET /api/calls -> the current user's call history
router.get("/", requireAuth, (req, res) => {
  res.json({ calls: listCalls(req.user.id) });
});

export default router;
