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
import { useTheme, type ThemeColors } from "../theme";
import type { Gender } from "../types";

// Parse "yyyy-mm-dd" as a LOCAL date (avoids the UTC off-by-one from new Date(str)).
function parseLocalDate(s?: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function EditProfileScreen({ navigation }: any) {
  const { user, updateProfile } = useAuth();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [dob, setDob] = useState<Date | null>(parseLocalDate(user?.dateOfBirth));
  const [showDate, setShowDate] = useState(false);
  const [gender, setGender] = useState<Gender | null>(user?.gender || null);
  const [avatar, setAvatar] = useState<string | null>(user?.avatar || null);
  const [bio, setBio] = useState(user?.bio || "");
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
    // Local date parts so the day doesn't roll back in UTC+ timezones.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function onSave() {
    setError(null);
    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        dateOfBirth: dob ? fmtDate(dob) : null,
        gender,
        avatar,
        bio: bio.trim() || null,
      });
      navigation.goBack();
    } catch (e: any) {
      setError(e.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.avatarWrap} onPress={pickImage}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarPlus}>＋</Text>
          </View>
        )}
        <Text style={styles.avatarLabel}>Change photo</Text>
      </TouchableOpacity>

      <Text style={styles.label}>First name</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName}
        placeholder="First name" placeholderTextColor={colors.textMuted} />

      <Text style={styles.label}>Last name</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName}
        placeholder="Last name" placeholderTextColor={colors.textMuted} />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
        value={bio}
        onChangeText={setBio}
        placeholder="Tell people a little about yourself"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={300}
      />

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail}
        placeholder="you@example.com" placeholderTextColor={colors.textMuted}
        keyboardType="email-address" autoCapitalize="none" />

      <Text style={styles.label}>Date of birth</Text>
      <TouchableOpacity style={styles.input} onPress={() => setShowDate(true)}>
        <Text style={{ color: dob ? colors.text : colors.textMuted, fontSize: 16 }}>
          {dob ? fmtDate(dob) : "Select date"}
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

      <Text style={styles.label}>Gender</Text>
      <View style={styles.genderRow}>
        {(["male", "female"] as Gender[]).map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
            onPress={() => setGender(g)}
          >
            <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
              {g === "male" ? "♂  Male" : "♀  Female"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={onSave} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingBottom: 48 },
  avatarWrap: { alignItems: "center", marginBottom: 10 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlus: { color: colors.primary, fontSize: 36 },
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
  genderTextActive: { color: colors.onPrimary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 26,
  },
  buttonText: { color: colors.onPrimary, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, marginTop: 14, textAlign: "center" },
});
