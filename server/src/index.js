import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketServer } from "socket.io";

import { PORT } from "./config.js";
import "./db.js"; // initialize schema on boot
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import conversationsRouter from "./routes/conversations.js";
import callsRoutes from "./routes/calls.js";
import { registerSockets } from "./sockets.js";

const app = express();
app.use(cors());
// Larger limit so base64 profile pictures fit in the request body.
app.use(express.json({ limit: "8mb" }));

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: "*" } });

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "zapp" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/conversations", conversationsRouter(io));
app.use("/api/calls", callsRoutes);

registerSockets(io);

server.listen(PORT, () => {
  console.log(`⚡ Zapp server listening on http://localhost:${PORT}`);
});
