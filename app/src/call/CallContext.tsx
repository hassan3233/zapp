import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MediaStream } from "react-native-webrtc";
import { getSocket } from "../socket";
import { useAuth } from "../auth/AuthContext";
import type { CallMedia, User } from "../types";
import { PeerSession, isWebRTCAvailable } from "./webrtc";

type CallPhase = "idle" | "outgoing" | "incoming" | "connected" | "ended";

type ActiveCall = {
  callId: number;
  peer: User;
  media: CallMedia;
  outgoing: boolean;
};

type CallState = {
  phase: CallPhase;
  call: ActiveCall | null;
  seconds: number;
  muted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (peer: User, media: CallMedia) => void;
  accept: () => void;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
};

const CallCtx = createContext<CallState | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const answeredRef = useRef(false);
  const session = useRef<PeerSession | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  callRef.current = call;

  function teardownMedia() {
    session.current?.close();
    session.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }

  function cleanup() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    answeredRef.current = false;
    teardownMedia();
    setMuted(false);
    setSeconds(0);
    setPhase("ended");
    setTimeout(() => {
      setPhase("idle");
      setCall(null);
    }, 1000);
  }

  function startTimer() {
    answeredRef.current = true;
    setPhase("connected");
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  // Begin the WebRTC peer session (caller creates the offer).
  async function startSession(isCaller: boolean) {
    const c = callRef.current;
    const socket = getSocket();
    if (!c || !socket || !isWebRTCAvailable()) return;
    const sess = new PeerSession(
      c.media,
      isCaller,
      (type, payload) =>
        socket.emit(`webrtc:${type}`, {
          toUserId: c.peer.id,
          callId: c.callId,
          [type === "ice" ? "candidate" : "sdp"]: payload,
        }),
      (s) => setRemoteStream(s),
      (s) => setLocalStream(s)
    );
    session.current = sess;
    try {
      await sess.init();
    } catch (e) {
      // media/permission failure — keep the call going rather than crash
      console.warn("WebRTC init failed", e);
    }
  }

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !token) return;

    const onIncoming = (p: { callId: number; media: CallMedia; from: User }) => {
      if (callRef.current) return;
      setCall({ callId: p.callId, peer: p.from, media: p.media, outgoing: false });
      setPhase("incoming");
    };
    const onAccepted = () => {
      startTimer();
      session.current?.makeOffer(); // media already acquired at startCall
    };
    const onRejected = () => cleanup();
    const onCanceled = () => cleanup();
    const onEnded = () => cleanup();

    const onOffer = (p: { sdp: any }) => session.current?.handleSignal("offer", p.sdp);
    const onAnswer = (p: { sdp: any }) => session.current?.handleSignal("answer", p.sdp);
    const onIce = (p: { candidate: any }) => session.current?.handleSignal("ice", p.candidate);

    socket.on("call:incoming", onIncoming);
    socket.on("call:accepted", onAccepted);
    socket.on("call:rejected", onRejected);
    socket.on("call:canceled", onCanceled);
    socket.on("call:ended", onEnded);
    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice", onIce);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:accepted", onAccepted);
      socket.off("call:rejected", onRejected);
      socket.off("call:canceled", onCanceled);
      socket.off("call:ended", onEnded);
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice", onIce);
    };
  }, [token]);

  const value: CallState = {
    phase,
    call,
    seconds,
    muted,
    localStream,
    remoteStream,
    startCall: (peer, media) => {
      const socket = getSocket();
      if (!socket || !user) return;
      const c: ActiveCall = { callId: 0, peer, media, outgoing: true };
      callRef.current = c;
      setCall(c);
      setPhase("outgoing");
      // Acquire local media now so the caller sees their preview while ringing.
      startSession(true);
      socket.emit("call:invite", { toUserId: peer.id, media }, (res: any) => {
        if (res?.ok) setCall((cur) => (cur ? { ...cur, callId: res.callId } : cur));
        else cleanup();
      });
    },
    accept: () => {
      const socket = getSocket();
      const c = callRef.current;
      if (!socket || !c) return;
      socket.emit("call:accept", { callId: c.callId, toUserId: c.peer.id });
      startTimer();
      startSession(false); // callee waits for the offer
    },
    reject: () => {
      const socket = getSocket();
      const c = callRef.current;
      if (socket && c) socket.emit("call:reject", { callId: c.callId, toUserId: c.peer.id });
      cleanup();
    },
    hangup: () => {
      const socket = getSocket();
      const c = callRef.current;
      if (socket && c) {
        if (phase === "outgoing") {
          socket.emit("call:cancel", { callId: c.callId, toUserId: c.peer.id });
        } else {
          socket.emit("call:end", {
            callId: c.callId,
            toUserId: c.peer.id,
            durationSec: seconds,
            answered: answeredRef.current,
          });
        }
      }
      cleanup();
    },
    toggleMute: () =>
      setMuted((m) => {
        const next = !m;
        session.current?.setMuted(next);
        return next;
      }),
  };

  return <CallCtx.Provider value={value}>{children}</CallCtx.Provider>;
}

export function useCall() {
  const ctx = useContext(CallCtx);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
