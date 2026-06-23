// End-to-end smoke test: exercises the phone/OTP auth + profile flow and the
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

async function onboard(phone, firstName, lastName) {
  const req = await api("/api/auth/request-otp", { method: "POST", body: { phone } });
  if (!req.devCode) throw new Error("no devCode returned (is NODE_ENV=production?)");
  const verify = await api("/api/auth/verify-otp", {
    method: "POST",
    body: { phone, code: req.devCode },
  });
  if (verify.profileComplete) throw new Error("new user should not be complete");
  const prof = await api("/api/auth/profile", {
    method: "PATCH",
    token: verify.token,
    body: {
      firstName,
      lastName,
      gender: "female",
      dateOfBirth: "1995-05-20",
      email: null,
    },
  });
  return { token: verify.token, user: prof.user };
}

async function main() {
  console.log("1) health check");
  if (!(await api("/api/health")).ok) throw new Error("health failed");

  console.log("2) onboard alice & bob via phone/OTP + profile");
  const alice = await onboard(`+1555${stamp % 1000000}`, "Alice", "Smith");
  const bob = await onboard(`+1666${stamp % 1000000}`, "Bob", "Jones");
  if (alice.user.displayName !== "Alice Smith") throw new Error("displayName wrong");
  if (!alice.user.profileComplete) throw new Error("alice should be complete");

  console.log("3) alice searches for bob by name");
  const search = await api(`/api/users?q=Bob`, { token: alice.token });
  if (!search.users.find((u) => u.id === bob.user.id)) throw new Error("bob not found");

  console.log("4) alice opens a conversation with bob");
  const conv = await api("/api/conversations", {
    method: "POST",
    token: alice.token,
    body: { userId: bob.user.id },
  });
  const convId = conv.conversation.id;

  console.log("5) realtime message round-trip");
  const aSock = connect(alice.token);
  const bSock = connect(bob.token);
  await Promise.all([once(aSock, "connect"), once(bSock, "connect")]);
  await Promise.all([
    emitAck(aSock, "conversation:join", convId),
    emitAck(bSock, "conversation:join", convId),
  ]);
  const received = once(bSock, "message:new");
  const ack = await emitAck(aSock, "message:send", { conversationId: convId, body: "hi bob ⚡" });
  if (!ack.ok) throw new Error("send failed");
  const msg = await received;
  if (msg.body !== "hi bob ⚡") throw new Error("wrong message body");

  console.log("6) re-login existing user returns profileComplete=true");
  const req = await api("/api/auth/request-otp", { method: "POST", body: { phone: alice.user.phone } });
  const verify = await api("/api/auth/verify-otp", { method: "POST", body: { phone: alice.user.phone, code: req.devCode } });
  if (!verify.profileComplete) throw new Error("returning user should be complete");

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
