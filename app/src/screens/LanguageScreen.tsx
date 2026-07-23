import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { LANGUAGES } from "../i18n/languages";
import { TRANSLATIONS } from "../i18n/translations";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";

// Only offer languages that are actually translated, so picking one always
// changes the UI (no silent fallback to English).
const SUPPORTED = LANGUAGES.filter((l) => !!TRANSLATIONS[l.code]);

export default function LanguageScreen({ navigation }: any) {
  const { t, lang, setLang } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const data = q
    ? SUPPORTED.filter(
        (l) => l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q)
      )
    : SUPPORTED;

  function choose(code: string, name: string) {
    if (code === lang) {
      navigation.goBack();
      return;
    }
    Alert.alert(t("lang.changeTitle"), t("lang.changeMsg", { name }), [
      { text: t("common.no"), style: "cancel" },
      {
        text: t("common.yes"),
        onPress: async () => {
          await setLang(code);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder={t("lang.search")}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      <FlatList
        data={data}
        keyExtractor={(l) => l.code}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSel = item.code === lang;
          return (
            <TouchableOpacity style={styles.row} onPress={() => choose(item.code, item.native)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.native}>{item.native}</Text>
              </View>
              {isSel ? <Text style={styles.check}>✓</Text> : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>{t("lang.noMatch")}</Text>}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  search: {
    backgroundColor: colors.surface,
    color: colors.text,
    margin: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: { color: colors.text, fontSize: 16 },
  native: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  check: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 30 },
});
