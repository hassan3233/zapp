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

export function updateProfile(id, { firstName, lastName, email, dateOfBirth, gender, avatar, bio }) {
  db.prepare(
    `UPDATE users SET
       first_name = ?,
       last_name = ?,
       email = ?,
       date_of_birth = ?,
       gender = ?,
       avatar = ?,
       bio = ?,
       profile_complete = 1
     WHERE id = ?`
  ).run(
    firstName ?? null,
    lastName ?? null,
    email ?? null,
    dateOfBirth ?? null,
    gender ?? null,
    avatar ?? null,
    bio ?? null,
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
    bio: user.bio || null,
    publicKey: user.public_key || null,
    profileComplete: !!user.profile_complete,
  };
}

// ---- Blocks & reports ----
export function blockUser(blockerId, blockedId) {
  db.prepare(
    "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)"
  ).run(blockerId, blockedId);
}

export function unblockUser(blockerId, blockedId) {
  db.prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?").run(
    blockerId,
    blockedId
  );
}

export function hasBlocked(blockerId, blockedId) {
  return !!db
    .prepare("SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
    .get(blockerId, blockedId);
}

// True when either user has blocked the other (messages/calls stop both ways).
export function isBlockedEither(a, b) {
  return !!db
    .prepare(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`
    )
    .get(a, b, b, a);
}

export function createReport(reporterId, reportedId, reason) {
  db.prepare(
    "INSERT INTO reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)"
  ).run(reporterId, reportedId, reason ?? null);
}

// ---- Admin ----
export function adminStats() {
  const count = (sql) => Number(db.prepare(sql).get().n);
  return {
    users: count("SELECT COUNT(*) n FROM users"),
    messages: count("SELECT COUNT(*) n FROM messages"),
    conversations: count("SELECT COUNT(*) n FROM conversations"),
    calls: count("SELECT COUNT(*) n FROM calls"),
    reports: count("SELECT COUNT(*) n FROM reports"),
    blocks: count("SELECT COUNT(*) n FROM blocks"),
    banned: count("SELECT COUNT(*) n FROM users WHERE banned = 1"),
  };
}

export function adminListUsers(q, limit = 100) {
  const like = `%${q || ""}%`;
  return db
    .prepare(
      `SELECT u.id, u.phone, u.first_name, u.last_name, u.created_at, u.banned,
              u.profile_complete,
              (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) AS message_count,
              (SELECT COUNT(*) FROM reports r WHERE r.reported_id = u.id) AS report_count
       FROM users u
       WHERE u.phone LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?
       ORDER BY u.id DESC LIMIT ?`
    )
    .all(like, like, like, limit)
    .map((u) => ({
      id: u.id,
      phone: u.phone,
      name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || null,
      createdAt: u.created_at,
      banned: !!u.banned,
      profileComplete: !!u.profile_complete,
      messages: Number(u.message_count),
      reports: Number(u.report_count),
    }));
}

export function setBanned(userId, banned) {
  db.prepare("UPDATE users SET banned = ? WHERE id = ?").run(banned ? 1 : 0, userId);
  return getUserById(userId);
}

// Deletes the user; FK cascades remove their memberships, messages, calls,
// push tokens, blocks and reports.
export function deleteUser(userId) {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function adminListReports(limit = 100) {
  return db
    .prepare(
      `SELECT r.id, r.reason, r.created_at,
              r.reporter_id, ru.first_name AS rep_first, ru.last_name AS rep_last, ru.phone AS rep_phone,
              r.reported_id, tu.first_name AS tgt_first, tu.last_name AS tgt_last, tu.phone AS tgt_phone
       FROM reports r
       LEFT JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN users tu ON tu.id = r.reported_id
       ORDER BY r.id DESC LIMIT ?`
    )
    .all(limit)
    .map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.created_at,
      reporter: {
        id: r.reporter_id,
        name: `${r.rep_first || ""} ${r.rep_last || ""}`.trim() || r.rep_phone || "(deleted)",
      },
      reported: {
        id: r.reported_id,
        name: `${r.tgt_first || ""} ${r.tgt_last || ""}`.trim() || r.tgt_phone || "(deleted)",
      },
    }));
}

export function deleteReport(id) {
  db.prepare("DELETE FROM reports WHERE id = ?").run(id);
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
export function createMessage({ conversationId, senderId, body, replyTo }) {
  const info = db
    .prepare(
      "INSERT INTO messages (conversation_id, sender_id, body, reply_to) VALUES (?, ?, ?, ?)"
    )
    .run(conversationId, senderId, body, replyTo ?? null);
  return getMessageById(Number(info.lastInsertRowid));
}

export function getMessageById(id) {
  const m = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
  return m ? serializeMessage(m) : null;
}

export function listMessages(conversationId, { before, limit = 50, forUserId } = {}) {
  // forUserId filters out messages that user deleted "for me".
  const hidden = forUserId
    ? " AND id NOT IN (SELECT message_id FROM hidden_messages WHERE user_id = ?)"
    : "";
  const rows = before
    ? db
        .prepare(
          `SELECT * FROM messages WHERE conversation_id = ? AND id < ?${hidden}
           ORDER BY id DESC LIMIT ?`
        )
        .all(...(forUserId ? [conversationId, before, forUserId, limit] : [conversationId, before, limit]))
    : db
        .prepare(
          `SELECT * FROM messages WHERE conversation_id = ?${hidden}
           ORDER BY id DESC LIMIT ?`
        )
        .all(...(forUserId ? [conversationId, forUserId, limit] : [conversationId, limit]));
  return rows.reverse().map(serializeMessage);
}

// "Delete for everyone" — removes the row entirely.
export function deleteMessage(messageId) {
  db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
}

// "Delete for me" — hides the message for one user only.
export function hideMessage(userId, messageId) {
  db.prepare(
    "INSERT OR IGNORE INTO hidden_messages (user_id, message_id) VALUES (?, ?)"
  ).run(userId, messageId);
}

// ---- Reactions ----
// Toggle: same emoji again removes it; a different emoji replaces it.
// Returns the message's current reactions.
export function setReaction(messageId, userId, emoji) {
  const existing = db
    .prepare("SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?")
    .get(messageId, userId);
  if (existing && existing.emoji === emoji) {
    db.prepare("DELETE FROM reactions WHERE message_id = ? AND user_id = ?").run(
      messageId,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji`
    ).run(messageId, userId, emoji);
  }
  return getReactionsForMessage(messageId);
}

export function getReactionsForMessage(messageId) {
  return db
    .prepare("SELECT user_id, emoji FROM reactions WHERE message_id = ?")
    .all(messageId)
    .map((r) => ({ userId: r.user_id, emoji: r.emoji }));
}

// Attach reactions to a list of serialized messages in one query.
export function attachReactions(messages) {
  if (!messages.length) return messages;
  const ids = messages.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN (${placeholders})`
    )
    .all(...ids);
  const byMsg = new Map();
  for (const r of rows) {
    if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, []);
    byMsg.get(r.message_id).push({ userId: r.user_id, emoji: r.emoji });
  }
  for (const m of messages) m.reactions = byMsg.get(m.id) || [];
  return messages;
}

// ---- Starred (personal) ----
export function setStar(userId, messageId, on) {
  if (on) {
    db.prepare(
      "INSERT OR IGNORE INTO starred_messages (user_id, message_id) VALUES (?, ?)"
    ).run(userId, messageId);
  } else {
    db.prepare(
      "DELETE FROM starred_messages WHERE user_id = ? AND message_id = ?"
    ).run(userId, messageId);
  }
}

// Mark each serialized message with whether the given user starred it.
export function attachStarred(messages, userId) {
  if (!messages.length) return messages;
  const ids = messages.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  const starred = new Set(
    db
      .prepare(
        `SELECT message_id FROM starred_messages WHERE user_id = ? AND message_id IN (${placeholders})`
      )
      .all(userId, ...ids)
      .map((r) => r.message_id)
  );
  for (const m of messages) m.starred = starred.has(m.id);
  return messages;
}

export function getStarredMessages(userId, conversationId) {
  const rows = db
    .prepare(
      `SELECT m.* FROM starred_messages s
       JOIN messages m ON m.id = s.message_id
       WHERE s.user_id = ? AND m.conversation_id = ?
       ORDER BY m.id DESC`
    )
    .all(userId, conversationId);
  return rows.map(serializeMessage).map((m) => ({ ...m, starred: true }));
}

// ---- Pinned (shared per conversation) ----
export function setPinned(conversationId, messageId) {
  db.prepare("UPDATE conversations SET pinned_message_id = ? WHERE id = ?").run(
    messageId ?? null,
    conversationId
  );
}

export function getPinnedMessage(conversationId) {
  const conv = db
    .prepare("SELECT pinned_message_id FROM conversations WHERE id = ?")
    .get(conversationId);
  if (!conv?.pinned_message_id) return null;
  return getMessageById(conv.pinned_message_id);
}

// Edit a message's body (the client sends it already E2EE-encrypted).
export function editMessage(messageId, body) {
  db.prepare(
    "UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?"
  ).run(body, messageId);
  return getMessageById(messageId);
}

function serializeMessage(m) {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
    editedAt: m.edited_at || null,
    replyTo: m.reply_to || null,
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

// The call that is still ringing for this user: created moments ago and never
// finished. Lets us re-ring a callee whose socket had dropped (locked phone) —
// the push wakes the app, and on reconnect we replay the invite so they can
// still answer instead of the call silently never arriving.
export function getPendingIncomingCall(calleeId, withinSec = 60) {
  const c = db
    .prepare(
      `SELECT * FROM calls
        WHERE callee_id = ? AND ended_at IS NULL
          AND started_at > datetime('now', ?)
        ORDER BY id DESC LIMIT 1`
    )
    .get(Number(calleeId), `-${Number(withinSec)} seconds`);
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
