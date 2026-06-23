import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { COUNTRIES, flagEmoji, type Country } from "../data/countries";
import { useT } from "../i18n/i18n";
import { useTheme, type ThemeColors } from "../theme";

export default function CountryPicker({
  visible,
  onClose,
  onSelect,
  selectedCode,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (c: Country) => void;
  selectedCode?: string;
}) {
  const { t } = useT();
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const data = useMemo(() => {
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("country.title")}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder={t("country.search")}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoFocus
        />

        <FlatList
          data={data}
          keyExtractor={(c) => c.code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const sel = item.code === selectedCode;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  setQuery("");
                  onClose();
                }}
              >
                <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.dial, sel && styles.dialSel]}>{item.dial}</Text>
                {sel ? <Text style={styles.check}>✓</Text> : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{t("lang.noMatch")}</Text>}
        />
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 12,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  close: { color: colors.textMuted, fontSize: 22, fontWeight: "700" },
  search: {
    backgroundColor: colors.surface,
    color: colors.text,
    marginHorizontal: 16,
    marginBottom: 8,
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
  flag: { fontSize: 24, marginRight: 14 },
  name: { color: colors.text, fontSize: 16, flex: 1 },
  dial: { color: colors.textMuted, fontSize: 15, marginLeft: 8 },
  dialSel: { color: colors.primary },
  check: { color: colors.primary, fontSize: 18, fontWeight: "800", marginLeft: 10 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 30 },
});
