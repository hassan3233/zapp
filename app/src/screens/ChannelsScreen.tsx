import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";
import type { Channel } from "../types";

// Broadcast channels: the ones you follow, plus everything else to discover.
// Posts are not end-to-end encrypted (a broadcast can't re-wrap the key per
// subscriber), which the channel screen states outright.
export default function ChannelsScreen({ navigation }: any) {
  const colors = useTheme();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (q?: string) => {
    try {
      const res = await api.listChannels(q);
      setChannels(res.channels);
    } catch {
      /* offline — keep whatever we have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(query);
    }, [load, query])
  );

  const mine = channels.filter((c) => c.subscribed);
  const discover = channels.filter((c) => !c.subscribed);

  function open(c: Channel) {
    navigation.navigate("Chat", {
      conversationId: c.id,
      title: c.title,
      isChannel: true,
      isOwner: !!c.isOwner,
    });
  }

  async function toggleSubscribe(c: Channel) {
    try {
      if (c.subscribed) await api.unsubscribeChannel(c.id);
      else await api.subscribeChannel(c.id);
      load(query);
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || "");
    }
  }

  async function create() {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    try {
      const res = await api.createChannel(title, newDesc.trim() || undefined);
      setCreating(false);
      setNewTitle("");
      setNewDesc("");
      await load();
      open(res.channel);
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || "");
    } finally {
      setBusy(false);
    }
  }

  const renderChannel = (c: Channel) => (
    <TouchableOpacity style={styles.row} onPress={() => open(c)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>📢</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {c.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {c.description
            ? c.description
            : t("channel.subscriberCount", { count: String(c.subscribers) })}
        </Text>
      </View>
      {c.isOwner ? (
        <Text style={styles.ownerTag}>{t("channel.owner")}</Text>
      ) : (
        <TouchableOpacity
          style={[styles.subBtn, c.subscribed && styles.subBtnOn]}
          onPress={() => toggleSubscribe(c)}
        >
          <Text style={[styles.subBtnText, c.subscribed && styles.subBtnTextOn]}>
            {c.subscribed ? t("channel.unsubscribe") : t("channel.subscribe")}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const sections: Array<{ key: string; header: string; data: Channel[] }> = [];
  if (mine.length) sections.push({ key: "mine", header: t("channel.mine"), data: mine });
  if (discover.length)
    sections.push({ key: "discover", header: t("channel.discover"), data: discover });

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.search}
          placeholder={t("channel.search")}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            load(v);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={sections}
        keyExtractor={(s) => s.key}
        contentContainerStyle={{ paddingBottom: 90 }}
        ListEmptyComponent={
          !loaded ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📢</Text>
              <Text style={styles.emptyText}>{t("channel.empty")}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View>
            <Text style={styles.section}>{item.header}</Text>
            <View style={styles.card}>{item.data.map((c) => (
              <View key={c.id}>{renderChannel(c)}</View>
            ))}</View>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setCreating(true)}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <Modal
        transparent
        visible={creating}
        animationType="fade"
        onRequestClose={() => setCreating(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setCreating(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t("channel.create")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("channel.name")}
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
              maxLength={60}
            />
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
              placeholder={t("channel.descriptionHint")}
              placeholderTextColor={colors.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
              maxLength={200}
            />
            <Text style={styles.note}>ℹ️ {t("channel.notEncrypted")}</Text>
            <View style={styles.sheetRow}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setCreating(false)}>
                <Text style={styles.ghostText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (!newTitle.trim() || busy) && { opacity: 0.5 }]}
                onPress={create}
                disabled={!newTitle.trim() || busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.primaryText}>{t("channel.create")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 24,
      margin: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: { fontSize: 16, marginRight: 8 },
    search: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
    section: {
      color: colors.textMuted,
      fontSize: 13,
      marginLeft: 18,
      marginTop: 14,
      marginBottom: 8,
      textTransform: "uppercase",
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      marginHorizontal: 12,
      paddingHorizontal: 14,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      gap: 12,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 22 },
    title: { color: colors.text, fontSize: 16, fontWeight: "600" },
    sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    ownerTag: { color: colors.textMuted, fontSize: 12 },
    subBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    subBtnOn: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
    subBtnText: { color: colors.onPrimary, fontWeight: "700", fontSize: 13 },
    subBtnTextOn: { color: colors.textMuted },
    empty: { alignItems: "center", marginTop: 64, paddingHorizontal: 32 },
    emptyIcon: { fontSize: 44, marginBottom: 12 },
    emptyText: { color: colors.textMuted, textAlign: "center" },
    fab: {
      position: "absolute",
      right: 20,
      bottom: 24,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      elevation: 4,
    },
    fabText: { color: colors.onPrimary, fontSize: 30, fontWeight: "700" },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      padding: 24,
    },
    sheet: { backgroundColor: colors.surface, borderRadius: 16, padding: 20 },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 14 },
    input: {
      backgroundColor: colors.bg,
      color: colors.text,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    note: { color: colors.textMuted, fontSize: 12, marginBottom: 14 },
    sheetRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    ghostBtn: { paddingHorizontal: 16, paddingVertical: 11 },
    ghostText: { color: colors.textMuted, fontWeight: "600" },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 11,
      minWidth: 96,
      alignItems: "center",
    },
    primaryText: { color: colors.onPrimary, fontWeight: "700" },
  });
