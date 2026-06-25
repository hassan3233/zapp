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
import { useT, detectDeviceRegion } from "../i18n/i18n";
import Logo from "../components/Logo";
import CountryPicker from "../components/CountryPicker";
import { defaultCountry, flagEmoji, type Country } from "../data/countries";
import { detectCountry } from "../utils/locationCountry";
import { firebaseAvailable, startPhoneSignIn } from "../auth/phoneAuth";
import { useTheme, type ThemeColors } from "../theme";

export default function PhoneScreen({ navigation }: any) {
  const { requestOtp } = useAuth();
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Start with an instant guess from the device region, then upgrade to the
  // location-based country (SIM → GPS) once it resolves — unless the user has
  // already picked one manually.
  const [country, setCountry] = useState<Country>(() =>
    defaultCountry(detectDeviceRegion())
  );
  const userPicked = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    detectCountry().then((c) => {
      if (active && !userPicked.current) setCountry(c);
    });
    return () => {
      active = false;
    };
  }, []);

  function chooseCountry(c: Country) {
    userPicked.current = true;
    setCountry(c);
    // Trim any typed digits to the new country's allowed length (+1 for a leading 0).
    setPhone((p) => p.replace(/\D/g, "").slice(0, c.len + 1));
  }

  // Allow typing the national number (with an optional leading 0); strip the
  // trunk "0" to get the significant number that goes after the country code.
  const localDigits = phone.replace(/[^0-9]/g, "");
  const significant = localDigits.replace(/^0+/, "");
  const validLength = significant.length === country.len;

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const fullPhone = `${country.dial}${significant}`;
      if (firebaseAvailable()) {
        // Firebase sends the SMS itself; verify on the next screen.
        await startPhoneSignIn(fullPhone);
        navigation.navigate("Otp", { phone: fullPhone, firebase: true });
      } else {
        const devCode = await requestOtp(fullPhone);
        navigation.navigate("Otp", { phone: fullPhone, devCode });
      }
    } catch (e: any) {
      setError(e.message || "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Logo size={96} wordmarkSize={28} />
        <Text style={styles.subtitle}>{t("auth.tagline")}</Text>

        <View style={styles.phoneRow}>
          <TouchableOpacity
            style={styles.country}
            onPress={() => setPickerOpen(true)}
            disabled={busy}
          >
            <Text style={styles.flag}>{flagEmoji(country.code)}</Text>
            <Text style={styles.dial}>{country.dial}</Text>
            <Text style={styles.caret}>▾</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder=""
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, country.len + 1))}
            maxLength={country.len + 1}
            autoFocus
          />
        </View>
        <Text style={styles.hint}>{t("auth.codeHint")}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy || !validLength}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t("auth.sendCode")}</Text>
          )}
        </TouchableOpacity>
      </View>

      <CountryPicker
        visible={pickerOpen}
        selectedCode={country.code}
        onClose={() => setPickerOpen(false)}
        onSelect={chooseCountry}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: "center", padding: 24 },
  subtitle: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 14,
    marginBottom: 28,
  },
  phoneRow: { flexDirection: "row", alignItems: "stretch" },
  country: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 10,
  },
  flag: { fontSize: 20, marginRight: 6 },
  dial: { color: colors.text, fontSize: 17, fontWeight: "600" },
  caret: { color: colors.textMuted, fontSize: 14, marginLeft: 4 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: 8, marginLeft: 4 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.onPrimary, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, marginTop: 12, textAlign: "center" },
});
