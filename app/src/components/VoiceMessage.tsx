import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import * as FileSystem from "expo-file-system/legacy";
import { useTheme } from "../theme";

// Voice messages travel inside the normal (E2EE-encrypted) message body:
//   VOICE:1:<durationSec>:<base64 m4a>
const PREFIX = /^VOICE:1:(\d+):/;

export function isVoiceBody(body: string): boolean {
  return body.startsWith("VOICE:1:");
}

export function makeVoiceBody(base64: string, durationSec: number): string {
  return `VOICE:1:${Math.round(durationSec)}:${base64}`;
}

// expo-audio is a native module — only use it when it's compiled in, so the
// JS never crashes on a build without it.
export const voiceAvailable = !!requireOptionalNativeModule("ExpoAudio");
const audio: any = voiceAvailable ? require("expo-audio") : null;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const MAX_SECONDS = 120; // auto-send after 2 minutes

// Replaces the composer while recording: red dot + timer + cancel/send.
export function VoiceRecorderBar({
  onCancel,
  onSend,
}: {
  onCancel: () => void;
  onSend: (base64: string, durationSec: number) => void;
}) {
  const colors = useTheme();
  const recorder = audio.useAudioRecorder(audio.RecordingPresets.LOW_QUALITY);
  const [sec, setSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const finishing = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let active = true;
    (async () => {
      try {
        const perm = await audio.AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted || !active) {
          onCancel();
          return;
        }
        try {
          await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        } catch {}
        await recorder.prepareToRecordAsync();
        recorder.record();
        interval = setInterval(() => setSec((s) => s + 1), 1000);
      } catch {
        onCancel();
      }
    })();
    return () => {
      active = false;
      if (interval) clearInterval(interval);
      try {
        recorder.stop();
      } catch {}
    };
  }, []);

  async function stopRecording(): Promise<string | null> {
    try {
      await recorder.stop();
      try {
        await audio.setAudioModeAsync({ allowsRecording: false });
      } catch {}
      return recorder.uri || null;
    } catch {
      return null;
    }
  }

  async function cancel() {
    if (finishing.current) return;
    finishing.current = true;
    await stopRecording();
    onCancel();
  }

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    const uri = await stopRecording();
    if (!uri) {
      onCancel();
      return;
    }
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      onSend(base64, Math.max(sec, 1));
    } catch {
      onCancel();
    }
  }

  // Hard cap so bodies stay well under the server's socket buffer limit.
  useEffect(() => {
    if (sec >= MAX_SECONDS) finish();
  }, [sec]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <View
        style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#FF5A5F", marginRight: 10 }}
      />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", width: 52 }}>{fmt(sec)}</Text>
      <Text style={{ color: colors.textMuted, flex: 1 }}>Recording…</Text>
      <TouchableOpacity onPress={cancel} disabled={busy} style={{ padding: 10, marginRight: 6 }}>
        <Text style={{ color: colors.textMuted, fontSize: 18 }}>✕</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={finish}
        disabled={busy}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={{ color: colors.onPrimary, fontSize: 18, fontWeight: "800" }}>➤</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// The playable bubble content: ▶/⏸ + timer. The audio is written to a cache
// file on first play (players can't read base64 directly).
export function VoiceBubble({
  payload,
  messageId,
  mine,
  onLongPress,
}: {
  payload: string;
  messageId: number;
  mine: boolean;
  onLongPress?: () => void;
}) {
  const colors = useTheme();
  const parsed = useMemo(() => {
    const m = payload.match(PREFIX);
    if (!m) return null;
    return { dur: Number(m[1]) || 0, b64: payload.slice(m[0].length) };
  }, [payload]);
  const player = audio.useAudioPlayer(null);
  const status = audio.useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset to the start when playback finishes so it can be replayed.
  useEffect(() => {
    if (status?.didJustFinish) {
      try {
        player.pause();
        player.seekTo(0);
      } catch {}
    }
  }, [status?.didJustFinish]);

  async function toggle() {
    if (!parsed) return;
    try {
      if (!loaded) {
        setBusy(true);
        const path = FileSystem.cacheDirectory + "vm_" + messageId + ".m4a";
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) {
          await FileSystem.writeAsStringAsync(path, parsed.b64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        player.replace(path);
        setLoaded(true);
        player.play();
        setBusy(false);
      } else if (status?.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      setBusy(false);
    }
  }

  if (!parsed) return null;
  const fg = mine ? colors.bubbleMineText : colors.text;
  const shown = status?.playing ? Math.floor(status.currentTime || 0) : parsed.dur;

  return (
    <TouchableOpacity
      onPress={toggle}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: mine ? "rgba(21,23,28,0.15)" : colors.primary,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={mine ? fg : colors.onPrimary} />
        ) : (
          <Text style={{ color: mine ? fg : colors.onPrimary, fontSize: 14, fontWeight: "800" }}>
            {status?.playing ? "⏸" : "▶"}
          </Text>
        )}
      </View>
      <Text style={{ color: fg, fontSize: 15, fontWeight: "600" }}>🎤 {fmt(shown)}</Text>
    </TouchableOpacity>
  );
}
