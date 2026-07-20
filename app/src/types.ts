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

export type Conversation = {
  id: number;
  isGroup: boolean;
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
