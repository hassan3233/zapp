import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { getSocket } from "../socket";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";
import { ensureKeys, decryptMessage, isEncrypted } from "../crypto/e2ee";
import { isVoiceBody } from "../components/VoiceMessage";
import { isImageBody, isVideoBody } from "../components/MediaMessage";

// Media bodies are huge base64 blobs — show a friendly label instead.
function mediaLabel(body: string): string | null {
  if (isVoiceBody(body)) return "🎤 Voice message";
  if (isImageBody(body)) return "📷 Photo";
  if (isVideoBody(body)) return "🎥 Video";
  return null;
}
import { usePresence } from "../net/PresenceContext";
import type { Conversation, Message } from "../types";

export default function ConversationsScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isOnline } = usePresence();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [, setKeysReady] = useState(false);

  // ---- Message search (client-side: messages are E2EE, so we decrypt and
  // match on the device — the server only ever sees ciphertext). ----
  type SearchResult =
    | { kind: "conv"; conv: Conversation }
    | { kind: "msg"; conv: Conversation; id: number; body: string; createdAt: string; mine: boolean };
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Decrypted messages per conversation, fetched lazily on first search.
  const msgCache = useRef<Map<number, { id: number; body: string; createdAt: string; mine: boolean }[]>>(
    new Map()
  );
  const searchSeq = useRef(0);

  // Load our keys so encrypted previews can be decrypted (re-render when ready).
  useEffect(() => {
    ensureKeys().then(() => setKeysReady(true)).catch(() => {});
  }, []);

  function preview(c: Conversation): string {
    if (!c.lastMessage) return t("conv.noMessages");
    const raw = c.lastMessage.body;
    let body = isEncrypted(raw)
      ? decryptMessage(raw, user?.id ?? -1) ?? "🔒 …"
      : raw;
    body = mediaLabel(body) ?? body;
    return (c.lastMessage.senderId === user?.id ? t("conv.you") : "") + body;
  }

  const load = useCallback(async () => {
    try {
      const res = await api.listConversations();
      setConversations(res.conversations);
      // New messages may exist — refetch on the next search.
      msgCache.current.clear();
    } catch {
      // ignore; pull-to-refresh will retry
    }
  }, []);

  // Reload whenever the screen regains focus (e.g. returning from a chat).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Live-update the list ordering/preview when any message arrives.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = (_msg: Message) => load();
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [load]);

  // Header buttons
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("NewChat")}
          style={styles.headerBtn}
        >
          <Text style={styles.headerBtnText}>＋</Text>
        </TouchableOpacity>
      ),
      // Logout lives in the Settings tab now.
    });
  }, [navigation]);

  function titleFor(c: Conversation) {
    if (c.title) return c.title;
    const others = c.members.filter((m) => m.id !== user?.id);
    return others.map((o) => o.displayName).join(", ") || "Conversation";
  }

  // Run the search (debounced) whenever the query changes.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      // Make sure every conversation's recent messages are cached (decrypted).
      for (const c of conversations) {
        if (msgCache.current.has(c.id)) continue;
        try {
          const res = await api.listMessages(c.id);
          msgCache.current.set(
            c.id,
            res.messages.map((m) => {
              let body = isEncrypted(m.body)
                ? decryptMessage(m.body, user?.id ?? -1) ?? ""
                : m.body;
              // Media is searchable by label, not by raw bytes.
              body = mediaLabel(body) ?? body;
              return {
                id: m.id,
                createdAt: m.createdAt,
                mine: m.senderId === user?.id,
                body,
              };
            })
          );
        } catch {
          msgCache.current.set(c.id, []);
        }
        if (seq !== searchSeq.current) return; // a newer search superseded us
      }
      if (seq !== searchSeq.current) return;

      const out: SearchResult[] = [];
      for (const c of conversations) {
        if (titleFor(c).toLowerCase().includes(q)) out.push({ kind: "conv", conv: c });
      }
      outer: for (const c of conversations) {
        for (const m of msgCache.current.get(c.id) || []) {
          if (m.body.toLowerCase().includes(q)) {
            out.push({ kind: "msg", conv: c, ...m });
            if (out.length >= 60) break outer;
          }
        }
      }
      setResults(out);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, conversations, user?.id]);

  function fmtWhen(iso: string) {
    const d = new Date(iso.replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function openConversation(c: Conversation) {
    navigation.navigate("Chat", {
      conversationId: c.id,
      title: titleFor(c),
      peer: !c.isGroup ? c.members[0] : undefined,
    });
  }

  const showingSearch = query.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* faint bolt-in-bubble watermark behind the chat list */}
      <Image
        source={require("../../assets/logo.png")}
        style={styles.watermark}
      />

      {/* Search bar: matches chat names and message text (decrypted locally). */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search messages"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} style={styles.searchClear}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showingSearch ? (
        <FlatList
          data={results}
          keyExtractor={(r) => (r.kind === "conv" ? "c" + r.conv.id : "m" + r.id)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptySub}>
                {searching ? "Searching…" : "No matches."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const name = titleFor(item.conv);
            if (item.kind === "conv") {
              return (
                <TouchableOpacity style={styles.row} onPress={() => openConversation(item.conv)}>
                  <View style={styles.avatarWrap}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{name}</Text>
                    <Text style={styles.rowPreview} numberOfLines={1}>Chat</Text>
                  </View>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity style={styles.row} onPress={() => openConversation(item.conv)}>
                <View style={styles.rowBody}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{name}</Text>
                    <Text style={styles.resultTime}>{fmtWhen(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.rowPreview} numberOfLines={2}>
                    {(item.mine ? "You: " : "") + item.body}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
      <FlatList
        data={conversations}
        keyExtractor={(c) => String(c.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.textMuted}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t("conv.empty")}</Text>
            <Text style={styles.emptySub}>{t("conv.emptySub")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = titleFor(item);
          const other = item.members.find((m) => m.id !== user?.id);
          const showDot = !item.isGroup && isOnline(other?.id);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate("Chat", {
                  conversationId: item.id,
                  title: name,
                  // 1:1 chats carry the peer so the chat can place a call
                  peer: !item.isGroup ? item.members[0] : undefined,
                })
              }
            >
              <View style={styles.avatarWrap}>
                {item.members[0]?.avatar ? (
                  <Image
                    source={{ uri: item.members[0].avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                {showDot ? <View style={styles.onlineDot} /> : null}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {preview(item)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  watermark: {
    position: "absolute",
    alignSelf: "center",
    top: "30%",
    width: 280,
    height: 280,
    opacity: 0.04,
    resizeMode: "contain",
    zIndex: -1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatarWrap: { marginRight: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onPrimary, fontSize: 20, fontWeight: "800" },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2ecc71",
    borderWidth: 2,
    borderColor: colors.bg,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  rowPreview: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyText: { color: colors.text, fontSize: 16 },
  emptySub: { color: colors.textMuted, marginTop: 6 },
  headerBtn: { paddingHorizontal: 14 },
  headerBtnText: { color: colors.primary, fontSize: 26, fontWeight: "700" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 9 },
  searchClear: { padding: 6 },
  resultTime: { color: colors.textMuted, fontSize: 12, marginLeft: 8 },
});
