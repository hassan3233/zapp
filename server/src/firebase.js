// Use firebase-admin's modular ESM entry points. The default import
// (`import admin from "firebase-admin"`) does NOT expose .auth()/.initializeApp()
// under Node ES modules, which caused "admin.auth is not a function".
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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
