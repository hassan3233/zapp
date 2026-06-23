import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Image } from "react-native";
import { useCall } from "./CallContext";
import { isWebRTCAvailable, loadWebRTC } from "./webrtc";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function CallOverlay() {
  const { phase, call, seconds, muted, accept, reject, hangup, toggleMute, localStream, remoteStream } =
    useCall();
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (phase === "idle" || !call) return null;

  // Video rendering (only when react-native-webrtc is in the native build).
  const RTCView = isWebRTCAvailable() ? loadWebRTC().RTCView : null;
  const showVideo = call.media === "video" && RTCView;

  const statusText =
    phase === "incoming"
      ? call.media === "video"
        ? t("call.incomingVideo")
        : t("call.incoming")
      : phase === "outgoing"
      ? t("call.calling")
      : phase === "connected"
      ? fmt(seconds)
      : t("call.ended");

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.container}>
        {showVideo && remoteStream ? (
          <RTCView
            streamURL={(remoteStream as any).toURL()}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : null}
        {showVideo && localStream ? (
          <RTCView
            streamURL={(localStream as any).toURL()}
            style={styles.pip}
            objectFit="cover"
            zOrder={1}
          />
        ) : null}

        <View style={styles.top}>
          {!showVideo &&
            (call.peer.avatar ? (
              <Image source={{ uri: call.peer.avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>
                  {call.peer.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
          <Text style={styles.name}>{call.peer.displayName}</Text>
          <Text style={styles.status}>{statusText}</Text>
          {call.media === "video" ? (
            <Text style={styles.videoNote}>📹 {t("call.video")}</Text>
          ) : null}
          <Text style={styles.encrypted}>🔒 {t("call.encrypted")}</Text>
        </View>

        <View style={styles.controls}>
          {phase === "incoming" ? (
            <>
              <RoundButton label={t("call.decline")} color={colors.danger} icon="✕" onPress={reject} />
              <RoundButton label={t("call.accept")} color="#2ecc71" icon="✓" onPress={accept} />
            </>
          ) : phase === "connected" ? (
            <>
              <RoundButton
                label={muted ? t("call.unmute") : t("call.mute")}
                color={muted ? colors.primary : colors.surfaceAlt}
                icon={muted ? "🔇" : "🎙"}
                textColor={muted ? colors.onPrimary : colors.text}
                onPress={toggleMute}
              />
              <RoundButton label={t("call.end")} color={colors.danger} icon="✕" onPress={hangup} />
            </>
          ) : (
            <RoundButton label={t("call.cancel")} color={colors.danger} icon="✕" onPress={hangup} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function RoundButton({
  label,
  color,
  icon,
  onPress,
  textColor = "#fff",
}: {
  label: string;
  color: string;
  icon: string;
  onPress: () => void;
  textColor?: string;
}) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.btnWrap}>
      <TouchableOpacity style={[styles.btn, { backgroundColor: color }]} onPress={onPress}>
        <Text style={[styles.btnIcon, { color: textColor }]}>{icon}</Text>
      </TouchableOpacity>
      <Text style={styles.btnLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0B0E",
    justifyContent: "space-between",
    paddingVertical: 80,
  },
  pip: {
    position: "absolute",
    top: 50,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 12,
    backgroundColor: "#000",
    zIndex: 2,
  },
  top: { alignItems: "center", marginTop: 40 },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 20 },
  avatarPlaceholder: {
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onPrimary, fontSize: 48, fontWeight: "800" },
  name: { color: colors.text, fontSize: 26, fontWeight: "700" },
  status: { color: colors.textMuted, fontSize: 16, marginTop: 8 },
  videoNote: { color: colors.primary, marginTop: 6 },
  encrypted: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  controls: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-end",
    paddingHorizontal: 20,
  },
  btnWrap: { alignItems: "center" },
  btn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  btnIcon: { fontSize: 28 },
  btnLabel: { color: colors.text, marginTop: 8, fontSize: 13 },
});
