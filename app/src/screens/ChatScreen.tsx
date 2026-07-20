import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  VoiceRecorderBar,
  VoiceBubble,
  isVoiceBody,
  makeVoiceBody,
  voiceAvailable,
} from "../components/VoiceMessage";
import {
  ImageBubble,
  VideoBubble,
  isImageBody,
  isVideoBody,
  makeImageBody,
  makeVideoBody,
} from "../components/MediaMessage";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import type { Conversation, Message, User } from "../types";

// Keep raw media small enough that the encrypted+base64 body (~1.8x raw)
// stays under the server's 8 MB socket limit.
const MAX_MEDIA_B64 = 5_000_000;

export default function ChatScreen({ route, navigation }: any) {
  const { conversationId, title } = route.params;
  const peer: User | undefined = route.params?.peer;
  const { user } = useAuth();
  const { startCall } = useCall();
  const { t } = useT();
  const { isOnline, lastSeen } = usePresence();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Keep the composer above the system navigation bar when the keyboard is
  // closed; sit snug on the keyboard when it's open.
  const insets = useSafeAreaInsets();
  const [kbVisible, setKbVisible] = useState(false);
  // Actual keyboard height reported by the OS — we lift the composer by exactly
  // this, which is device-agnostic (no header/inset math to get wrong).
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => {
      setKbVisible(true);
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      setKbVisible(false);
      setKeyboardHeight(0);
    });
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
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={openStarred} style={{ paddingHorizontal: 10 }}>
            <Text style={{ fontSize: 19 }}>⭐</Text>
          </TouchableOpacity>
          {peer ? (
            <>
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
            </>
          ) : null}
        </View>
      ),
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
        if (active) {
          setMessages(res.messages);
          setPinned(res.pinnedMessage ?? null);
        }
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
    const onDeleted = (p: { conversationId: number; messageId: number }) => {
      if (p.conversationId !== conversationId) return;
      decCache.current.delete(p.messageId);
      setMessages((prev) => prev.filter((m) => m.id !== p.messageId));
    };
    const onEdited = (msg: Message) => {
      if (msg.conversationId !== conversationId) return;
      decCache.current.delete(msg.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...msg, reactions: m.reactions } : m))
      );
    };
    const onReaction = (p: {
      conversationId: number;
      messageId: number;
      reactions: { userId: number; emoji: string }[];
    }) => {
      if (p.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === p.messageId ? { ...m, reactions: p.reactions } : m))
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

    const onPinned = (p: { conversationId: number; pinnedMessage: Message | null }) => {
      if (p.conversationId !== conversationId) return;
      setPinned(p.pinnedMessage);
    };

    socket?.on("message:new", onNew);
    socket?.on("message:deleted", onDeleted);
    socket?.on("message:edited", onEdited);
    socket?.on("message:reaction", onReaction);
    socket?.on("message:pinned", onPinned);
    socket?.on("typing", onTyping);

    return () => {
      active = false;
      socket?.emit("conversation:leave", conversationId);
      socket?.off("message:new", onNew);
      socket?.off("message:deleted", onDeleted);
      socket?.off("message:edited", onEdited);
      socket?.off("message:reaction", onReaction);
      socket?.off("message:pinned", onPinned);
      socket?.off("typing", onTyping);
    };
  }, [conversationId, user?.id]);

  // The message currently being replied to (quoted), if any.
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  // Shared pinned message for this conversation (null = none).
  const [pinned, setPinned] = useState<Message | null>(null);
  // Starred-messages viewer.
  const [starredOpen, setStarredOpen] = useState(false);
  const [starredMsgs, setStarredMsgs] = useState<Message[]>([]);

  async function toggleStar(m: Message) {
    const next = !m.starred;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, starred: next } : x)));
    try {
      await api.starMessage(conversationId, m.id, next);
    } catch {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, starred: !next } : x)));
    }
  }

  async function togglePin(m: Message) {
    const unpin = pinned?.id === m.id;
    try {
      if (unpin) {
        await api.unpinMessage(conversationId);
        setPinned(null);
      } else {
        const res = await api.pinMessage(conversationId, m.id);
        setPinned(res.pinnedMessage ?? m);
      }
    } catch (e: any) {
      Alert.alert("Could not pin", e.message || "Something went wrong.");
    }
  }

  async function openStarred() {
    setStarredOpen(true);
    try {
      const res = await api.listStarred(conversationId);
      setStarredMsgs(res.messages);
    } catch {
      setStarredMsgs([]);
    }
  }

  // Encrypt for all members (incl. me); fall back to plaintext if we can't.
  function sendBody(raw: string, replyTo?: number) {
    const body =
      (user?.id != null && encryptMessage(raw, members, user.id)) || raw;
    const socket = getSocket();
    socket?.emit("message:send", { conversationId, body, replyTo });
    socket?.emit("typing", { conversationId, isTyping: false });
  }

  function send() {
    const plaintext = text.trim();
    if (!plaintext) return;
    sendBody(plaintext, replyingTo?.id);
    setText("");
    setReplyingTo(null);
  }

  // A one-line label for a quoted message (name + snippet), media-aware.
  function quotedLabel(m: Message): { sender: string; text: string } {
    const sender = m.senderId === user?.id ? "You" : peer?.displayName || title || "";
    let body = displayBody(m);
    if (isVoiceBody(body)) body = "🎤 Voice message";
    else if (isImageBody(body)) body = "📷 Photo";
    else if (isVideoBody(body)) body = "🎥 Video";
    return { sender, text: body };
  }

  function scrollToMessage(id: number) {
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    try {
      listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.4 });
    } catch {
      /* onScrollToIndexFailed handles the retry */
    }
  }

  const [recordingVoice, setRecordingVoice] = useState(false);
  function sendVoice(base64: string, durationSec: number) {
    setRecordingVoice(false);
    sendBody(makeVoiceBody(base64, durationSec));
  }

  // ---- Photo / video sending ----
  async function handlePicked(asset: ImagePicker.ImagePickerAsset) {
    try {
      if (asset.type === "video") {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (b64.length > MAX_MEDIA_B64) {
          Alert.alert("Video too large", "Please send a shorter video (about 15–20 seconds max).");
          return;
        }
        sendBody(makeVideoBody(b64, (asset.duration || 0) / 1000));
      } else {
        const b64 =
          asset.base64 ||
          (await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          }));
        if (b64.length > MAX_MEDIA_B64) {
          Alert.alert("Photo too large", "This photo is too big to send.");
          return;
        }
        sendBody(makeImageBody(b64));
      }
    } catch {
      Alert.alert("Could not send", "Something went wrong reading that file.");
    }
  }

  // ---- Message editing & deleting (long-press a bubble) ----
  const [editing, setEditing] = useState<Message | null>(null);

  async function doDelete(messageId: number, scope: "everyone" | "me") {
    try {
      await api.deleteMessage(conversationId, messageId, scope);
      decCache.current.delete(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (editing?.id === messageId) cancelEdit();
    } catch (e: any) {
      Alert.alert("Could not delete", e.message || "Something went wrong.");
    }
  }

  function startEdit(m: Message, body: string) {
    setEditing(m);
    setText(body);
    setAttachOpen(false);
  }

  function cancelEdit() {
    setEditing(null);
    setText("");
  }

  async function saveEdit() {
    if (!editing) return;
    const plaintext = text.trim();
    if (!plaintext) return;
    const body =
      (user?.id != null && encryptMessage(plaintext, members, user.id)) || plaintext;
    try {
      const res = await api.editMessage(conversationId, editing.id, body);
      decCache.current.delete(editing.id);
      setMessages((prev) => prev.map((m) => (m.id === editing.id ? res.message : m)));
      cancelEdit();
    } catch (e: any) {
      Alert.alert("Could not edit", e.message || "Something went wrong.");
    }
  }

  // Long-press bottom sheet: emoji reactions on top + message actions below.
  const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  const [menuFor, setMenuFor] = useState<{ m: Message; body: string } | null>(null);

  function openMessageMenu(m: Message, body: string) {
    setMenuFor({ m, body });
  }

  async function react(messageId: number, emoji: string) {
    try {
      const res = await api.reactMessage(conversationId, messageId, emoji);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m))
      );
    } catch (e: any) {
      Alert.alert("Could not react", e.message || "Something went wrong.");
    }
  }

  // ---- Forwarding: re-encrypt the decrypted payload for the target chat ----
  const [forwardPayload, setForwardPayload] = useState<string | null>(null);
  const [forwardConvs, setForwardConvs] = useState<Conversation[]>([]);

  async function openForward(payload: string) {
    setForwardPayload(payload);
    try {
      const res = await api.listConversations();
      setForwardConvs(res.conversations);
    } catch {
      setForwardConvs([]);
    }
  }

  function forwardTitleFor(c: Conversation) {
    if (c.title) return c.title;
    const others = c.members.filter((m) => m.id !== user?.id);
    return others.map((o) => o.displayName).join(", ") || "Conversation";
  }

  async function doForward(target: Conversation) {
    const payload = forwardPayload;
    setForwardPayload(null);
    if (!payload) return;
    try {
      const mem = await api.conversationMembers(target.id);
      const body =
        (user?.id != null && encryptMessage(payload, mem.members, user.id)) || payload;
      const socket = getSocket();
      socket?.emit("message:send", { conversationId: target.id, body });
      if (target.id !== conversationId) {
        Alert.alert("Forwarded", `Sent to ${forwardTitleFor(target)}.`);
      }
    } catch (e: any) {
      Alert.alert("Could not forward", e.message || "Something went wrong.");
    }
  }

  // Aggregate raw reactions into chips: emoji → count, marking my own.
  function aggregateReactions(m: Message) {
    const byEmoji = new Map<string, { count: number; mine: boolean }>();
    for (const r of m.reactions || []) {
      const cur = byEmoji.get(r.emoji) || { count: 0, mine: false };
      cur.count += 1;
      if (r.userId === user?.id) cur.mine = true;
      byEmoji.set(r.emoji, cur);
    }
    return [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, ...v }));
  }

  // Attachment options live in an inline panel under the text bar (no popup).
  const [attachOpen, setAttachOpen] = useState(false);

  async function pickFromGallery() {
    setAttachOpen(false);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.6,
      base64: true,
      videoMaxDuration: 60,
    });
    if (!res.canceled && res.assets?.[0]) await handlePicked(res.assets[0]);
  }

  async function takePhoto() {
    setAttachOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true });
    if (!res.canceled && res.assets?.[0]) await handlePicked(res.assets[0]);
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
    <View style={[styles.container, { paddingBottom: keyboardHeight }]}>
      {encActive ? (
        <View style={styles.e2eeBanner}>
          <Text style={styles.e2eeText}>🔒 {t("chat.e2ee")}</Text>
        </View>
      ) : null}

      {pinned ? (
        <TouchableOpacity
          style={styles.pinnedBar}
          onPress={() => scrollToMessage(pinned.id)}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 15, marginRight: 8 }}>📌</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedTitle}>Pinned message</Text>
            <Text style={styles.pinnedText} numberOfLines={1}>
              {quotedLabel(pinned).text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => togglePin(pinned)} style={{ padding: 6 }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            try {
              listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.4 });
            } catch {
              /* give up quietly */
            }
          }, 300);
        }}
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          const body = displayBody(item);
          return (
            <View
              style={[
                styles.bubbleRow,
                mine ? styles.rowMine : styles.rowTheirs,
              ]}
            >
              <Pressable
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
                onLongPress={() => openMessageMenu(item, body)}
                delayLongPress={400}
              >
                {item.replyTo ? (
                  (() => {
                    const orig = messages.find((mm) => mm.id === item.replyTo);
                    const q = orig ? quotedLabel(orig) : null;
                    return (
                      <TouchableOpacity
                        style={[styles.quoteBlock, mine && styles.quoteBlockMine]}
                        onPress={() => item.replyTo && scrollToMessage(item.replyTo)}
                        disabled={!orig}
                      >
                        <Text style={[styles.quoteSender, mine && styles.quoteTextMine]} numberOfLines={1}>
                          {q ? q.sender : ""}
                        </Text>
                        <Text style={[styles.quoteText, mine && styles.quoteTextMine]} numberOfLines={1}>
                          {q ? q.text : "Message"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()
                ) : null}
                {isVoiceBody(body) && voiceAvailable ? (
                  <VoiceBubble
                    payload={body}
                    messageId={item.id}
                    mine={mine}
                    onLongPress={() => openMessageMenu(item, body)}
                  />
                ) : isVoiceBody(body) ? (
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    🎤 Voice message
                  </Text>
                ) : isImageBody(body) ? (
                  <ImageBubble payload={body} onLongPress={() => openMessageMenu(item, body)} />
                ) : isVideoBody(body) ? (
                  <VideoBubble
                    payload={body}
                    messageId={item.id}
                    mine={mine}
                    onLongPress={() => openMessageMenu(item, body)}
                  />
                ) : (
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {body}
                  </Text>
                )}
                {item.reactions?.length ? (
                  <View style={styles.reactChips}>
                    {aggregateReactions(item).map((r) => (
                      <TouchableOpacity
                        key={r.emoji}
                        style={[styles.reactChip, r.mine && styles.reactChipMine]}
                        onPress={() => react(item.id, r.emoji)}
                      >
                        <Text style={styles.reactChipText}>
                          {r.emoji}
                          {r.count > 1 ? ` ${r.count}` : ""}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <Text style={[styles.time, mine && styles.timeMine]}>
                  {(item.starred ? "⭐ " : "") +
                    (item.editedAt ? "edited · " : "") +
                    formatTime(item.createdAt)}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />

      {peerTyping ? <Text style={styles.typing}>typing…</Text> : null}

      {recordingVoice ? (
        <View style={{ paddingBottom: kbVisible ? 0 : Math.max(insets.bottom, 12), backgroundColor: colors.surface }}>
          <VoiceRecorderBar
            onCancel={() => setRecordingVoice(false)}
            onSend={sendVoice}
          />
        </View>
      ) : (
      <>
      {editing ? (
        <View style={styles.editBar}>
          <Text style={styles.editBarText} numberOfLines={1}>
            ✏️ Editing message
          </Text>
          <TouchableOpacity onPress={cancelEdit} style={{ padding: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : replyingTo ? (
        <View style={styles.editBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.editBarText} numberOfLines={1}>
              ↩️ Replying to {quotedLabel(replyingTo).sender}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
              {quotedLabel(replyingTo).text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View
        style={[
          styles.composer,
          { paddingBottom: kbVisible || attachOpen ? 8 : Math.max(insets.bottom + 8, 20) },
        ]}
      >
        <TouchableOpacity onPress={() => setAttachOpen((o) => !o)} style={styles.attachBtn}>
          <Text style={{ fontSize: 20 }}>{attachOpen ? "✕" : "📎"}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={t("chat.message")}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={onChangeText}
          multiline
          onSubmitEditing={editing ? saveEdit : send}
        />
        {editing ? (
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={saveEdit}
            disabled={!text.trim()}
          >
            <Text style={styles.sendText}>✓</Text>
          </TouchableOpacity>
        ) : text.trim() ? (
          <TouchableOpacity style={styles.sendBtn} onPress={send}>
            <Text style={styles.sendText}>➤</Text>
          </TouchableOpacity>
        ) : voiceAvailable ? (
          <TouchableOpacity style={styles.sendBtn} onPress={() => setRecordingVoice(true)}>
            <Text style={styles.sendText}>🎤</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.sendBtn, styles.sendBtnDisabled]} disabled>
            <Text style={styles.sendText}>➤</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Attachment options — an inline panel under the text bar. */}
      {attachOpen ? (
        <View
          style={[
            styles.attachPanel,
            { paddingBottom: kbVisible ? 10 : Math.max(insets.bottom + 10, 22) },
          ]}
        >
          <TouchableOpacity style={styles.attachOption} onPress={takePhoto}>
            <View style={styles.attachCircle}>
              <Text style={{ fontSize: 26 }}>📷</Text>
            </View>
            <Text style={styles.attachLabel}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachOption} onPress={pickFromGallery}>
            <View style={styles.attachCircle}>
              <Text style={{ fontSize: 26 }}>🖼</Text>
            </View>
            <Text style={styles.attachLabel}>Gallery</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </>
      )}

      {/* Long-press sheet: reactions row + message actions. */}
      {menuFor ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setMenuFor(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setMenuFor(null)}>
            <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 10, 22) }]}>
              <View style={styles.reactRow}>
                {REACTION_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={styles.reactBtn}
                    onPress={() => {
                      const id = menuFor.m.id;
                      setMenuFor(null);
                      react(id, e);
                    }}
                  >
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(() => {
                const mine = menuFor.m.senderId === user?.id;
                const editable =
                  mine &&
                  !isVoiceBody(menuFor.body) &&
                  !isImageBody(menuFor.body) &&
                  !isVideoBody(menuFor.body) &&
                  menuFor.body !== "🔒 …";
                return (
                  <>
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        setReplyingTo(menuFor.m);
                        setMenuFor(null);
                      }}
                    >
                      <Text style={styles.sheetItemText}>↩️ Reply</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        const m = menuFor.m;
                        setMenuFor(null);
                        toggleStar(m);
                      }}
                    >
                      <Text style={styles.sheetItemText}>
                        {menuFor.m.starred ? "☆ Unstar" : "⭐ Star"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        const m = menuFor.m;
                        setMenuFor(null);
                        togglePin(m);
                      }}
                    >
                      <Text style={styles.sheetItemText}>
                        {pinned?.id === menuFor.m.id ? "📌 Unpin" : "📌 Pin"}
                      </Text>
                    </TouchableOpacity>
                    {menuFor.body !== "🔒 …" ? (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          const payload = menuFor.body;
                          setMenuFor(null);
                          openForward(payload);
                        }}
                      >
                        <Text style={styles.sheetItemText}>↪️ Forward</Text>
                      </TouchableOpacity>
                    ) : null}
                    {editable ? (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          startEdit(menuFor.m, menuFor.body);
                          setMenuFor(null);
                        }}
                      >
                        <Text style={styles.sheetItemText}>✏️ Edit</Text>
                      </TouchableOpacity>
                    ) : null}
                    {mine ? (
                      <TouchableOpacity
                        style={styles.sheetItem}
                        onPress={() => {
                          const id = menuFor.m.id;
                          setMenuFor(null);
                          doDelete(id, "everyone");
                        }}
                      >
                        <Text style={[styles.sheetItemText, { color: colors.danger }]}>
                          🗑 Delete for everyone
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        const id = menuFor.m.id;
                        setMenuFor(null);
                        doDelete(id, "me");
                      }}
                    >
                      <Text style={styles.sheetItemText}>🗑 Delete for me</Text>
                    </TouchableOpacity>
                  </>
                );
              })()}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* Forward picker: choose which chat receives the message. */}
      {forwardPayload ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setForwardPayload(null)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setForwardPayload(null)}>
            <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 10, 22), maxHeight: "60%" }]}>
              <Text style={styles.sheetTitle}>Forward to…</Text>
              <FlatList
                data={forwardConvs}
                keyExtractor={(c) => String(c.id)}
                renderItem={({ item }) => {
                  const name = forwardTitleFor(item);
                  return (
                    <TouchableOpacity style={styles.forwardRow} onPress={() => doForward(item)}>
                      <View style={styles.forwardAvatar}>
                        <Text style={styles.forwardAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.sheetItemText}>{name}</Text>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: colors.textMuted, paddingVertical: 16 }}>No chats yet.</Text>
                }
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* Starred messages viewer. */}
      {starredOpen ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setStarredOpen(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setStarredOpen(false)}>
            <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 10, 22), maxHeight: "65%" }]}>
              <Text style={styles.sheetTitle}>⭐ Starred messages</Text>
              <FlatList
                data={starredMsgs}
                keyExtractor={(m) => String(m.id)}
                renderItem={({ item }) => {
                  const q = quotedLabel(item);
                  return (
                    <TouchableOpacity
                      style={styles.sheetItem}
                      onPress={() => {
                        setStarredOpen(false);
                        setTimeout(() => scrollToMessage(item.id), 250);
                      }}
                    >
                      <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: "700" }}>
                        {q.sender} · {formatTime(item.createdAt)}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 15 }} numberOfLines={2}>
                        {q.text}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: colors.textMuted, paddingVertical: 16 }}>
                    No starred messages yet. Long-press a message and tap ⭐ Star.
                  </Text>
                }
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
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
  attachBtn: {
    width: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  pinnedBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pinnedTitle: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
  pinnedText: { color: colors.textMuted, fontSize: 14 },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: 8,
    paddingVertical: 3,
    marginBottom: 5,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  quoteBlockMine: { borderLeftColor: "rgba(21,23,28,0.55)" },
  quoteSender: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
  quoteText: { fontSize: 13, color: colors.textMuted },
  quoteTextMine: { color: "rgba(21,23,28,0.65)" },
  reactChips: { flexDirection: "row", flexWrap: "wrap", marginTop: 6, gap: 4 },
  reactChip: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  reactChipMine: { borderColor: colors.primaryDark, backgroundColor: "rgba(0,0,0,0.14)" },
  reactChipText: { fontSize: 12, color: colors.text },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  reactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  reactBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetItem: { paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sheetItemText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 10 },
  forwardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  forwardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  forwardAvatarText: { color: colors.onPrimary, fontSize: 17, fontWeight: "800" },
  editBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  editBarText: { color: colors.primary, fontSize: 13, fontWeight: "600", flex: 1 },
  attachPanel: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    paddingTop: 14,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  attachOption: { alignItems: "center" },
  attachCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  attachLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});
