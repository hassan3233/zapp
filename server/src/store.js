import db from "./db.js";

// ---- OTP ----
export function saveOtp(phone, code, expiresAt) {
  db.prepare(
    `INSERT INTO otps (phone, code, expires_at, attempts)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(phone) DO UPDATE SET
       code = excluded.code,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = datetime('now')`
  ).run(phone, code, expiresAt);
}

export function getOtp(phone) {
  return db.prepare("SELECT * FROM otps WHERE phone = ?").get(phone);
}

export function bumpOtpAttempts(phone) {
  db.prepare("UPDATE otps SET attempts = attempts + 1 WHERE phone = ?").run(phone);
}

export function clearOtp(phone) {
  db.prepare("DELETE FROM otps WHERE phone = ?").run(phone);
}

// ---- Users ----
export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserByPhone(phone) {
  return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
}

// Find a user by phone or create a bare (profile-incomplete) account.
export function findOrCreateByPhone(phone) {
  const existing = getUserByPhone(phone);
  if (existing) return existing;
  const info = db
    .prepare("INSERT INTO users (phone, profile_complete) VALUES (?, 0)")
    .run(phone);
  return getUserById(Number(info.lastInsertRowid));
}

export function updateProfile(id, { firstName, lastName, email, dateOfBirth, gender, avatar }) {
  db.prepare(
    `UPDATE users SET
       first_name = ?,
       last_name = ?,
       email = ?,
       date_of_birth = ?,
       gender = ?,
       avatar = ?,
       profile_complete = 1
     WHERE id = ?`
  ).run(
    firstName ?? null,
    lastName ?? null,
    email ?? null,
    dateOfBirth ?? null,
    gender ?? null,
    avatar ?? null,
    id
  );
  return getUserById(id);
}

export function searchUsers(query, excludeUserId) {
  const like = `%${query}%`;
  return db
    .prepare(
      `SELECT * FROM users
       WHERE id != ? AND profile_complete = 1
         AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
              OR (first_name || ' ' || last_name) LIKE ?)
       ORDER BY first_name
       LIMIT 25`
    )
    .all(excludeUserId, like, like, like, like);
}

// Shape sent to clients — never leak nothing sensitive (no password exists anymore).
export function publicUser(user) {
  if (!user) return null;
  const first = user.first_name || "";
  const last = user.last_name || "";
  const displayName = `${first} ${last}`.trim() || user.phone;
  return {
    id: user.id,
    phone: user.phone,
    firstName: user.first_name,
    lastName: user.last_name,
    displayName,
    email: user.email,
    dateOfBirth: user.date_of_birth,
    gender: user.gender,
    avatar: user.avatar,
    publicKey: user.public_key || null,
    profileComplete: !!user.profile_complete,
  };
}

// Store a user's E2EE identity public key (base64).
export function setPublicKey(id, publicKey) {
  db.prepare("UPDATE users SET public_key = ? WHERE id = ?").run(
    publicKey ? String(publicKey) : null,
    id
  );
  return getUserById(id);
}

// ---- Push tokens ----
export function savePushToken(userId, token, platform) {
  db.prepare(
    `INSERT INTO push_tokens (token, user_id, platform, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(token) DO UPDATE SET
       user_id = excluded.user_id,
       platform = excluded.platform,
       updated_at = datetime('now')`
  ).run(token, userId, platform ?? null);
}

export function deletePushToken(token) {
  db.prepare("DELETE FROM push_tokens WHERE token = ?").run(token);
}

// All device tokens for a set of users (used to fan out a notification).
export function getPushTokensForUsers(userIds) {
  if (!userIds.length) return [];
  const placeholders = userIds.map(() => "?").join(",");
  return db
    .prepare(`SELECT token, user_id FROM push_tokens WHERE user_id IN (${placeholders})`)
    .all(...userIds);
}

// ---- Conversations ----
export function getConversation(conversationId) {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId);
}

export function getConversationMemberIds(conversationId) {
  return db
    .prepare("SELECT user_id FROM conversation_members WHERE conversation_id = ?")
    .all(conversationId)
    .map((r) => r.user_id);
}

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

// Create a group conversation with a title and a set of member ids (creator included).
export function createGroup(creatorId, title, memberIds) {
  const ids = Array.from(new Set([creatorId, ...memberIds.map(Number)]));
  db.exec("BEGIN");
  try {
    const info = db
      .prepare("INSERT INTO conversations (is_group, title) VALUES (1, ?)")
      .run(title);
    const convId = Number(info.lastInsertRowid);
    const addMember = db.prepare(
      "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)"
    );
    for (const uid of ids) addMember.run(convId, uid);
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
      `SELECT u.* FROM conversation_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ?`
    )
    .all(conversationId)
    .map(publicUser);
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

// ---- Calls ----
export function createCall({ callerId, calleeId, media }) {
  const info = db
    .prepare(
      "INSERT INTO calls (caller_id, callee_id, media, status) VALUES (?, ?, ?, 'missed')"
    )
    .run(callerId, calleeId, media || "audio");
  return getCallById(Number(info.lastInsertRowid));
}

export function getCallById(id) {
  const c = db.prepare("SELECT * FROM calls WHERE id = ?").get(id);
  return c ? serializeCall(c) : null;
}

export function finishCall(id, status, durationSec) {
  db.prepare(
    "UPDATE calls SET status = ?, ended_at = datetime('now'), duration = ? WHERE id = ?"
  ).run(status, durationSec ?? null, id);
  return getCallById(id);
}

export function listCalls(userId) {
  const rows = db
    .prepare(
      `SELECT * FROM calls WHERE caller_id = ? OR callee_id = ?
       ORDER BY id DESC LIMIT 100`
    )
    .all(userId, userId);
  return rows.map((c) => {
    const otherId = c.caller_id === userId ? c.callee_id : c.caller_id;
    const other = publicUser(getUserById(otherId));
    return { ...serializeCall(c), outgoing: c.caller_id === userId, other };
  });
}

function serializeCall(c) {
  return {
    id: c.id,
    callerId: c.caller_id,
    calleeId: c.callee_id,
    media: c.media,
    status: c.status,
    startedAt: c.started_at,
    endedAt: c.ended_at,
    duration: c.duration,
  };
}
