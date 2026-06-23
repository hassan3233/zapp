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
