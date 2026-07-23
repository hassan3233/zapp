import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useTheme, type ThemeColors } from "../theme";
import { useT } from "../i18n/i18n";

export default function StorageDataScreen() {
  const colors = useTheme();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.section}>{t("storage.title")}</Text>
      <View style={styles.card}>
        <Row label={t("storage.messages")} value="2.4 MB" />
        <Row label={t("common.media")} value="0 MB" />
        <Row label={t("storage.cache")} value="1.1 MB" last />
      </View>
      <TouchableOpacity
        style={styles.action}
        onPress={() => Alert.alert(t("storage.manageTitle"), t("storage.cacheCleared"))}
      >
        <Text style={styles.actionText}>{t("storage.clearCache")}</Text>
      </TouchableOpacity>

      <Text style={styles.section}>{t("storage.network")}</Text>
      <View style={styles.card}>
        <Row label={t("storage.sent")} value="0.6 MB" />
        <Row label={t("storage.received")} value="1.8 MB" last />
      </View>

      <Text style={styles.section}>{t("storage.autoDownload")}</Text>
      <View style={styles.card}>
        <Row label={t("storage.mobileData")} value={t("storage.photos")} />
        <Row label={t("storage.wifi")} value={t("storage.allMedia")} last />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    section: { color: colors.textMuted, fontSize: 13, marginLeft: 6, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
    card: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16 },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    label: { color: colors.text, fontSize: 15 },
    value: { color: colors.textMuted, fontSize: 15 },
    action: { backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12 },
    actionText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  });
