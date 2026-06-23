import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useCall } from "../call/CallContext";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";
import type { Call } from "../types";

export default function CallsScreen() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { startCall } = useCall();
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const load = useCallback(async () => {
    try {
      const res = await api.listCalls();
      setCalls(res.calls);
    } catch {
      /* ignore */
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function subtitle(c: Call) {
    const arrow = c.outgoing ? "↗" : "↙";
    const kind =
      c.status === "missed" || c.status === "canceled"
        ? "Missed"
        : c.outgoing
        ? "Outgoing"
        : "Incoming";
    const when = new Date(c.startedAt.replace(" ", "T") + "Z").toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${arrow} ${kind} · ${when}`;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={calls}
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
            <Text style={styles.emptyText}>{t("calls.empty")}</Text>
            <Text style={styles.emptySub}>{t("calls.emptySub")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const missed = item.status === "missed" || item.status === "canceled";
          return (
            <View style={styles.row}>
              {item.other?.avatar ? (
                <Image source={{ uri: item.other.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(item.other?.displayName || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.body}>
                <Text style={[styles.name, missed && { color: colors.danger }]} numberOfLines={1}>
                  {item.other?.displayName || "Unknown"}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {subtitle(item)}
                </Text>
              </View>
              {item.other ? (
                <TouchableOpacity
                  onPress={() => startCall(item.other!, item.media)}
                  style={styles.callBtn}
                >
                  <Text style={styles.callIcon}>{item.media === "video" ? "📹" : "📞"}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: colors.onPrimary, fontSize: 18, fontWeight: "800" },
  body: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: "600" },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  callBtn: { padding: 10 },
  callIcon: { fontSize: 20 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyText: { color: colors.text, fontSize: 16 },
  emptySub: { color: colors.textMuted, marginTop: 6 },
});
