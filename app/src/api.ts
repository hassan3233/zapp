import { API_URL } from "./config";
import type { Call, Channel, Conversation, Gender, Message, User } from "./types";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  // Phone/OTP auth
  requestOtp: (phone: string, channel: "sms" | "call" = "sms") =>
    request<{ sent: boolean; phone: string; channel: string; devCode?: string }>(
      "/api/auth/request-otp",
      { method: "POST", body: { phone, channel } }
    ),

  verifyOtp: (phone: string, code: string) =>
    request<{ token: string; user: User; profileComplete: boolean }>(
      "/api/auth/verify-otp",
      { method: "POST", body: { phone, code } }
    ),

  // Firebase phone auth: exchange a verified Firebase ID token for our session.
  firebaseLogin: (idToken: string) =>
    request<{ token: string; user: User; profileComplete: boolean }>(
      "/api/auth/firebase",
      { method: "POST", body: { idToken } }
    ),

  updateProfile: (body: {
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    dateOfBirth?: string | null;
    gender?: Gender | null;
    avatar?: string | null;
    bio?: string | null;
  }) =>
    request<{ user: User }>("/api/auth/profile", { method: "PATCH", body }),

  me: () => request<{ user: User }>("/api/auth/me"),

  setPublicKey: (publicKey: string) =>
    request<{ user: User }>("/api/auth/public-key", {
      method: "POST",
      body: { publicKey },
    }),

  conversationMembers: (conversationId: number) =>
    request<{ members: User[] }>(`/api/conversations/${conversationId}/members`),

  searchUsers: (q: string) =>
    request<{ users: User[] }>(`/api/users?q=${encodeURIComponent(q)}`),

  // Contact profile + block/report.
  getUser: (id: number) =>
    request<{ user: User; blockedByMe: boolean }>(`/api/users/${id}`),
  blockUser: (id: number) =>
    request<{ ok: boolean; blocked: boolean }>(`/api/users/${id}/block`, { method: "POST" }),
  unblockUser: (id: number) =>
    request<{ ok: boolean; blocked: boolean }>(`/api/users/${id}/block`, { method: "DELETE" }),
  reportUser: (id: number, reason?: string) =>
    request<{ ok: boolean }>(`/api/users/${id}/report`, {
      method: "POST",
      body: { reason },
    }),

  starMessage: (conversationId: number, messageId: number, starred: boolean) =>
    request<{ ok: boolean }>(
      `/api/conversations/${conversationId}/messages/${messageId}/star`,
      { method: "PUT", body: { starred } }
    ),
  listStarred: (conversationId: number) =>
    request<{ messages: Message[] }>(`/api/conversations/${conversationId}/starred`),
  pinMessage: (conversationId: number, messageId: number) =>
    request<{ pinnedMessage: Message | null }>(`/api/conversations/${conversationId}/pin`, {
      method: "PUT",
      body: { messageId },
    }),
  unpinMessage: (conversationId: number) =>
    request<{ ok: boolean }>(`/api/conversations/${conversationId}/pin`, { method: "DELETE" }),

  reactMessage: (conversationId: number, messageId: number, emoji: string) =>
    request<{ reactions: { userId: number; emoji: string }[] }>(
      `/api/conversations/${conversationId}/messages/${messageId}/reaction`,
      { method: "PUT", body: { emoji } }
    ),

  editMessage: (conversationId: number, messageId: number, body: string) =>
    request<{ message: Message }>(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      { method: "PATCH", body: { body } }
    ),

  deleteMessage: (conversationId: number, messageId: number, scope: "everyone" | "me") =>
    request<{ ok: boolean }>(
      `/api/conversations/${conversationId}/messages/${messageId}?scope=${scope}`,
      { method: "DELETE" }
    ),

  // Push-notification device token registration.
  registerPushToken: (token: string, platform?: string) =>
    request<{ ok: boolean }>("/api/users/push-token", {
      method: "POST",
      body: { token, platform },
    }),
  unregisterPushToken: (token: string) =>
    request<{ ok: boolean }>("/api/users/push-token", {
      method: "DELETE",
      body: { token },
    }),

  listConversations: () =>
    request<{ conversations: Conversation[] }>("/api/conversations"),

  openConversation: (userId: number) =>
    request<{ conversation: { id: number; members: User[] } }>(
      "/api/conversations",
      { method: "POST", body: { userId } }
    ),

  createGroup: (title: string, memberIds: number[]) =>
    request<{ conversation: { id: number; title: string; members: User[] } }>(
      "/api/conversations/group",
      { method: "POST", body: { title, memberIds } }
    ),

  // ---- Channels (broadcast) ----
  listChannels: (q?: string) =>
    request<{ channels: Channel[] }>(
      `/api/channels${q ? `?q=${encodeURIComponent(q)}` : ""}`
    ),

  createChannel: (title: string, description?: string) =>
    request<{ channel: Channel }>("/api/channels", {
      method: "POST",
      body: { title, description },
    }),

  getChannel: (id: number) => request<{ channel: Channel }>(`/api/channels/${id}`),

  subscribeChannel: (id: number) =>
    request<{ ok: boolean; subscribed: boolean }>(`/api/channels/${id}/subscribe`, {
      method: "POST",
    }),

  unsubscribeChannel: (id: number) =>
    request<{ ok: boolean; subscribed: boolean }>(`/api/channels/${id}/subscribe`, {
      method: "DELETE",
    }),

  listCalls: () => request<{ calls: Call[] }>("/api/calls"),

  listMessages: (conversationId: number, before?: number) =>
    request<{ messages: Message[]; pinnedMessage?: Message | null }>(
      `/api/conversations/${conversationId}/messages` +
        (before ? `?before=${before}` : "")
    ),
};
