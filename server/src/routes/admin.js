import { Router } from "express";
import crypto from "node:crypto";
import {
  adminStats,
  adminListUsers,
  adminListReports,
  setBanned,
  deleteUser,
  deleteReport,
  getUserById,
} from "../store.js";
import { getOnlineUserCount } from "../sockets.js";

const router = Router();

// Every admin call must carry the key from the ZAPP_ADMIN_KEY env var.
function adminAuth(req, res, next) {
  const expected = process.env.ZAPP_ADMIN_KEY || "";
  if (!expected) return res.status(503).json({ error: "admin panel is not configured" });
  const given = (req.headers["x-admin-key"] || "").toString();
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "invalid admin key" });
  }
  next();
}

router.use(adminAuth);

// Overview numbers + system info.
router.get("/stats", (_req, res) => {
  res.json({
    ...adminStats(),
    online: getOnlineUserCount(),
    uptimeSec: Math.floor(process.uptime()),
    node: process.version,
    revision: process.env.K_REVISION || "local",
  });
});

// Users: list/search, ban, unban, delete.
router.get("/users", (req, res) => {
  res.json({ users: adminListUsers((req.query.q || "").toString().trim()) });
});

router.post("/users/:id(\\d+)/ban", (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "user not found" });
  setBanned(user.id, true);
  res.json({ ok: true, banned: true });
});

router.delete("/users/:id(\\d+)/ban", (req, res) => {
  setBanned(Number(req.params.id), false);
  res.json({ ok: true, banned: false });
});

router.delete("/users/:id(\\d+)", (req, res) => {
  const user = getUserById(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "user not found" });
  deleteUser(user.id);
  res.json({ ok: true });
});

// Abuse reports.
router.get("/reports", (_req, res) => {
  res.json({ reports: adminListReports() });
});

router.delete("/reports/:id(\\d+)", (req, res) => {
  deleteReport(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
