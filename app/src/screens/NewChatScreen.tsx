import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { api } from "../api";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";
import type { User } from "../types";

export default function NewChatScreen({ navigation }: any) {
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // group mode
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<User[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchUsers(query.trim());
        if (active) setResults(res.users);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  async function startChat(u: User) {
    try {
      const res = await api.openConversation(u.id);
      navigation.replace("Chat", {
        conversationId: res.conversation.id,
        title: u.displayName,
        peer: u,
      });
    } catch (e: any) {
      alert(e.message || "Could not start chat");
    }
  }

  function toggleSelect(u: User) {
    setSelected((cur) =>
      cur.find((x) => x.id === u.id)
        ? cur.filter((x) => x.id !== u.id)
        : [...cur, u]
    );
  }

  async function createGroup() {
    if (!groupName.trim() || selected.length < 1) return;
    setCreating(true);
    try {
      const res = await api.createGroup(groupName.trim(), selected.map((u) => u.id));
      navigation.replace("Chat", {
        conversationId: res.conversation.id,
        title: res.conversation.title,
      });
    } catch (e: any) {
      alert(e.message || "Could not create group");
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, !groupMode && styles.modeActive]}
          onPress={() => setGroupMode(false)}
        >
          <Text style={[styles.modeText, !groupMode && styles.modeTextActive]}>{t("newchat.direct")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, groupMode && styles.modeActive]}
          onPress={() => setGroupMode(true)}
        >
          <Text style={[styles.modeText, groupMode && styles.modeTextActive]}>{t("newchat.group")}</Text>
        </TouchableOpacity>
      </View>

      {groupMode ? (
        <TextInput
          style={styles.input}
          placeholder={t("newchat.groupName")}
          placeholderTextColor={colors.textMuted}
          value={groupName}
          onChangeText={setGroupName}
        />
      ) : null}

      <TextInput
        style={styles.input}
        placeholder={t("newchat.search")}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        value={query}
        onChangeText={setQuery}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(u) => String(u.id)}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query ? t("newchat.noUsers") : t("newchat.typeToSearch")}
            </Text>
          }
          renderItem={({ item }) => {
            const isSel = !!selected.find((x) => x.id === item.id);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => (groupMode ? toggleSelect(item) : startChat(item))}
              >
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {item.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  <Text style={styles.username}>{item.phone}</Text>
                </View>
                {groupMode ? (
                  <View style={[styles.check, isSel && styles.checkOn]}>
                    {isSel ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {groupMode ? (
        <TouchableOpacity
          style={[
            styles.createBtn,
            (!groupName.trim() || selected.length < 1 || creating) && { opacity: 0.5 },
          ]}
          onPress={createGroup}
          disabled={!groupName.trim() || selected.length < 1 || creating}
        >
          {creating ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.createText}>
              {t("newchat.create")}{selected.length ? ` (${selected.length})` : ""}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeActive: { backgroundColor: colors.bubbleMine, borderColor: colors.primary },
  modeText: { color: colors.textMuted, fontWeight: "700" },
  modeTextActive: { color: colors.onPrimary },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: colors.onPrimary, fontSize: 18, fontWeight: "800" },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  username: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 30 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.onPrimary, fontWeight: "900" },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  createText: { color: colors.onPrimary, fontWeight: "800", fontSize: 16 },
});
