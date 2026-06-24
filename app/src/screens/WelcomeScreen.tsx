import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Logo from "../components/Logo";
import { useT } from "../i18n/i18n";
import { WELCOME_GREETINGS } from "../i18n/greetings";
import { requestOnboardingPermissions } from "../utils/permissions";
import { useTheme, type ThemeColors } from "../theme";

export default function WelcomeScreen({ navigation }: any) {
  const { t } = useT();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  // Ask for contacts + location (native OS dialogs) right after Get started,
  // then continue to phone entry regardless of the user's choice.
  async function onGetStarted() {
    if (busy) return;
    setBusy(true);
    try {
      await requestOnboardingPermissions();
    } finally {
      setBusy(false);
      navigation.navigate("Phone");
    }
  }

  // Cross-fade through "Welcome" in many languages.
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setIdx((i) => (i + 1) % WELCOME_GREETINGS.length);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();
      });
    }, 1800);
    return () => clearInterval(id);
  }, [opacity]);

  const g = WELCOME_GREETINGS[idx];

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom + 24, 72) }]}>
      <View style={styles.top}>
        <Logo size={120} wordmarkSize={30} />
        <Text style={styles.tagline}>{t("welcome.tagline")}</Text>
      </View>

      <Animated.View style={[styles.greetingWrap, { opacity }]}>
        <Text style={[styles.greeting, { writingDirection: g.rtl ? "rtl" : "ltr" }]}>
          {g.text}
        </Text>
        <Text style={styles.greetingLang}>{g.name}</Text>
      </Animated.View>

      <TouchableOpacity style={[styles.button, busy && styles.buttonDisabled]} onPress={onGetStarted} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>{t("welcome.getStarted")}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 28,
    paddingTop: 90,
    paddingBottom: 48,
    justifyContent: "space-between",
  },
  top: { alignItems: "center" },
  tagline: { color: colors.textMuted, fontSize: 15, marginTop: 14, letterSpacing: 0.3 },
  greetingWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
  greeting: { color: colors.text, fontSize: 40, fontWeight: "800", textAlign: "center" },
  greetingLang: { color: colors.primary, fontSize: 15, marginTop: 12, fontWeight: "600" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.onPrimary, fontWeight: "800", fontSize: 17 },
});
