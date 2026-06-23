import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useT } from "../i18n/i18n";
import { useTheme, useThemePref, type ThemeColors, type ThemePref } from "../theme";

export default function ThemeScreen() {
  const { t } = useT();
  const colors = useTheme();
  const { pref, setPref } = useThemePref();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const options: { key: ThemePref; label: string; sub: string }[] = [
    { key: "system", label: t("theme.system"), sub: t("theme.systemSub") },
    { key: "light", label: t("theme.light"), sub: t("theme.lightSub") },
    { key: "dark", label: t("theme.dark"), sub: t("theme.darkSub") },
  ];

  return (
    <View style={styles.container}>
      {options.map((o) => {
        const sel = pref === o.key;
        return (
          <TouchableOpacity key={o.key} style={styles.row} onPress={() => setPref(o.key)}>
            {o.key === "system" ? (
              <View style={[styles.swatch, styles.swatchRow]}>
                <View style={[styles.half, { backgroundColor: "#FFFFFF" }]} />
                <View style={[styles.half, { backgroundColor: "#000000" }]} />
              </View>
            ) : (
              <View
                style={[styles.swatch, { backgroundColor: o.key === "light" ? "#FFFFFF" : "#000000" }]}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{o.label}</Text>
              <Text style={styles.sub}>{o.sub}</Text>
            </View>
            {sel ? <Text style={styles.check}>✓</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 8 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 16,
      borderWidth: 1,
      borderColor: colors.textMuted,
      overflow: "hidden",
    },
    swatchRow: { flexDirection: "row" },
    half: { flex: 1, height: "100%" },
    label: { color: colors.text, fontSize: 16, fontWeight: "600" },
    sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    check: { color: colors.primary, fontSize: 20, fontWeight: "800", marginLeft: 10 },
  });
