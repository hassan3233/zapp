import { io, Socket } from "socket.io-client";
import { API_URL } from "./config";

let socket: Socket | null = null;
let connected = false;
const statusListeners = new Set<(c: boolean) => void>();

function setConnected(c: boolean) {
  if (connected === c) return;
  connected = c;
  statusListeners.forEach((l) => l(c));
}

export function isSocketConnected(): boolean {
  return connected;
}

// Subscribe to realtime connection up/down (used by the offline banner).
export function onSocketStatus(cb: (connected: boolean) => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

// Connect (or reuse) a single authenticated socket for the logged-in user.
export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    setConnected(true);
    return socket;
  }
  if (socket) socket.disconnect();
  socket = io(API_URL, {
    auth: { token },
    transports: ["websocket"],
  });
  socket.on("connect", () => setConnected(true));
  socket.on("disconnect", () => setConnected(false));
  socket.io.on("reconnect", () => setConnected(true));
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  setConnected(false);
}
