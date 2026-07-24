export type Gender = "male" | "female";

export type User = {
  id: number;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  avatar: string | null;
  bio?: string | null;
  publicKey?: string | null;
  profileComplete: boolean;
};

export type Reaction = { userId: number; emoji: string };

export type Message = {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  reactions?: Reaction[];
  replyTo?: number | null;
  starred?: boolean;
};

// A broadcast channel: everyone can subscribe and read, only the owner posts.
// Channel posts are NOT end-to-end encrypted (a broadcast can't re-wrap the key
// for every subscriber), so they're stored and shown as plain text.
export type Channel = {
  id: number;
  title: string;
  description: string | null;
  ownerId: number;
  subscribers: number;
  subscribed?: boolean;
  isOwner?: boolean;
  createdAt?: string;
};

export type Conversation = {
  id: number;
  isGroup: boolean;
  isChannel?: boolean;
  ownerId?: number | null;
  isOwner?: boolean;
  title: string | null;
  members: User[];
  lastMessage: {
    id: number;
    body: string;
    createdAt: string;
    senderId: number;
  } | null;
};

export type CallMedia = "audio" | "video";
export type CallStatus =
  | "missed"
  | "answered"
  | "declined"
  | "canceled"
  | "ended";

export type Call = {
  id: number;
  callerId: number;
  calleeId: number;
  media: CallMedia;
  status: CallStatus;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  outgoing: boolean;
  other: User | null;
};
