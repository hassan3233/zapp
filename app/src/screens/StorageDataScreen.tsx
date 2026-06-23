import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useTheme, type ThemeColors } from "../theme";

export default function StorageDataScreen() {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.section}>Storage</Text>
      <View style={styles.card}>
        <Row label="Messages" value="2.4 MB" />
        <Row label="Media" value="0 MB" />
        <Row label="Cache" value="1.1 MB" last />
      </View>
      <TouchableOpacity
        style={styles.action}
        onPress={() => Alert.alert("Manage storage", "Cache cleared.")}
      >
        <Text style={styles.actionText}>Clear cache</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Network usage</Text>
      <View style={styles.card}>
        <Row label="Sent" value="0.6 MB" />
        <Row label="Received" value="1.8 MB" last />
      </View>

      <Text style={styles.section}>Media auto-download</Text>
      <View style={styles.card}>
        <Row label="Mobile data" value="Photos" />
        <Row label="Wi-Fi" value="All media" last />
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
