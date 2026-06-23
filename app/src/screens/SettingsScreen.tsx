import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/i18n";
import { languageName } from "../i18n/languages";
import { useTheme, useThemePref, type ThemeColors } from "../theme";

export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { t, lang } = useT();
  const colors = useTheme();
  const { pref } = useThemePref();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!user) return null;

  const themeLabel =
    pref === "light" ? t("theme.light") : pref === "dark" ? t("theme.dark") : t("theme.system");

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity style={styles.header} onPress={() => navigation.navigate("EditProfile")}>
        {user.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.displayName}</Text>
          <Text style={styles.phone}>{user.phone}</Text>
        </View>
        <Text style={styles.edit}>{t("settings.edit")} ›</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <MenuRow icon="👤" label={t("title.account")} onPress={() => navigation.navigate("Account")} />
        <MenuRow icon="💬" label={t("tab.chats")} onPress={() => navigation.navigate("ChatsSettings")} />
        <MenuRow icon="📂" label={t("title.storage")} onPress={() => navigation.navigate("StorageData")} />
        <MenuRow icon="🌐" label={t("title.language")} value={languageName(lang)} onPress={() => navigation.navigate("Language")} />
        <MenuRow icon="🎨" label={t("settings.theme")} value={themeLabel} onPress={() => navigation.navigate("Theme")} last />
      </View>

      <TouchableOpacity style={[styles.card, styles.logoutCard]} onPress={logout}>
        <Text style={styles.logoutText}>⎋  {t("settings.logout")}</Text>
      </TouchableOpacity>

      <Text style={styles.version}>{t("settings.version")}</Text>
    </ScrollView>
  );
}

function MenuRow({
  icon,
  label,
  value,
  onPress,
  last,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.row, last && { borderBottomWidth: 0 }]} onPress={onPress}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      margin: 16,
      borderRadius: 14,
      padding: 16,
    },
    avatar: { width: 64, height: 64, borderRadius: 32, marginRight: 14 },
    avatarPlaceholder: { backgroundColor: colors.primaryDark, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.onPrimary, fontSize: 28, fontWeight: "800" },
    name: { color: colors.text, fontSize: 20, fontWeight: "700" },
    phone: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
    edit: { color: colors.primary, fontSize: 14 },
    card: { backgroundColor: colors.surface, marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 16 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 15,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    icon: { fontSize: 18, width: 30 },
    rowLabel: { color: colors.text, fontSize: 16 },
    rowValue: { color: colors.textMuted, fontSize: 15, marginRight: 8 },
    chevron: { color: colors.textMuted, fontSize: 22 },
    logoutCard: { marginTop: 16, paddingVertical: 16 },
    logoutText: { color: colors.danger, fontSize: 16, fontWeight: "600" },
    version: { color: colors.textMuted, textAlign: "center", marginTop: 24, fontSize: 13 },
  });
