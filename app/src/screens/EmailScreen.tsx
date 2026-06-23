import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";

export default function EmailScreen({ navigation }: any) {
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function next(withEmail: string | null) {
    if (withEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(withEmail)) {
      setError("Please enter a valid email, or skip.");
      return;
    }
    navigation.navigate("ProfileSetup", { email: withEmail });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>{t("email.title")}</Text>
        <Text style={styles.subtitle}>{t("email.sub")}</Text>

        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          value={email}
          onChangeText={setEmail}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={() => next(email.trim())}>
          <Text style={styles.buttonText}>{t("common.continue")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={() => next(null)}>
          <Text style={styles.skipText}>{t("email.skip")}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, textAlign: "center" },
  subtitle: { color: colors.textMuted, textAlign: "center", marginTop: 10, marginBottom: 24 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: { color: colors.onPrimary, fontWeight: "800", fontSize: 16 },
  skipBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  skipText: { color: colors.textMuted, fontSize: 15 },
  error: { color: colors.danger, marginTop: 12, textAlign: "center" },
});
