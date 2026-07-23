import { NativeModules } from "react-native";

// Native full-screen ringing call notification (Android only, and absent in the
// dev client), so every call is guarded.
const native: any = (NativeModules as any).IncomingCall;

export function incomingCallAvailable(): boolean {
  return !!native;
}

/** Ring + show the call over the lock screen. */
export function showIncomingCall(
  callId: string | number,
  fromName: string,
  media: string
): void {
  try {
    native?.show?.(String(callId), String(fromName || ""), String(media || "audio"));
  } catch {
    /* ignore */
  }
}

/** Stop the ringtone and clear the notification. */
export function dismissIncomingCall(): void {
  try {
    native?.dismiss?.();
  } catch {
    /* ignore */
  }
}

/**
 * Android 14+ only auto-grants USE_FULL_SCREEN_INTENT to calling apps. Without
 * it the call still rings, but as a heads-up banner instead of taking over the
 * lock screen.
 */
export async function canUseFullScreen(): Promise<boolean> {
  try {
    const ok = await native?.canUseFullScreen?.();
    return ok !== false;
  } catch {
    return true;
  }
}

/** Send the user to the system setting that allows full-screen notifications. */
export function openFullScreenSettings(): void {
  try {
    native?.openFullScreenSettings?.();
  } catch {
    /* ignore */
  }
}
