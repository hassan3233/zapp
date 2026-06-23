import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useTheme, type ThemeColors } from "../theme";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!user) return null;

  const memberSince = "—"; // server could expose created_at later

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.section}>Account info</Text>
      <View style={styles.card}>
        <Row label="Phone number" value={user.phone} />
        <Row label="Name" value={user.displayName} />
        <Row label="Member since" value={memberSince} last />
      </View>

      <Text style={styles.section}>Security</Text>
      <View style={styles.card}>
        <RowAction label="Two-step verification" hint="Off" onPress={() => Alert.alert("Two-step verification", "Coming soon.")} />
        <RowAction label="Blocked contacts" hint="0" onPress={() => Alert.alert("Blocked contacts", "No blocked contacts.")} last />
      </View>

      <TouchableOpacity
        style={[styles.card, styles.danger]}
        onPress={() =>
          Alert.alert("Delete account", "This will permanently delete your account.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: logout },
          ])
        }
      >
        <Text style={styles.dangerText}>Delete my account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function RowAction({ label, hint, onPress, last }: { label: string; hint?: string; onPress: () => void; last?: boolean }) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.row, last && { borderBottomWidth: 0 }]} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint} ›</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    section: { color: colors.textMuted, fontSize: 13, marginLeft: 6, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
    card: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    label: { color: colors.text, fontSize: 15 },
    value: { color: colors.textMuted, fontSize: 15, maxWidth: "60%" },
    hint: { color: colors.textMuted, fontSize: 15 },
    danger: { marginTop: 24, alignItems: "center", paddingVertical: 16 },
    dangerText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
  });
