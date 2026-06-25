import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../auth/AuthContext";
import { confirmCode, startPhoneSignIn } from "../auth/phoneAuth";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";

const RESEND_SECONDS = 60;

export default function OtpScreen({ route, navigation }: any) {
  const { phone, devCode, firebase } = route.params || {};
  const { verifyOtp, requestOtp, loginWithFirebaseToken } = useAuth();
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [hintCode, setHintCode] = useState<string | undefined>(devCode);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown that gates both delivery options after each send.
  useEffect(() => {
    timer.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1 && timer.current) clearInterval(timer.current);
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function restartCountdown() {
    setSecondsLeft(RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1 && timer.current) clearInterval(timer.current);
        return s - 1;
      });
    }, 1000);
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      // Returns profileComplete; RootNavigator switches stacks based on auth state.
      if (firebase) {
        const idToken = await confirmCode(code.trim());
        await loginWithFirebaseToken(idToken);
      } else {
        await verifyOtp(phone, code.trim());
      }
    } catch (e: any) {
      setError(e.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function send(channel: "sms" | "call") {
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      if (firebase) {
        // Firebase only does SMS; re-send the code.
        await startPhoneSignIn(phone);
        setInfo(t("otp.smsMsg"));
      } else {
        const dc = await requestOtp(phone, channel);
        setHintCode(dc);
        setInfo(channel === "call" ? t("otp.callMsg") : t("otp.smsMsg"));
      }
      restartCountdown();
    } catch (e: any) {
      setError(e.message || "Could not resend");
    } finally {
      setSending(false);
    }
  }

  const canResend = secondsLeft <= 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>{t("otp.title")}</Text>
        <Text style={styles.subtitle}>
          {t("otp.sub")}{"\n"}
          <Text style={styles.phone}>{phone}</Text>
        </Text>

        <TextInput
          style={styles.input}
          placeholder="123456"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          value={code}
          onChangeText={setCode}
        />

        {hintCode ? (
          <Text style={styles.devHint}>{t("otp.devCode")} {hintCode}</Text>
        ) : null}

        {info ? <Text style={styles.info}>{info}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy || code.trim().length < 4}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t("otp.verify")}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.didnt}>{t("otp.didntGet")}</Text>

        {secondsLeft > 0 ? (
          <Text style={styles.countdown}>
            {t("otp.resendIn", { sec: secondsLeft })}
          </Text>
        ) : (
          <View style={styles.options}>
            <TouchableOpacity
              style={[styles.option, !canResend && styles.optionDisabled]}
              onPress={() => send("sms")}
              disabled={!canResend}
            >
              <Text style={styles.optionIcon}>💬</Text>
              <Text style={styles.optionText}>{t("otp.resendSms")}</Text>
            </TouchableOpacity>
            {!firebase ? (
              <TouchableOpacity
                style={[styles.option, !canResend && styles.optionDisabled]}
                onPress={() => send("call")}
                disabled={!canResend}
              >
                <Text style={styles.optionIcon}>📞</Text>
                <Text style={styles.optionText}>{t("otp.callMe")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {sending ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} /> : null}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.changeWrap}>
          <Text style={styles.link}>{t("otp.change")}</Text>
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
  subtitle: { color: colors.textMuted, textAlign: "center", marginTop: 10, marginBottom: 24, lineHeight: 20 },
  phone: { color: colors.text, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  devHint: { color: colors.primary, textAlign: "center", marginTop: 10, fontSize: 13 },
  info: { color: colors.text, textAlign: "center", marginTop: 10, fontSize: 13 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.onPrimary, fontWeight: "800", fontSize: 16 },
  didnt: { color: colors.textMuted, textAlign: "center", marginTop: 26, fontSize: 14 },
  countdown: { color: colors.textMuted, textAlign: "center", marginTop: 10, fontSize: 14 },
  options: { flexDirection: "row", justifyContent: "center", marginTop: 14 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 6,
  },
  optionDisabled: { opacity: 0.5 },
  optionIcon: { fontSize: 16, marginRight: 8 },
  optionText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  changeWrap: { marginTop: 22, alignItems: "center" },
  link: { color: colors.primary, fontSize: 15 },
  error: { color: colors.danger, marginTop: 12, textAlign: "center" },
});
