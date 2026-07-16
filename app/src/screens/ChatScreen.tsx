import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  Keyboard,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { api } from "../api";
import { getSocket } from "../socket";
import { useAuth } from "../auth/AuthContext";
import { useCall } from "../call/CallContext";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";
import {
  ensureKeys,
  encryptMessage,
  decryptMessage,
  isEncrypted,
  cryptoAvailable,
} from "../crypto/e2ee";
import { usePresence } from "../net/PresenceContext";
import type { Message, User } from "../types";

export default function ChatScreen({ route, navigation }: any) {
  const { conversationId, title } = route.params;
  const peer: User | undefined = route.params?.peer;
  const { user } = useAuth();
  const { startCall } = useCall();
  const { t } = useT();
  const { isOnline, lastSeen } = usePresence();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Header + status-bar height — the exact offset KeyboardAvoidingView needs so
  // the composer sits right on top of the keyboard (edge-to-edge defeats the
  // manifest's adjustResize on RN 0.85, so we lift it in JS).
  const headerHeight = useHeaderHeight();
  // Keep the composer above the system navigation bar when the keyboard is
  // closed; sit snug on the keyboard when it's open.
  const insets = useSafeAreaInsets();
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKbVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Presence subtitle for 1:1 chats.
  const peerOnline = peer ? isOnline(peer.id) : false;
  const peerSeen = peer ? lastSeen(peer.id) : undefined;
  const statusText = !peer
    ? ""
    : peerOnline
    ? t("status.online")
    : peerSeen
    ? t("status.lastSeen", { time: fmtSeen(peerSeen) })
    : "";
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [members, setMembers] = useState<User[]>([]);
  const [keysReady, setKeysReady] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decCache = useRef<Map<number, string>>(new Map());

  // True when this device can encrypt and at least one other member has a key.
  const encActive =
    cryptoAvailable() &&
    keysReady &&
    members.some((m) => m.id !== user?.id && m.publicKey);

  // Show plaintext, decrypting envelopes on the fly (cached by message id).
  function displayBody(m: Message): string {
    if (!isEncrypted(m.body)) return m.body;
    const cached = decCache.current.get(m.id);
    if (cached !== undefined) return cached;
    const dec = decryptMessage(m.body, user?.id ?? -1);
    if (dec !== null) {
      decCache.current.set(m.id, dec);
      return dec;
    }
    return "🔒 …";
  }

  // Header: title + (for 1:1 chats) audio/video call buttons.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center" }}
          disabled={!peer}
          onPress={() => peer && navigation.navigate("ContactProfile", { user: peer })}
        >
          {peer?.avatar ? (
            <Image
              source={{ uri: peer.avatar }}
              style={{ width: 34, height: 34, borderRadius: 17, marginRight: 10 }}
            />
          ) : (
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                marginRight: 10,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "800", fontSize: 15 }}>
                {(title || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }} numberOfLines={1}>
              {title || "Chat"}
            </Text>
            {peer && statusText ? (
              <Text style={{ color: peerOnline ? "#2ecc71" : colors.textMuted, fontSize: 12 }}>
                {statusText}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ),
      headerRight: peer
        ? () => (
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                onPress={() => startCall(peer, "audio")}
                style={{ paddingHorizontal: 10 }}
              >
                <Text style={{ fontSize: 20 }}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => startCall(peer, "video")}
                style={{ paddingHorizontal: 10 }}
              >
                <Text style={{ fontSize: 20 }}>📹</Text>
              </TouchableOpacity>
            </View>
          )
        : undefined,
    });
  }, [navigation, title, peer, startCall, statusText, peerOnline, colors]);

  // Load history + join the room + subscribe to live messages.
  useEffect(() => {
    let active = true;
    const socket = getSocket();

    (async () => {
      try {
        await ensureKeys();
        if (active) setKeysReady(true);
      } catch {
        // crypto unavailable on this build — chat still works, just unencrypted
      }
      try {
        const mem = await api.conversationMembers(conversationId);
        if (active) setMembers(mem.members);
      } catch {
        // ignore — sending falls back to plaintext if we can't get keys
      }
      try {
        const res = await api.listMessages(conversationId);
        if (active) setMessages(res.messages);
      } catch {
        // ignore
      }
    })();

    socket?.emit("conversation:join", conversationId);

    const onNew = (msg: Message) => {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
    };
    const onTyping = (p: {
      conversationId: number;
      userId: number;
      isTyping: boolean;
    }) => {
      if (p.conversationId === conversationId && p.userId !== user?.id) {
        setPeerTyping(p.isTyping);
      }
    };

    socket?.on("message:new", onNew);
    socket?.on("typing", onTyping);

    return () => {
      active = false;
      socket?.emit("conversation:leave", conversationId);
      socket?.off("message:new", onNew);
      socket?.off("typing", onTyping);
    };
  }, [conversationId, user?.id]);

  function send() {
    const plaintext = text.trim();
    if (!plaintext) return;
    // Encrypt for all members (incl. me); fall back to plaintext if we can't.
    const body =
      (user?.id != null && encryptMessage(plaintext, members, user.id)) || plaintext;
    const socket = getSocket();
    socket?.emit("message:send", { conversationId, body });
    socket?.emit("typing", { conversationId, isTyping: false });
    setText("");
  }

  function onChangeText(v: string) {
    setText(v);
    const socket = getSocket();
    socket?.emit("typing", { conversationId, isTyping: true });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket?.emit("typing", { conversationId, isTyping: false });
    }, 1500);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={headerHeight}
    >
      {encActive ? (
        <View style={styles.e2eeBanner}>
          <Text style={styles.e2eeText}>🔒 {t("chat.e2ee")}</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View
              style={[
                styles.bubbleRow,
                mine ? styles.rowMine : styles.rowTheirs,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
              >
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                  {displayBody(item)}
                </Text>
                <Text style={[styles.time, mine && styles.timeMine]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {peerTyping ? <Text style={styles.typing}>typing…</Text> : null}

      <View
        style={[
          styles.composer,
          { paddingBottom: kbVisible ? 8 : Math.max(insets.bottom + 8, 20) },
        ]}
      >
        <TextInput
          style={styles.input}
          placeholder={t("chat.message")}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={onChangeText}
          multiline
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!text.trim()}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function formatTime(iso: string) {
  // server stores "YYYY-MM-DD HH:MM:SS" in UTC
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// "last seen" timestamp (presence sends a full ISO string).
function fmtSeen(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  e2eeBanner: {
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  e2eeText: { color: colors.textMuted, fontSize: 12 },
  listContent: { padding: 12, paddingBottom: 4 },
  bubbleRow: { marginVertical: 3, flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: colors.bubbleMine, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: colors.bubbleTheirs,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: colors.text, fontSize: 16 },
  bubbleTextMine: { color: colors.bubbleMineText },
  time: {
    color: colors.textMuted,
    fontSize: 11,
    alignSelf: "flex-end",
    marginTop: 2,
  },
  timeMine: { color: "rgba(21,23,28,0.55)" },
  typing: {
    color: colors.textMuted,
    fontStyle: "italic",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: colors.onPrimary, fontSize: 18, fontWeight: "800" },
});
