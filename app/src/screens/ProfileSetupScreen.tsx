import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAuth } from "../auth/AuthContext";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";
import type { Gender } from "../types";

export default function ProfileSetupScreen({ route }: any) {
  const email: string | null = route.params?.email ?? null;
  const { updateProfile } = useAuth();
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [gender, setGender] = useState<Gender | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!res.canceled && res.assets?.[0]?.base64) {
      setAvatar(`data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  }

  function fmtDate(d: Date) {
    // Use LOCAL date parts (not toISOString, which shifts to UTC and can roll
    // the date back a day in timezones ahead of UTC).
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`; // yyyy-mm-dd
  }

  async function onDone() {
    setError(null);
    if (!firstName.trim()) {
      setError("Please enter your first name.");
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email,
        dateOfBirth: dob ? fmtDate(dob) : null,
        gender,
        avatar,
      });
      // On success the root navigator switches to the main app automatically.
    } catch (e: any) {
      setError(e.message || "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t("profile.title")}</Text>

      <TouchableOpacity style={styles.avatarWrap} onPress={pickImage}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarPlus}>＋</Text>
          </View>
        )}
        <Text style={styles.avatarLabel}>
          {avatar ? t("profile.changePhoto") : t("profile.addPhoto")}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>{t("field.firstName")}</Text>
      <TextInput
        style={styles.input}
        placeholder={t("field.firstName")}
        placeholderTextColor={colors.textMuted}
        value={firstName}
        onChangeText={setFirstName}
      />

      <Text style={styles.label}>{t("field.lastName")}</Text>
      <TextInput
        style={styles.input}
        placeholder={t("field.lastName")}
        placeholderTextColor={colors.textMuted}
        value={lastName}
        onChangeText={setLastName}
      />

      <Text style={styles.label}>{t("field.dob")}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setShowDate(true)}>
        <Text style={{ color: dob ? colors.text : colors.textMuted, fontSize: 16 }}>
          {dob ? fmtDate(dob) : t("field.selectDate")}
        </Text>
      </TouchableOpacity>
      {showDate && (
        <DateTimePicker
          value={dob || new Date(2000, 0, 1)}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_e, d) => {
            setShowDate(false);
            if (d) setDob(d);
          }}
        />
      )}

      <Text style={styles.label}>{t("field.gender")}</Text>
      <View style={styles.genderRow}>
        {(["male", "female"] as Gender[]).map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
            onPress={() => setGender(g)}
          >
            <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
              {g === "male" ? `♂  ${t("gender.male")}` : `♀  ${t("gender.female")}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={onDone}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{t("common.done")}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingBottom: 48 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  avatarWrap: { alignItems: "center", marginBottom: 16 },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  avatarPlaceholder: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlus: { color: colors.primary, fontSize: 40, fontWeight: "300" },
  avatarLabel: { color: colors.primary, marginTop: 8 },
  label: { color: colors.textMuted, marginTop: 14, marginBottom: 6, marginLeft: 2 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
  },
  genderRow: { flexDirection: "row", gap: 12 },
  genderBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  genderBtnActive: { backgroundColor: colors.bubbleMine, borderColor: colors.primary },
  genderText: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  genderTextActive: { color: colors.text },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.onPrimary, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, marginTop: 14, textAlign: "center" },
});
