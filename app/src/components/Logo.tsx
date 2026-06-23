import React, { useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme, type ThemeColors } from "../theme";

// The bolt-in-bubble mark, optionally with the "Zapp Chat" wordmark.
export default function Logo({
  size = 96,
  showWordmark = true,
  wordmarkSize = 26,
}: {
  size?: number;
  showWordmark?: boolean;
  wordmarkSize?: number;
}) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Image
        source={require("../../assets/logo.png")}
        style={{ width: size, height: size, resizeMode: "contain" }}
      />
      {showWordmark ? (
        <Text style={[styles.wordmark, { fontSize: wordmarkSize }]}>
          Zapp <Text style={styles.chat}>Chat</Text>
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  wrap: { alignItems: "center" },
  wordmark: { color: colors.text, fontWeight: "800", marginTop: 10, letterSpacing: 0.5 },
  chat: { color: colors.primary },
});
