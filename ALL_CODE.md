# Zapp - Complete Source Code

Every source file in the project, collected into one document.
The real files already exist on disk at the paths shown below - you do NOT need to recreate them by hand.

## File index

- server/package.json
- server/smoke-test.js
- server/src/auth.js
- server/src/config.js
- server/src/db.js
- server/src/index.js
- server/src/routes/auth.js
- server/src/routes/conversations.js
- server/src/routes/users.js
- server/src/sockets.js
- server/src/store.js
- app/AGENTS.md
- app/App.tsx
- app/CLAUDE.md
- app/app.json
- app/index.ts
- app/package.json
- app/src/api.ts
- app/src/auth/AuthContext.tsx
- app/src/config.ts
- app/src/screens/ChatScreen.tsx
- app/src/screens/ConversationsScreen.tsx
- app/src/screens/LoginScreen.tsx
- app/src/screens/NewChatScreen.tsx
- app/src/screens/SignupScreen.tsx
- app/src/socket.ts
- app/src/theme.ts
- app/src/types.ts
- app/tsconfig.json
- README.md

---

## server/package.json

```json
{
  "name": "zapp-server",
  "version": "1.0.0",
  "description": "Zapp instant messaging backend (Express + Socket.IO + SQLite)",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "smoke": "node smoke-test.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "socket.io": "^4.8.1"
  },
  "devDependencies": {
    "socket.io-client": "^4.8.1"
  }
}
```

## server/smoke-test.js

```js
// End-to-end smoke test: exercises REST auth + conversation flow and the
// real-time Socket.IO path between two users.
// Run the server first (npm start), then: npm run smoke
import { io as ioClient } from "socket.io-client";

const BASE = process.env.ZAPP_BASE || "http://localhost:4000";
const stamp = Date.now();

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function connect(token) {
  return ioClient(BASE, { auth: { token }, transports: ["websocket"] });
}

async function main() {
  console.log("1) health check");
  const health = await api("/api/health");
  if (!health.ok) throw new Error("health failed");

  console.log("2) sign up alice & bob");
  const alice = await api("/api/auth/signup", {
    method: "POST",
    body: { username: `alice_${stamp}`, password: "secret123", displayName: "Alice" },
  });
  const bob = await api("/api/auth/signup", {
    method: "POST",
    body: { username: `bob_${stamp}`, password: "secret123", displayName: "Bob" },
  });

  console.log("3) alice searches for bob");
  const search = await api(`/api/users?q=bob_${stamp}`, { token: alice.token });
  if (!search.users.find((u) => u.id === bob.user.id)) {
    throw new Error("bob not found in search");
  }

  console.log("4) alice opens a conversation with bob");
  const conv = await api("/api/conversations", {
    method: "POST",
    token: alice.token,
    body: { userId: bob.user.id },
  });
  const convId = conv.conversation.id;

  console.log("5) both connect sockets and join the conversation");
  const aSock = connect(alice.token);
  const bSock = connect(bob.token);
  await Promise.all([once(aSock, "connect"), once(bSock, "connect")]);
  await Promise.all([emitAck(aSock, "conversation:join", convId), emitAck(bSock, "conversation:join", convId)]);

  console.log("6) bob waits for a realtime message; alice sends one");
  const received = once(bSock, "message:new");
  const ack = await emitAck(aSock, "message:send", { conversationId: convId, body: "hello bob ⚡" });
  if (!ack.ok) throw new Error("send failed: " + JSON.stringify(ack));
  const msg = await received;
  if (msg.body !== "hello bob ⚡") throw new Error("received wrong message body");
  console.log("   bob received:", JSON.stringify(msg));

  console.log("7) message persisted & visible via REST history");
  const history = await api(`/api/conversations/${convId}/messages`, { token: bob.token });
  if (!history.messages.find((m) => m.body === "hello bob ⚡")) {
    throw new Error("message not found in history");
  }

  console.log("8) conversation list shows last message");
  const list = await api("/api/conversations", { token: alice.token });
  const c = list.conversations.find((c) => c.id === convId);
  if (!c || c.lastMessage?.body !== "hello bob ⚡") {
    throw new Error("conversation list missing last message");
  }

  aSock.close();
  bSock.close();
  console.log("\n✅ ALL SMOKE TESTS PASSED");
  process.exit(0);
}

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5000);
    socket.once(event, (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5000);
    socket.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

main().catch((err) => {
  console.error("\n❌ SMOKE TEST FAILED:", err.message);
  process.exit(1);
});
```

## server/src/auth.js

```js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { JWT_SECRET, JWT_EXPIRES_IN } from "./config.js";

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware: requires a valid Bearer token, attaches req.user.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

## server/src/config.js

```js
// Central configuration. Override via environment variables in production.
export const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// In production, ALWAYS set ZAPP_JWT_SECRET to a long random value.
export const JWT_SECRET =
  process.env.ZAPP_JWT_SECRET || "dev-only-insecure-secret-change-me";

export const JWT_EXPIRES_IN = "30d";

export const DB_PATH = process.env.ZAPP_DB_PATH || "zapp.db";
```

## server/src/db.js

```js
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./config.js";

// Uses Node's built-in SQLite (node:sqlite) — no native build step required.
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    is_group   INTEGER NOT NULL DEFAULT 0,
    title      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (conversation_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_members_user
    ON conversation_members(user_id);
`);

export default db;
```

## server/src/index.js

```js
import http from "http";
import express from "express";
import cors from "cors";
import { Server as SocketServer } from "socket.io";

import { PORT } from "./config.js";
import "./db.js"; // initialize schema on boot
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import conversationsRouter from "./routes/conversations.js";
import { registerSockets } from "./sockets.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: "*" } });

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "zapp" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/conversations", conversationsRouter(io));

registerSockets(io);

server.listen(PORT, () => {
  console.log(`⚡ Zapp server listening on http://localhost:${PORT}`);
});
```

## server/src/routes/auth.js

```js
import { Router } from "express";
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
} from "../auth.js";
import {
  createUser,
  getUserByUsername,
  getUserById,
  publicUser,
} from "../store.js";

const router = Router();

router.post("/signup", (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  if (String(username).length < 3) {
    return res.status(400).json({ error: "username must be at least 3 characters" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "password must be at least 6 characters" });
  }
  if (getUserByUsername(username)) {
    return res.status(409).json({ error: "username is already taken" });
  }

  const user = createUser({
    username: String(username).trim(),
    displayName: (displayName || username).trim(),
    passwordHash: hashPassword(password),
  });
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  const user = getUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json({ user: publicUser(user) });
});

export default router;
```

## server/src/routes/conversations.js

```js
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

  // GET /api/conversations/:id/messages?before=123
  router.get("/:id/messages", requireAuth, (req, res) => {
    const convId = Number(req.params.id);
    if (!isMember(convId, req.user.id)) {
      return res.status(403).json({ error: "not a member of this conversation" });
    }
    const before = req.query.before ? Number(req.query.before) : undefined;
    res.json({ messages: listMessages(convId, { before }) });
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
```

## server/src/routes/users.js

```js
import { Router } from "express";
import { requireAuth } from "../auth.js";
import { searchUsers } from "../store.js";

const router = Router();

// GET /api/users?q=foo  -> search for people to start a chat with
router.get("/", requireAuth, (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const results = searchUsers(q, req.user.id);
  res.json({ users: results.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
  })) });
});

export default router;
```

## server/src/sockets.js

```js
import { verifyToken } from "./auth.js";
import { isMember, createMessage, getMessageById } from "./store.js";

export function registerSockets(io) {
  // Authenticate every socket connection using the JWT from the handshake.
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("authentication required"));
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error("invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Personal room so we can target a specific user across devices.
    socket.join(`user:${socket.user.id}`);

    // Client asks to join a conversation room (must be a member).
    socket.on("conversation:join", (conversationId, ack) => {
      const convId = Number(conversationId);
      if (!isMember(convId, socket.user.id)) {
        if (typeof ack === "function") ack({ ok: false, error: "forbidden" });
        return;
      }
      socket.join(`conversation:${convId}`);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("conversation:leave", (conversationId) => {
      socket.leave(`conversation:${Number(conversationId)}`);
    });

    // Send a message over the socket (real-time path).
    socket.on("message:send", ({ conversationId, body } = {}, ack) => {
      const convId = Number(conversationId);
      const text = (body || "").toString().trim();
      if (!text) {
        if (typeof ack === "function") ack({ ok: false, error: "empty message" });
        return;
      }
      if (!isMember(convId, socket.user.id)) {
        if (typeof ack === "function") ack({ ok: false, error: "forbidden" });
        return;
      }
      const message = createMessage({
        conversationId: convId,
        senderId: socket.user.id,
        body: text,
      });
      io.to(`conversation:${convId}`).emit("message:new", message);
      if (typeof ack === "function") ack({ ok: true, message });
    });

    // Lightweight typing indicator relayed to the other members.
    socket.on("typing", ({ conversationId, isTyping } = {}) => {
      const convId = Number(conversationId);
      socket.to(`conversation:${convId}`).emit("typing", {
        conversationId: convId,
        userId: socket.user.id,
        isTyping: !!isTyping,
      });
    });
  });
}
```

## server/src/store.js

```js
import db from "./db.js";

// ---- Users ----
export function createUser({ username, displayName, passwordHash }) {
  const info = db
    .prepare(
      "INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)"
    )
    .run(username, displayName, passwordHash);
  return getUserById(Number(info.lastInsertRowid));
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

export function searchUsers(query, excludeUserId) {
  return db
    .prepare(
      `SELECT id, username, display_name
       FROM users
       WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
       ORDER BY display_name
       LIMIT 25`
    )
    .all(excludeUserId, `%${query}%`, `%${query}%`);
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, displayName: user.display_name };
}

// ---- Conversations ----
export function isMember(conversationId, userId) {
  return !!db
    .prepare(
      "SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?"
    )
    .get(conversationId, userId);
}

// Find an existing 1:1 conversation between two users, or create one.
export function findOrCreateDirect(userA, userB) {
  const existing = db
    .prepare(
      `SELECT c.id
       FROM conversations c
       JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
       JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
       WHERE c.is_group = 0
       LIMIT 1`
    )
    .get(userA, userB);
  if (existing) return Number(existing.id);

  db.exec("BEGIN");
  try {
    const info = db
      .prepare("INSERT INTO conversations (is_group) VALUES (0)")
      .run();
    const convId = Number(info.lastInsertRowid);
    const addMember = db.prepare(
      "INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)"
    );
    addMember.run(convId, userA);
    addMember.run(convId, userB);
    db.exec("COMMIT");
    return convId;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getConversationMembers(conversationId) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name
       FROM conversation_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ?`
    )
    .all(conversationId)
    .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name }));
}

// List a user's conversations with the other member + last message preview.
export function listConversations(userId) {
  const rows = db
    .prepare(
      `SELECT c.id, c.is_group, c.title, c.created_at
       FROM conversations c
       JOIN conversation_members m ON m.conversation_id = c.id
       WHERE m.user_id = ?`
    )
    .all(userId);

  return rows
    .map((c) => {
      const members = getConversationMembers(c.id).filter((u) => u.id !== userId);
      const last = db
        .prepare(
          `SELECT m.id, m.body, m.created_at, m.sender_id
           FROM messages m WHERE m.conversation_id = ?
           ORDER BY m.id DESC LIMIT 1`
        )
        .get(c.id);
      return {
        id: c.id,
        isGroup: !!c.is_group,
        title: c.title,
        members,
        lastMessage: last
          ? {
              id: last.id,
              body: last.body,
              createdAt: last.created_at,
              senderId: last.sender_id,
            }
          : null,
      };
    })
    .sort((a, b) => {
      const ta = a.lastMessage?.createdAt || "";
      const tb = b.lastMessage?.createdAt || "";
      return tb.localeCompare(ta);
    });
}

// ---- Messages ----
export function createMessage({ conversationId, senderId, body }) {
  const info = db
    .prepare(
      "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)"
    )
    .run(conversationId, senderId, body);
  return getMessageById(Number(info.lastInsertRowid));
}

export function getMessageById(id) {
  const m = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  return m ? serializeMessage(m) : null;
}

export function listMessages(conversationId, { before, limit = 50 } = {}) {
  const rows = before
    ? db
        .prepare(
          `SELECT * FROM messages WHERE conversation_id = ? AND id < ?
           ORDER BY id DESC LIMIT ?`
        )
        .all(conversationId, before, limit)
    : db
        .prepare(
          `SELECT * FROM messages WHERE conversation_id = ?
           ORDER BY id DESC LIMIT ?`
        )
        .all(conversationId, limit);
  return rows.reverse().map(serializeMessage);
}

function serializeMessage(m) {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
  };
}
```

## app/AGENTS.md

```md
# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.
```

## app/App.tsx

```tsx
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  NavigationContainer,
  DarkTheme,
  Theme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import ConversationsScreen from "./src/screens/ConversationsScreen";
import NewChatScreen from "./src/screens/NewChatScreen";
import ChatScreen from "./src/screens/ChatScreen";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    primary: colors.primary,
    border: colors.border,
  },
};

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {token ? (
        <>
          <Stack.Screen
            name="Conversations"
            component={ConversationsScreen}
            options={{ title: "⚡ Zapp" }}
          />
          <Stack.Screen
            name="NewChat"
            component={NewChatScreen}
            options={{ title: "New chat" }}
          />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </>
      ) : (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Signup"
            component={SignupScreen}
            options={{ title: "Sign up" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="light" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
```

## app/CLAUDE.md

```md
@AGENTS.md
```

## app/app.json

```json
{
  "expo": {
    "name": "app",
    "slug": "app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

## app/index.ts

```ts
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
```

## app/package.json

```json
{
  "name": "app",
  "version": "1.0.0",
  "main": "index.ts",
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-navigation/native": "^7.3.3",
    "@react-navigation/native-stack": "^7.17.5",
    "expo": "~56.0.12",
    "expo-constants": "~56.0.18",
    "expo-status-bar": "~56.0.4",
    "react": "19.2.3",
    "react-native": "0.85.3",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-screens": "4.25.2",
    "socket.io-client": "^4.8.3"
  },
  "devDependencies": {
    "@types/react": "~19.2.2",
    "typescript": "~6.0.3"
  },
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "private": true
}
```

## app/src/api.ts

```ts
import { API_URL } from "./config";
import type { Conversation, Message, User } from "./types";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  signup: (body: { username: string; password: string; displayName?: string }) =>
    request<{ token: string; user: User }>("/api/auth/signup", {
      method: "POST",
      body,
    }),

  login: (body: { username: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body,
    }),

  me: () => request<{ user: User }>("/api/auth/me"),

  searchUsers: (q: string) =>
    request<{ users: User[] }>(`/api/users?q=${encodeURIComponent(q)}`),

  listConversations: () =>
    request<{ conversations: Conversation[] }>("/api/conversations"),

  openConversation: (userId: number) =>
    request<{ conversation: { id: number; members: User[] } }>(
      "/api/conversations",
      { method: "POST", body: { userId } }
    ),

  listMessages: (conversationId: number, before?: number) =>
    request<{ messages: Message[] }>(
      `/api/conversations/${conversationId}/messages` +
        (before ? `?before=${before}` : "")
    ),
};
```

## app/src/auth/AuthContext.tsx

```tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setAuthToken } from "../api";
import { connectSocket, disconnectSocket } from "../socket";
import type { User } from "../types";

const TOKEN_KEY = "zapp.token";
const USER_KEY = "zapp.user";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (
    username: string,
    password: string,
    displayName?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a saved session on launch.
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (savedToken && savedUser) {
          setAuthToken(savedToken);
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          connectSocket(savedToken);
        }
      } catch {
        // ignore restore errors
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(nextToken: string, nextUser: User) {
    setAuthToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    connectSocket(nextToken);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, nextToken],
      [USER_KEY, JSON.stringify(nextUser)],
    ]);
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      login: async (username, password) => {
        const res = await api.login({ username, password });
        await persist(res.token, res.user);
      },
      signup: async (username, password, displayName) => {
        const res = await api.signup({ username, password, displayName });
        await persist(res.token, res.user);
      },
      logout: async () => {
        disconnectSocket();
        setAuthToken(null);
        setToken(null);
        setUser(null);
        await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      },
    }),
    [user, token, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

## app/src/config.ts

```ts
import Constants from "expo-constants";

// The backend port (matches zapp/server config.js).
const SERVER_PORT = 4000;

// In Expo dev, auto-derive the dev machine's LAN IP from the packager host so
// the app works on a physical phone (where "localhost" would be the phone).
// Override anytime by setting EXPO_PUBLIC_API_URL.
function resolveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const hostUri: string =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    "";
  const host = hostUri.split(":")[0];
  if (host) return `http://${host}:${SERVER_PORT}`;
  return `http://localhost:${SERVER_PORT}`;
}

export const API_URL = resolveApiUrl();
```

## app/src/screens/ChatScreen.tsx

```tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "../api";
import { getSocket } from "../socket";
import { useAuth } from "../auth/AuthContext";
import { colors } from "../theme";
import type { Message } from "../types";

export default function ChatScreen({ route, navigation }: any) {
  const { conversationId, title } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || "Chat" });
  }, [navigation, title]);

  // Load history + join the room + subscribe to live messages.
  useEffect(() => {
    let active = true;
    const socket = getSocket();

    (async () => {
      try {
        const res = await api.listMessages(conversationId);
        if (active) setMessages(res.messages);
      } catch {
        // ignore
      }
    })();

    socket?.emit("conversation:join", conversationId);

    const onNew = (msg: Message) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
    };
    const onTyping = (p: {
      conversationId: number;
      userId: number;
      isTyping: boolean;
    }) => {
      if (p.conversationId === conversationId && p.userId !== user?.id) {
        setPeerTyping(p.isTyping);
      }
    };

    socket?.on("message:new", onNew);
    socket?.on("typing", onTyping);

    return () => {
      active = false;
      socket?.emit("conversation:leave", conversationId);
      socket?.off("message:new", onNew);
      socket?.off("typing", onTyping);
    };
  }, [conversationId, user?.id]);

  function send() {
    const body = text.trim();
    if (!body) return;
    const socket = getSocket();
    socket?.emit("message:send", { conversationId, body });
    socket?.emit("typing", { conversationId, isTyping: false });
    setText("");
  }

  function onChangeText(v: string) {
    setText(v);
    const socket = getSocket();
    socket?.emit("typing", { conversationId, isTyping: true });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket?.emit("typing", { conversationId, isTyping: false });
    }, 1500);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View
              style={[
                styles.bubbleRow,
                mine ? styles.rowMine : styles.rowTheirs,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
              >
                <Text style={styles.bubbleText}>{item.body}</Text>
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
      />

      {peerTyping ? <Text style={styles.typing}>typing…</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={onChangeText}
          multiline
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim()}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function formatTime(iso: string) {
  // server stores "YYYY-MM-DD HH:MM:SS" in UTC
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: 12, paddingBottom: 4 },
  bubbleRow: { marginVertical: 3, flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: colors.bubbleMine, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: colors.bubbleTheirs,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: colors.text, fontSize: 16 },
  time: {
    color: colors.textMuted,
    fontSize: 11,
    alignSelf: "flex-end",
    marginTop: 2,
  },
  typing: {
    color: colors.textMuted,
    fontStyle: "italic",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontSize: 18 },
});
```

## app/src/screens/ConversationsScreen.tsx

```tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { getSocket } from "../socket";
import { useAuth } from "../auth/AuthContext";
import { colors } from "../theme";
import type { Conversation, Message } from "../types";

export default function ConversationsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listConversations();
      setConversations(res.conversations);
    } catch {
      // ignore; pull-to-refresh will retry
    }
  }, []);

  // Reload whenever the screen regains focus (e.g. returning from a chat).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live-update the list ordering/preview when any message arrives.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = (_msg: Message) => load();
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [load]);

  // Header buttons
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("NewChat")}
          style={styles.headerBtn}
        >
          <Text style={styles.headerBtnText}>＋</Text>
        </TouchableOpacity>
      ),
      headerLeft: () => (
        <TouchableOpacity onPress={logout} style={styles.headerBtn}>
          <Text style={styles.logout}>Logout</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, logout]);

  function titleFor(c: Conversation) {
    if (c.title) return c.title;
    const others = c.members.filter((m) => m.id !== user?.id);
    return others.map((o) => o.displayName).join(", ") || "Conversation";
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => String(c.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.textMuted}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No conversations yet.</Text>
            <Text style={styles.emptySub}>Tap ＋ to start chatting.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = titleFor(item);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate("Chat", {
                  conversationId: item.id,
                  title: name,
                })
              }
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.lastMessage
                    ? (item.lastMessage.senderId === user?.id ? "You: " : "") +
                      item.lastMessage.body
                    : "No messages yet"}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  rowPreview: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyText: { color: colors.text, fontSize: 16 },
  emptySub: { color: colors.textMuted, marginTop: 6 },
  headerBtn: { paddingHorizontal: 14 },
  headerBtnText: { color: colors.primary, fontSize: 26, fontWeight: "700" },
  logout: { color: colors.primary, fontSize: 15 },
});
```

## app/src/screens/LoginScreen.tsx

```tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { colors } from "../theme";

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>⚡ Zapp</Text>
        <Text style={styles.subtitle}>Sign in to keep chatting</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log in</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
          <Text style={styles.link}>No account? Create one</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: "center", padding: 24 },
  logo: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 28,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: colors.primary, textAlign: "center", marginTop: 18 },
  error: { color: colors.danger, marginBottom: 8, textAlign: "center" },
});
```

## app/src/screens/NewChatScreen.tsx

```tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { api } from "../api";
import { colors } from "../theme";
import type { User } from "../types";

export default function NewChatScreen({ navigation }: any) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search as the user types.
  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchUsers(query.trim());
        if (active) setResults(res.users);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  async function startChat(u: User) {
    try {
      const res = await api.openConversation(u.id);
      navigation.replace("Chat", {
        conversationId: res.conversation.id,
        title: u.displayName,
      });
    } catch (e: any) {
      // surface minimally
      alert(e.message || "Could not start chat");
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search people by name or username"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoFocus
        value={query}
        onChangeText={setQuery}
      />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => String(u.id)}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query ? "No matching users." : "Type to search for people."}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => startChat(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.username}>@{item.username}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  username: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 30 },
});
```

## app/src/screens/SignupScreen.tsx

```tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { colors } from "../theme";

export default function SignupScreen({ navigation }: any) {
  const { signup } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await signup(username.trim(), password, displayName.trim() || undefined);
    } catch (e: any) {
      setError(e.message || "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>⚡ Create account</Text>

        <TextInput
          style={styles.input}
          placeholder="Display name (optional)"
          placeholderTextColor={colors.textMuted}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          style={styles.input}
          placeholder="Username (min 3 chars)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 6 chars)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: "center", padding: 24 },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 28,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: colors.primary, textAlign: "center", marginTop: 18 },
  error: { color: colors.danger, marginBottom: 8, textAlign: "center" },
});
```

## app/src/socket.ts

```ts
import { io, Socket } from "socket.io-client";
import { API_URL } from "./config";

let socket: Socket | null = null;

// Connect (or reuse) a single authenticated socket for the logged-in user.
export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(API_URL, {
    auth: { token },
    transports: ["websocket"],
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

## app/src/theme.ts

```ts
// Simple shared palette for the Zapp UI.
export const colors = {
  bg: "#0e1621",
  surface: "#17212b",
  surfaceAlt: "#1d2b3a",
  primary: "#2ea6ff",
  primaryDark: "#1c8adb",
  bubbleMine: "#2b5278",
  bubbleTheirs: "#1d2b3a",
  text: "#ffffff",
  textMuted: "#7f91a4",
  border: "#22303c",
  danger: "#e5484d",
};
```

## app/src/types.ts

```ts
export type User = {
  id: number;
  username: string;
  displayName: string;
};

export type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
};

export type Conversation = {
  id: number;
  isGroup: boolean;
  title: string | null;
  members: User[];
  lastMessage: {
    id: number;
    body: string;
    createdAt: string;
    senderId: number;
  } | null;
};
```

## app/tsconfig.json

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```

## README.md

```md
# ⚡ Zapp

A full-stack instant-messaging app: an **Expo / React Native** mobile client backed by a
**Node + Express + Socket.IO** server with **SQLite** storage and **JWT** accounts.

```
zapp/
├── server/   Express REST API + Socket.IO realtime + SQLite
└── app/      Expo (React Native, TypeScript) mobile client
```

## Features

- Username/password **sign up & login** (bcrypt-hashed, JWT sessions persisted on device)
- **1:1 conversations** — search for a user and start chatting
- **Real-time messaging** over WebSockets (Socket.IO), with REST history fallback
- **Typing indicators** and live conversation-list previews
- Messages **persisted** in SQLite and re-loaded on reconnect

## Prerequisites

- Node.js 22+ (uses the built-in `node:sqlite` — no native build step)
- The [Expo Go](https://expo.dev/go) app on your phone, or an Android/iOS emulator

## 1. Run the server

```bash
cd server
npm install
npm start          # listens on http://localhost:4000
```

Optional smoke test (server must be running) — signs up two users and verifies a
realtime round-trip:

```bash
npm run smoke
```

Configuration via env vars (all optional): `PORT`, `ZAPP_JWT_SECRET`, `ZAPP_DB_PATH`.
**Set `ZAPP_JWT_SECRET` to a long random value in production.**

## 2. Run the app

```bash
cd app
npm install
npm start          # opens Expo; scan the QR code with Expo Go
```

The app auto-detects your dev machine's LAN IP from the Expo packager, so on a
physical phone it reaches the server at `http://<your-pc-ip>:4000` automatically.
Your phone and PC must be on the same Wi-Fi network. To override the backend URL:

```bash
# app/.env or shell
EXPO_PUBLIC_API_URL=http://192.168.1.50:4000
```

## Try it

1. Start the server, then the app.
2. Sign up as **two** different users (use two devices/emulators, or sign up on one,
   log out, and sign up again on another).
3. From user A, tap **＋**, search for user B, and send a message — it appears on
   B's device instantly.

## API overview

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/auth/signup` | Create account → `{ token, user }` |
| POST | `/api/auth/login` | Log in → `{ token, user }` |
| GET | `/api/auth/me` | Current user (auth) |
| GET | `/api/users?q=` | Search users (auth) |
| GET | `/api/conversations` | List my conversations (auth) |
| POST | `/api/conversations` | Find/create a 1:1 chat `{ userId }` (auth) |
| GET | `/api/conversations/:id/messages` | Message history (auth) |
| POST | `/api/conversations/:id/messages` | Send via REST (auth) |

**Socket.IO events** (JWT passed in the handshake `auth.token`):
`conversation:join` / `conversation:leave`, `message:send` (→ broadcasts `message:new`),
and `typing`.
```

