import { Router } from "express";
import {
  signToken,
  requireAuth,
  generateOtpCode,
  normalizePhone,
  sendOtp,
} from "../auth.js";
import {
  saveOtp,
  getOtp,
  bumpOtpAttempts,
  clearOtp,
  getUserById,
  findOrCreateByPhone,
  updateProfile,
  setPublicKey,
  publicUser,
} from "../store.js";
import { verifyFirebaseIdToken } from "../firebase.js";

const router = Router();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

// Step 1: user enters a phone number -> we generate & "send" a code.
router.post("/request-otp", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (phone.replace("+", "").length < 6) {
    return res.status(400).json({ error: "enter a valid phone number" });
  }
  const channel = req.body?.channel === "call" ? "call" : "sms";
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  saveOtp(phone, code, expiresAt);
  const { devCode } = await sendOtp(phone, code, channel);
  res.json({ sent: true, phone, channel, devCode }); // devCode is undefined once an SMS gateway is set
});

// Firebase phone auth: the app signs in with Firebase (which sends the SMS),
// then posts the resulting ID token here. We verify it and issue our own JWT.
router.post("/firebase", async (req, res) => {
  const idToken = (req.body?.idToken || "").toString();
  if (!idToken) return res.status(400).json({ error: "idToken is required" });
  try {
    const decoded = await verifyFirebaseIdToken(idToken);
    const phone = normalizePhone(decoded.phone_number || "");
    if (phone.replace("+", "").length < 6) {
      return res.status(400).json({ error: "token has no phone number" });
    }
    const user = findOrCreateByPhone(phone);
    const token = signToken(user);
    const pub = publicUser(user);
    res.json({ token, user: pub, profileComplete: pub.profileComplete });
  } catch (e) {
    console.error("[firebase] verify failed:", e?.message);
    res.status(401).json({ error: "invalid Firebase token" });
  }
});

// Step 2: user enters the SMS code -> verify, create/find account, issue token.
router.post("/verify-otp", (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();
  const record = getOtp(phone);
  if (!record) {
    return res.status(400).json({ error: "request a code first" });
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    clearOtp(phone);
    return res.status(429).json({ error: "too many attempts, request a new code" });
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    clearOtp(phone);
    return res.status(400).json({ error: "code expired, request a new one" });
  }
  if (record.code !== code) {
    bumpOtpAttempts(phone);
    return res.status(401).json({ error: "incorrect code" });
  }

  clearOtp(phone);
  const user = findOrCreateByPhone(phone);
  const token = signToken(user);
  const pub = publicUser(user);
  res.json({ token, user: pub, profileComplete: pub.profileComplete });
});

// Step 3+: complete/update the profile (name, dob, gender, avatar, optional email).
router.patch("/profile", requireAuth, (req, res) => {
  const { firstName, lastName, email, dateOfBirth, gender, avatar, bio } = req.body || {};
  if (!firstName || !String(firstName).trim()) {
    return res.status(400).json({ error: "first name is required" });
  }
  if (gender && !["male", "female"].includes(gender)) {
    return res.status(400).json({ error: "gender must be male or female" });
  }
  const user = updateProfile(req.user.id, {
    firstName: String(firstName).trim(),
    lastName: lastName ? String(lastName).trim() : null,
    email: email ? String(email).trim() : null,
    dateOfBirth: dateOfBirth || null,
    gender: gender || null,
    avatar: avatar || null,
    bio: bio ? String(bio).trim().slice(0, 300) : null,
  });
  res.json({ user: publicUser(user) });
});

// Upload the caller's E2EE identity public key (base64).
router.post("/public-key", requireAuth, (req, res) => {
  const publicKey = (req.body?.publicKey || "").toString().trim();
  if (!publicKey) return res.status(400).json({ error: "publicKey is required" });
  const user = setPublicKey(req.user.id, publicKey);
  res.json({ user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "user not found" });
  res.json({ user: publicUser(user) });
});

export default router;
