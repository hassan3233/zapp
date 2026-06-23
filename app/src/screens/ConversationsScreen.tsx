import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
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

  // Load our keys so encrypted previews can be decrypted (re-render when ready).
  useEffect(() => {
    ensureKeys().then(() => setKeysReady(true)).catch(() => {});
  }, []);

  function preview(c: Conversation): string {
    if (!c.lastMessage) return t("conv.noMessages");
    const raw = c.lastMessage.body;
    const body = isEncrypted(raw)
      ? decryptMessage(raw, user?.id ?? -1) ?? "🔒 …"
      : raw;
    return (c.lastMessage.senderId === user?.id ? t("conv.you") : "") + body;
  }

  const load = useCallback(async () => {
    try {
      const res = await api.listConversations();
      setConversations(res.conversations);
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

  return (
    <View style={styles.container}>
      {/* faint bolt-in-bubble watermark behind the chat list */}
      <Image
        source={require("../../assets/logo.png")}
        style={styles.watermark}
      />
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
});
