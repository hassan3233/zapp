import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnline } from "../net/NetworkContext";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";

export default function OfflineBanner() {
  const online = useOnline();
  const { t } = useT();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (online) return null;

  return (
    <View style={[styles.bar, { paddingTop: (insets.top || 0) + 8 }]}>
      {/* Wi-Fi glyph with a "!" badge = connected sign, no internet */}
      <View style={styles.iconWrap}>
        <Text style={styles.wifi}>📶</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>!</Text>
        </View>
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {t("net.offline")}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.danger,
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    iconWrap: { width: 26, height: 22, marginRight: 12, justifyContent: "center" },
    wifi: { fontSize: 18, color: "#fff" },
    badge: {
      position: "absolute",
      right: -4,
      bottom: -4,
      minWidth: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    badgeText: { color: colors.danger, fontSize: 10, fontWeight: "900", lineHeight: 12 },
    text: { color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 },
  });
