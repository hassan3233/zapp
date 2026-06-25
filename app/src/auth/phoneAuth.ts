import { NativeModules } from "react-native";

// Firebase phone auth is only present in a real (native) build. On the dev
// client we fall back to the server OTP flow, so guard every use.
export function firebaseAvailable(): boolean {
  return !!(NativeModules as any).RNFBAppModule;
}

let confirmation: any = null;

// Ask Firebase to send the SMS code to `fullPhone` (E.164, e.g. +9647701234567).
export async function startPhoneSignIn(fullPhone: string): Promise<void> {
  const auth = require("@react-native-firebase/auth").default;
  confirmation = await auth().signInWithPhoneNumber(fullPhone, true);
}

// Confirm the code the user entered; returns a Firebase ID token for our backend.
export async function confirmCode(code: string): Promise<string> {
  if (!confirmation) throw new Error("Request a code first.");
  const cred = await confirmation.confirm(code);
  return cred.user.getIdToken(true);
}

export function resetPhoneSignIn(): void {
  confirmation = null;
}
