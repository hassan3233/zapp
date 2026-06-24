import admin from "firebase-admin";

// On Cloud Run (same GCP project as Firebase, zapp-500315) the default service
// account is used automatically — no key file needed. Locally without creds,
// initialization is harmless; verifyIdToken just won't work until deployed.
let ready = false;
try {
  admin.initializeApp();
  ready = true;
} catch {
  /* already initialized */
  ready = true;
}

export const firebaseReady = ready;

// Verify a Firebase ID token (from the app's phone sign-in) and return its claims.
export async function verifyFirebaseIdToken(idToken) {
  return admin.auth().verifyIdToken(idToken);
}
