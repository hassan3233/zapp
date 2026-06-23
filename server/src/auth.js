import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "./config.js";

export function signToken(user) {
  return jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Generate a 6-digit one-time code.
export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Normalize a phone number to digits (keep a leading +).
export function normalizePhone(raw) {
  const s = String(raw || "").trim();
  const plus = s.startsWith("+") ? "+" : "";
  return plus + s.replace(/[^0-9]/g, "");
}

// Deliver the OTP over `channel` ("sms" = text message, "call" = voice call).
// In production, wire a real provider here (e.g. Twilio). Until then, set
// ZAPP_RETURN_OTP=1 so the API returns the code and the app shows it on-screen —
// this keeps login working without an SMS/voice gateway.
export function sendOtp(phone, code, channel = "sms") {
  const isProd = process.env.NODE_ENV === "production";
  const alwaysReturn = process.env.ZAPP_RETURN_OTP === "1";
  const via = channel === "call" ? "CALL" : "SMS";
  console.log(`[${via}] -> ${phone}: your Zapp code is ${code}`);
  // Example Twilio wiring (uncomment + configure once you have a provider):
  //   if (channel === "call") {
  //     await twilio.calls.create({ to: phone, from: FROM,
  //       twiml: `<Response><Say>Your Zapp code is ${code.split("").join(", ")}</Say></Response>` });
  //   } else {
  //     await twilio.messages.create({ to: phone, from: FROM, body: `Zapp code: ${code}` });
  //   }
  return { devCode: !isProd || alwaysReturn ? code : undefined };
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
