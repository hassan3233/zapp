import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketServer } from "socket.io";

import { PORT } from "./config.js";
import db from "./db.js"; // initialize schema on boot
import { startPersistence } from "./persistence.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import conversationsRouter from "./routes/conversations.js";
import callsRoutes from "./routes/calls.js";
import adminRoutes from "./routes/admin.js";
import { ADMIN_PAGE } from "./adminPage.js";
import { registerSockets } from "./sockets.js";

const app = express();
app.use(cors());
// Larger limit so base64 profile pictures fit in the request body.
app.use(express.json({ limit: "8mb" }));

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: "*" } });

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "zapp" }));

// ---- Public pages (used for Firebase phone-auth branding) ----
const PAGE = (title, body) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:720px;margin:0 auto;padding:32px 20px;color:#15171C;line-height:1.6}
h1{color:#15171C}a{color:#E6B800}.bolt{color:#FFD11E}.muted{color:#6B7280;font-size:14px}
</style></head><body>${body}<p class="muted">Contact: rafalh649@gmail.com</p></body></html>`;

app.get("/", (_req, res) =>
  res.type("html").send(
    PAGE(
      "Zapp Chat",
      `<h1>⚡ Zapp <span class="bolt">Chat</span></h1>
      <p>Chat. Call. Connect. A private messaging app with end-to-end encrypted chats and calls.</p>
      <p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>`
    )
  )
);

app.get("/privacy", (_req, res) =>
  res.type("html").send(
    PAGE(
      "Zapp Chat — Privacy Policy",
      `<h1>Privacy Policy</h1>
      <p><em>Last updated: 2026</em></p>
      <p>Zapp Chat ("the app") respects your privacy. This policy explains what we collect and why.</p>
      <h3>Information we collect</h3>
      <ul>
        <li><b>Phone number</b> — used to create your account and verify you (via Firebase Authentication).</li>
        <li><b>Profile</b> — name, date of birth, gender, and optional photo you provide.</li>
        <li><b>Contacts &amp; location</b> — only if you grant permission, to help you find friends and set your country code. Contacts are matched on your device and not stored on our servers.</li>
        <li><b>Messages</b> — chats and calls are <b>end-to-end encrypted</b>; our servers store only ciphertext and cannot read them.</li>
      </ul>
      <h3>How we use it</h3>
      <p>Solely to provide the messaging service: authenticate you, deliver messages, and connect calls. We do not sell your data.</p>
      <h3>Third parties</h3>
      <p>We use <b>Google Firebase</b> for phone verification and <b>Google Cloud</b> for hosting. Their handling of data is governed by Google's privacy policy.</p>
      <h3>Data retention &amp; your rights</h3>
      <p>You may request deletion of your account and data at any time by contacting us.</p>`
    )
  )
);

app.get("/terms", (_req, res) =>
  res.type("html").send(
    PAGE(
      "Zapp Chat — Terms of Service",
      `<h1>Terms of Service</h1>
      <p>By using Zapp Chat you agree to use it lawfully and not to abuse, spam, or harm other users.
      The service is provided "as is" without warranty. We may suspend accounts that violate these terms.</p>`
    )
  )
);

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/conversations", conversationsRouter(io));
app.use("/api/calls", callsRoutes);

// Admin panel (page + API). Gated by the ZAPP_ADMIN_KEY env var.
app.get("/admin", (_req, res) => res.type("html").send(ADMIN_PAGE));
app.use("/api/admin", adminRoutes);

registerSockets(io);

server.listen(PORT, () => {
  console.log(`⚡ Zapp server listening on http://localhost:${PORT}`);
});

// Back the SQLite file up to cloud storage so data survives restarts.
startPersistence(db);
