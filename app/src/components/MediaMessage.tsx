import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../theme";

// Photos and videos travel inside the normal (E2EE-encrypted) message body:
//   IMG:1:<base64 jpeg>
//   VID:1:<durationSec>:<base64 mp4>
const IMG_PREFIX = "IMG:1:";
const VID_PREFIX = /^VID:1:(\d+):/;

export function isImageBody(body: string): boolean {
  return body.startsWith(IMG_PREFIX);
}
export function isVideoBody(body: string): boolean {
  return body.startsWith("VID:1:");
}
export function makeImageBody(base64: string): string {
  return IMG_PREFIX + base64;
}
export function makeVideoBody(base64: string, durationSec: number): string {
  return `VID:1:${Math.max(0, Math.round(durationSec))}:${base64}`;
}

// expo-video is a native module — guard so JS never crashes without it.
export const videoAvailable = !!requireOptionalNativeModule("ExpoVideo");
const video: any = videoAvailable ? require("expo-video") : null;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Inline photo that expands to a full-screen viewer when tapped.
export function ImageBubble({ payload }: { payload: string }) {
  const [open, setOpen] = useState(false);
  const uri = useMemo(() => "data:image/jpeg;base64," + payload.slice(IMG_PREFIX.length), [payload]);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)}>
        <Image source={{ uri }} style={{ width: 210, height: 210, borderRadius: 12 }} resizeMode="cover" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" }}>
          <TouchableOpacity
            onPress={() => setOpen(false)}
            style={{ position: "absolute", top: 48, right: 20, zIndex: 2, padding: 10 }}
          >
            <Text style={{ color: "#fff", fontSize: 22 }}>✕</Text>
          </TouchableOpacity>
          <Image source={{ uri }} style={{ width: "100%", height: "80%" }} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
}

// Full-screen player, mounted only while open (expo-video hooks live inside).
function VideoPlayerModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const player = video.useVideoPlayer(uri, (p: any) => {
    p.play();
  });
  const { width } = Dimensions.get("window");
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center" }}>
        <TouchableOpacity
          onPress={onClose}
          style={{ position: "absolute", top: 48, right: 20, zIndex: 2, padding: 10 }}
        >
          <Text style={{ color: "#fff", fontSize: 22 }}>✕</Text>
        </TouchableOpacity>
        <video.VideoView
          player={player}
          style={{ width, height: (width * 16) / 9 > 600 ? 600 : (width * 16) / 9 }}
          nativeControls
          contentFit="contain"
        />
      </View>
    </Modal>
  );
}

// Dark tappable tile; the mp4 is written to a cache file on first open.
export function VideoBubble({
  payload,
  messageId,
  mine,
}: {
  payload: string;
  messageId: number;
  mine: boolean;
}) {
  const colors = useTheme();
  const parsed = useMemo(() => {
    const m = payload.match(VID_PREFIX);
    if (!m) return null;
    return { dur: Number(m[1]) || 0, b64: payload.slice(m[0].length) };
  }, [payload]);
  const [uri, setUri] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function openVideo() {
    if (!parsed || !videoAvailable) return;
    try {
      if (!uri) {
        setBusy(true);
        const path = FileSystem.cacheDirectory + "vid_" + messageId + ".mp4";
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) {
          await FileSystem.writeAsStringAsync(path, parsed.b64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        setUri(path);
        setBusy(false);
      }
      setOpen(true);
    } catch {
      setBusy(false);
    }
  }

  if (!parsed) return null;
  const fg = mine ? colors.bubbleMineText : colors.text;
  return (
    <>
      <TouchableOpacity
        onPress={openVideo}
        style={{
          width: 210,
          height: 130,
          borderRadius: 12,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "rgba(255,255,255,0.9)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 17, color: "#15171C", fontWeight: "800" }}>▶</Text>
            </View>
            <Text style={{ color: "#fff", marginTop: 8, fontSize: 13, fontWeight: "600" }}>
              🎥 {parsed.dur ? fmt(parsed.dur) : "Video"}
            </Text>
          </>
        )}
      </TouchableOpacity>
      {!videoAvailable ? (
        <Text style={{ color: fg, fontSize: 12, marginTop: 4 }}>Update the app to play videos</Text>
      ) : null}
      {open && uri ? <VideoPlayerModal uri={uri} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
