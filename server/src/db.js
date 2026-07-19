import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./config.js";

// Uses Node's built-in SQLite (node:sqlite) — no native build step required.
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone         TEXT NOT NULL UNIQUE,
    first_name    TEXT,
    last_name     TEXT,
    email         TEXT,
    date_of_birth TEXT,
    gender        TEXT,
    avatar        TEXT,
    public_key    TEXT,                                  -- E2EE identity public key (base64)
    profile_complete INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One-time passwords for phone verification.
  CREATE TABLE IF NOT EXISTS otps (
    phone      TEXT PRIMARY KEY,
    code       TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS calls (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media      TEXT NOT NULL DEFAULT 'audio',          -- 'audio' | 'video'
    status     TEXT NOT NULL DEFAULT 'missed',         -- missed|answered|declined|canceled|ended
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at   TEXT,
    duration   INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_calls_users ON calls(caller_id, callee_id, id);

  -- User blocks (blocker no longer receives messages/calls from blocked).
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (blocker_id, blocked_id)
  );

  -- Abuse reports (stored for review; no automated action).
  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- "Delete for me": per-user hidden messages (the row itself stays).
  CREATE TABLE IF NOT EXISTS hidden_messages (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, message_id)
  );

  -- FCM device tokens for push notifications (a user may have several devices).
  CREATE TABLE IF NOT EXISTS push_tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform   TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_members_user
    ON conversation_members(user_id);
`);

// Migrations: add columns to databases created before these features existed.
const msgCols = db.prepare("PRAGMA table_info(messages)").all();
if (!msgCols.some((c) => c.name === "edited_at")) {
  db.exec("ALTER TABLE messages ADD COLUMN edited_at TEXT");
}
const userCols = db.prepare("PRAGMA table_info(users)").all();
if (!userCols.some((c) => c.name === "public_key")) {
  db.exec("ALTER TABLE users ADD COLUMN public_key TEXT");
}
if (!userCols.some((c) => c.name === "bio")) {
  db.exec("ALTER TABLE users ADD COLUMN bio TEXT");
}
if (!userCols.some((c) => c.name === "banned")) {
  db.exec("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
}

export default db;
