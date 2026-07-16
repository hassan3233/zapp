import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from "react-native";
import { api } from "../api";
import { useTheme, type ThemeColors } from "../theme";
import type { User } from "../types";

// Full profile of a chat partner: photo, name, phone, bio, date of birth,
// plus a ⋮ menu (top right) with Block and Report.
export default function ContactProfileScreen({ route, navigation }: any) {
  const initial: User = route.params.user;
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [user, setUser] = useState<User>(initial);
  const [blocked, setBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Refresh from the server (bio may be newer than what the chat passed in).
  useEffect(() => {
    let active = true;
    api
      .getUser(initial.id)
      .then((res) => {
        if (active) {
          setUser(res.user);
          setBlocked(res.blockedByMe);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [initial.id]);

  // ⋮ menu button in the header.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={{ paddingHorizontal: 12 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>⋮</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors]);

  function doBlockToggle() {
    setMenuOpen(false);
    if (blocked) {
      api
        .unblockUser(user.id)
        .then(() => setBlocked(false))
        .catch((e) => Alert.alert("Error", e.message || "Could not unblock"));
      return;
    }
    Alert.alert(
      `Block ${user.displayName}?`,
      "They will no longer be able to message or call you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () =>
            api
              .blockUser(user.id)
              .then(() => setBlocked(true))
              .catch((e) => Alert.alert("Error", e.message || "Could not block")),
        },
      ]
    );
  }

  function doReport() {
    setMenuOpen(false);
    Alert.alert(
      `Report ${user.displayName}?`,
      "This account will be reported for abuse.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Report",
          style: "destructive",
          onPress: () =>
            api
              .reportUser(user.id)
              .then(() => Alert.alert("Thank you", "The report was submitted."))
              .catch((e) => Alert.alert("Error", e.message || "Could not report")),
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {user.avatar ? (
        <Image source={{ uri: user.avatar }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>
            {(user.displayName || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.name}>{user.displayName}</Text>
      {blocked ? <Text style={styles.blockedBadge}>⛔ Blocked</Text> : null}

      <View style={styles.card}>
        <InfoRow styles={styles} label="Phone" value={user.phone} />
        <InfoRow styles={styles} label="Bio" value={user.bio || "—"} />
        <InfoRow styles={styles} label="Date of birth" value={user.dateOfBirth || "—"} last />
      </View>

      {/* ⋮ dropdown */}
      <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            <TouchableOpacity style={styles.menuItem} onPress={doReport}>
              <Text style={[styles.menuText, { color: colors.danger }]}>Report</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={doBlockToggle}>
              <Text style={styles.menuText}>{blocked ? "Unblock" : "Block"}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({
  styles,
  label,
  value,
  last,
}: {
  styles: any;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { alignItems: "center", padding: 24, paddingBottom: 48 },
    avatar: { width: 120, height: 120, borderRadius: 60 },
    avatarPlaceholder: {
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: { color: colors.onPrimary, fontSize: 44, fontWeight: "800" },
    name: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 14 },
    blockedBadge: { color: colors.danger, marginTop: 6, fontWeight: "600" },
    card: {
      alignSelf: "stretch",
      backgroundColor: colors.surface,
      borderRadius: 14,
      marginTop: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    row: { paddingHorizontal: 16, paddingVertical: 13 },
    rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    rowLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 3 },
    rowValue: { color: colors.text, fontSize: 16 },
    menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
    menu: {
      position: "absolute",
      top: 56,
      right: 12,
      minWidth: 160,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      elevation: 6,
    },
    menuItem: { paddingHorizontal: 18, paddingVertical: 14 },
    menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    menuText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  });
