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

// Deliver the OTP over `channel` ("sms" | "call"). If Twilio credentials are
// configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM), the code is
// sent for real and NOT returned to the client. Otherwise we fall back to
// returning the code (ZAPP_RETURN_OTP=1) so login still works without a gateway.
export async function sendOtp(phone, code, channel = "sms") {
  const isProd = process.env.NODE_ENV === "production";
  const alwaysReturn = process.env.ZAPP_RETURN_OTP === "1";
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM; // a Twilio number or alphanumeric sender

  if (sid && token && from) {
    try {
      const params = new URLSearchParams({ To: phone, From: from });
      if (channel === "call") {
        params.set(
          "Twiml",
          `<Response><Say>Your Zapp Chat code is ${code.split("").join(", ")}</Say></Response>`
        );
      } else {
        params.set("Body", `Your Zapp Chat code is ${code}`);
      }
      const endpoint = channel === "call" ? "Calls" : "Messages";
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/${endpoint}.json`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params,
        }
      );
      if (!res.ok) {
        console.error("[OTP] Twilio error", res.status, await res.text());
      } else {
        console.log(`[OTP] sent via Twilio (${channel}) to ${phone}`);
      }
    } catch (e) {
      console.error("[OTP] Twilio exception:", e?.message);
    }
    // Provider configured → never leak the code to the client.
    return { devCode: alwaysReturn ? code : undefined };
  }

  // No provider configured → dev fallback (code returned to the app/log).
  const via = channel === "call" ? "CALL" : "SMS";
  console.log(`[${via}] -> ${phone}: your Zapp code is ${code}`);
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
