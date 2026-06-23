import Constants from "expo-constants";

// The backend port (matches zapp/server config.js).
const SERVER_PORT = 4000;

// In Expo dev, auto-derive the dev machine's LAN IP from the packager host so
// the app works on a physical phone (where "localhost" would be the phone).
// Override anytime by setting EXPO_PUBLIC_API_URL.
function resolveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const hostUri: string =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    "";
  const host = hostUri.split(":")[0];
  if (host) return `http://${host}:${SERVER_PORT}`;
  return `http://localhost:${SERVER_PORT}`;
}

export const API_URL = resolveApiUrl();
