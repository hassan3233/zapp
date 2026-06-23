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

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_members_user
    ON conversation_members(user_id);
`);

// Migration: add users.public_key to databases created before E2EE existed.
const userCols = db.prepare("PRAGMA table_info(users)").all();
if (!userCols.some((c) => c.name === "public_key")) {
  db.exec("ALTER TABLE users ADD COLUMN public_key TEXT");
}

export default db;
