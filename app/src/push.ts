import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import { api } from "./api";

// FCM messaging only exists in a real native build. Guard every use so the dev
// client (where the module is absent) never crashes.
function messagingAvailable(): boolean {
  return !!(NativeModules as any).RNFBMessagingModule;
}

// Returns the messaging INSTANCE (the default export is a factory that must be
// called). All the methods below live on the instance.
function messaging(): any {
  return require("@react-native-firebase/messaging").default();
}

let currentToken: string | null = null;

// Must be called once at module load (before the app renders) so notifications
// that arrive while the app is killed/backgrounded are handled. We send a
// `notification` payload, so Android displays it automatically — this handler
// just needs to exist to avoid the "no background handler" warning.
export function setupBackgroundMessageHandler(): void {
  if (!messagingAvailable()) return;
  try {
    messaging().setBackgroundMessageHandler(async () => {});
  } catch {
    /* ignore */
  }
}

// Ask for notification permission, get the FCM token, and register it with our
// backend. Call after login so the token is tied to the signed-in user.
export async function registerForPush(): Promise<void> {
  if (!messagingAvailable()) return;
  try {
    if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    }
    await messaging().requestPermission();
    const token = await messaging().getToken();
    if (token) {
      currentToken = token;
      await api.registerPushToken(token, Platform.OS);
    }
  } catch {
    // non-fatal — the app still works, just without notifications on this device
  }
}

// Forget this device's token on the server (call on logout).
export async function unregisterForPush(): Promise<void> {
  if (!messagingAvailable() || !currentToken) return;
  try {
    await api.unregisterPushToken(currentToken);
  } catch {
    /* ignore */
  }
  currentToken = null;
}

// Keep the server token fresh and route notification taps to the right chat.
// `onOpenConversation` is called with the conversation id when the user taps a
// notification (whether the app was backgrounded or fully closed).
export function initPushHandlers(
  onOpenConversation: (conversationId: number, title?: string) => void
): () => void {
  if (!messagingAvailable()) return () => {};
  const m = messaging();

  const unsubRefresh = m.onTokenRefresh(async (token: string) => {
    currentToken = token;
    try {
      await api.registerPushToken(token, Platform.OS);
    } catch {
      /* ignore */
    }
  });

  const handleOpen = (msg: any) => {
    const convId = Number(msg?.data?.conversationId);
    if (convId) onOpenConversation(convId, msg?.data?.title);
  };

  const unsubOpened = m.onNotificationOpenedApp(handleOpen);
  // App launched from a fully-closed state by tapping a notification.
  m.getInitialNotification()
    .then((msg: any) => {
      if (msg) handleOpen(msg);
    })
    .catch(() => {});

  return () => {
    try {
      unsubRefresh();
      unsubOpened();
    } catch {
      /* ignore */
    }
  };
}
