// Use firebase-admin's modular ESM entry points. The default import
// (`import admin from "firebase-admin"`) does NOT expose .auth()/.initializeApp()
// under Node ES modules, which caused "admin.auth is not a function".
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

// On Cloud Run (same GCP project as Firebase) no key file is needed — Application
// Default Credentials + the metadata server supply everything. We pass projectId
// explicitly so verifyIdToken can validate the token's audience even if the
// environment's project auto-detection is unavailable.
if (getApps().length === 0) {
  initializeApp({ projectId: "zapp-500315" });
}

export const firebaseReady = true;

// Verify a Firebase ID token (from the app's phone sign-in) and return its claims.
export async function verifyFirebaseIdToken(idToken) {
  return getAuth().verifyIdToken(idToken);
}

// Send a push notification to the given FCM device tokens. Returns the tokens
// that are permanently invalid (unregistered) so the caller can prune them.
export async function sendPush(tokens, { title, body, data }) {
  if (!tokens.length) return { invalidTokens: [] };
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: data || {},
    // No channelId: the FCM SDK auto-creates a default channel, so notifications
    // always display even though we never register one on the client.
    android: { priority: "high", notification: { sound: "default" } },
  });
  const invalidTokens = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token" ||
      code === "messaging/invalid-argument"
    ) {
      invalidTokens.push(tokens[i]);
    }
  });
  return { invalidTokens };
}
