import AsyncStorage from "@react-native-async-storage/async-storage";

const LANG_KEY = "zapp.language";
const CHAT_KEY = "zapp.chatPrefs";

export async function getLanguage(): Promise<string> {
  return (await AsyncStorage.getItem(LANG_KEY)) || "en";
}
export async function setLanguage(code: string): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, code);
}

export type ChatPrefs = {
  enterIsSend: boolean;
  mediaAutoDownload: boolean;
  readReceipts: boolean;
};
const DEFAULT_CHAT: ChatPrefs = {
  enterIsSend: true,
  mediaAutoDownload: true,
  readReceipts: true,
};

export async function getChatPrefs(): Promise<ChatPrefs> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_KEY);
    return raw ? { ...DEFAULT_CHAT, ...JSON.parse(raw) } : DEFAULT_CHAT;
  } catch {
    return DEFAULT_CHAT;
  }
}
export async function setChatPrefs(p: ChatPrefs): Promise<void> {
  await AsyncStorage.setItem(CHAT_KEY, JSON.stringify(p));
}
