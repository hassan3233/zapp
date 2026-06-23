// Thin wrapper around react-native-webrtc. The native module is loaded lazily
// (via require) so a JS bundle running on a build *without* the native module
// won't crash on import — calls just won't get media until the app is rebuilt.
import { PermissionsAndroid, Platform } from "react-native";
import type { MediaStream } from "react-native-webrtc";
import type { CallMedia } from "../types";

async function ensurePermissions(media: CallMedia) {
  if (Platform.OS !== "android") return;
  const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (media === "video") perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  try {
    await PermissionsAndroid.requestMultiple(perms);
  } catch {
    /* user can still proceed; getUserMedia will fail gracefully */
  }
}

type SignalSender = (type: "offer" | "answer" | "ice", payload: any) => void;

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let RTC: any = null;
export function loadWebRTC(): any {
  if (RTC) return RTC;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RTC = require("react-native-webrtc");
  return RTC;
}

export function isWebRTCAvailable(): boolean {
  try {
    return !!loadWebRTC()?.RTCPeerConnection;
  } catch {
    return false;
  }
}

// Manages one peer connection + local/remote media for a single call.
export class PeerSession {
  pc: any = null;
  local: MediaStream | null = null;
  private pendingIce: any[] = [];
  private remoteSet = false;

  constructor(
    private media: CallMedia,
    private isCaller: boolean,
    private send: SignalSender,
    private onRemote: (s: MediaStream | null) => void,
    private onLocal: (s: MediaStream | null) => void
  ) {}

  // Acquire local media + set up the peer connection (no offer yet). Requesting
  // permission + the local preview happens here, as soon as the call starts.
  async init() {
    await ensurePermissions(this.media);
    const { RTCPeerConnection, mediaDevices } = loadWebRTC();
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const local = await mediaDevices.getUserMedia({
      audio: true,
      video: this.media === "video" ? { facingMode: "user" } : false,
    });
    this.local = local;
    this.onLocal(local);
    local.getTracks().forEach((t: any) => this.pc.addTrack(t, local));

    this.pc.addEventListener("icecandidate", (e: any) => {
      if (e.candidate) this.send("ice", e.candidate);
    });
    this.pc.addEventListener("track", (e: any) => {
      if (e.streams && e.streams[0]) {
        this.remoteSet = true;
        this.onRemote(e.streams[0]);
      }
    });
  }

  // Caller creates the offer once the callee has accepted.
  async makeOffer() {
    if (!this.pc) return;
    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    this.send("offer", offer);
  }

  async handleSignal(type: "offer" | "answer" | "ice", payload: any) {
    if (!this.pc) return;
    const { RTCSessionDescription, RTCIceCandidate } = loadWebRTC();
    if (type === "offer") {
      await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
      await this.flushIce();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.send("answer", answer);
    } else if (type === "answer") {
      await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
      await this.flushIce();
    } else if (type === "ice") {
      const cand = new RTCIceCandidate(payload);
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(cand);
      else this.pendingIce.push(cand);
    }
  }

  private async flushIce() {
    for (const c of this.pendingIce) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        /* ignore */
      }
    }
    this.pendingIce = [];
  }

  setMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach((t: any) => (t.enabled = !muted));
  }

  close() {
    try {
      this.local?.getTracks().forEach((t: any) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.pc = null;
    this.local = null;
  }
}
