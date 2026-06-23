import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Switch } from "react-native";
import { getChatPrefs, setChatPrefs, ChatPrefs } from "../settings/prefs";
import { useTheme, type ThemeColors } from "../theme";

export default function ChatsSettingsScreen() {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [prefs, setPrefs] = useState<ChatPrefs>({
    enterIsSend: true,
    mediaAutoDownload: true,
    readReceipts: true,
  });

  useEffect(() => {
    getChatPrefs().then(setPrefs);
  }, []);

  function update(patch: Partial<ChatPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setChatPrefs(next);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.section}>Messaging</Text>
      <View style={styles.card}>
        <ToggleRow
          label="Enter is send"
          desc="Pressing Enter sends the message"
          value={prefs.enterIsSend}
          onChange={(v) => update({ enterIsSend: v })}
        />
        <ToggleRow
          label="Read receipts"
          desc="Others see when you've read messages"
          value={prefs.readReceipts}
          onChange={(v) => update({ readReceipts: v })}
          last
        />
      </View>

      <Text style={styles.section}>Media</Text>
      <View style={styles.card}>
        <ToggleRow
          label="Auto-download media"
          desc="Photos download automatically"
          value={prefs.mediaAutoDownload}
          onChange={(v) => update({ mediaAutoDownload: v })}
          last
        />
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onChange,
  last,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.label}>{label}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primaryDark }}
        thumbColor={value ? colors.primary : "#888"}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    section: { color: colors.textMuted, fontSize: 13, marginLeft: 6, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
    card: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16 },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    label: { color: colors.text, fontSize: 15 },
    desc: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  });
