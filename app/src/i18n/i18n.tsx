import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager, DevSettings, NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TRANSLATIONS } from "./translations";

const LANG_KEY = "zapp.language";
export const RTL_LANGS = ["ar", "fa", "ur", "ps", "ku", "sd"];

// The device's locale, as a BCP-47-ish string e.g. "ar_IQ" / "zh-Hans-CN".
function rawDeviceLocale(): string {
  try {
    // Android's I18nManager native module exposes the device locale directly.
    const c = (I18nManager as any).getConstants?.();
    if (c?.localeIdentifier) return String(c.localeIdentifier);
  } catch {
    /* ignore */
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en";
  } catch {
    return "en";
  }
}

// Map a device locale onto one of our translated languages, falling back to
// English. Hebrew is intentionally never selected (we don't support it).
export function detectDeviceLang(): string {
  const lower = rawDeviceLocale().toLowerCase().replace(/_/g, "-");
  const parts = lower.split("-");
  const primary = parts[0];
  if (primary === "he" || primary === "iw") return "en"; // Hebrew excluded
  if (primary === "zh") {
    const traditional =
      lower.includes("hant") || parts.includes("tw") || parts.includes("hk") || parts.includes("mo");
    const code = traditional ? "zh-Hant" : "zh-Hans";
    return TRANSLATIONS[code] ? code : "en";
  }
  return TRANSLATIONS[primary] ? primary : "en";
}

// The device's region as an ISO 3166-1 alpha-2 code (e.g. "IQ"), or null.
// Used to pre-select the country dial code on the phone screen.
export function detectDeviceRegion(): string | null {
  const parts = rawDeviceLocale().replace(/_/g, "-").split("-");
  for (const p of parts.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
  }
  return null;
}

// React Native only mirrors the layout (flex direction, text alignment, back
// arrows, etc.) for an RTL language AFTER the JS bundle reloads. Without a reload
// the UI ends up half-mirrored / broken when toggling between LTR and RTL. So
// when the direction actually flips we re-run the app from scratch; on relaunch
// the saved language is read back and both the strings and the layout match.
function reloadApp() {
  // In development a fast JS reload flips the layout and keeps Metro attached.
  if (__DEV__) {
    try {
      DevSettings.reload();
      return;
    } catch {
      /* fall through */
    }
  }
  // Release builds: our own native module fully restarts the process, which is
  // what actually makes I18nManager's RTL flag take effect.
  try {
    const AppRestart = NativeModules?.AppRestart as
      | { restart?: () => void }
      | undefined;
    if (AppRestart?.restart) {
      AppRestart.restart();
      return;
    }
  } catch {
    /* not present — fall through */
  }
  try {
    // Present in builds that include expo-updates.
    const Updates = require("expo-updates");
    if (Updates?.reloadAsync) {
      Updates.reloadAsync();
      return;
    }
  } catch {
    /* not installed — fall through */
  }
  try {
    DevSettings.reload();
    return;
  } catch {
    /* not in a dev build */
  }
  try {
    NativeModules?.DevSettings?.reload?.();
  } catch {
    /* nothing else we can do */
  }
}

type Vars = Record<string, string | number>;

type I18nState = {
  lang: string;
  isRTL: boolean;
  t: (key: string, vars?: Vars) => string;
  setLang: (code: string) => Promise<void>;
  ready: boolean;
};

const I18nCtx = createContext<I18nState | undefined>(undefined);

function translate(lang: string, key: string, vars?: Vars): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  let s = dict[key] ?? TRANSLATIONS.en[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, String(vars[k]));
  }
  return s;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let saved = await AsyncStorage.getItem(LANG_KEY);
      if (!saved) {
        // First launch: pick the language from the phone's system locale and
        // remember it, so the app opens in the user's language automatically.
        saved = detectDeviceLang();
        await AsyncStorage.setItem(LANG_KEY, saved);
      }
      // Keep the persisted native RTL flag in sync with the saved language so the
      // NEXT cold start lays out in the right direction. We do NOT reload here:
      // forceRTL only takes effect when the native process starts, and reloading
      // the JS bundle alone would just loop without ever flipping the layout.
      const rtl = RTL_LANGS.includes(saved);
      if (I18nManager.isRTL !== rtl) {
        try {
          I18nManager.allowRTL(rtl);
          I18nManager.forceRTL(rtl);
        } catch {
          /* ignore */
        }
      }
      setLangState(saved);
      setReady(true);
    })();
  }, []);

  const value = useMemo<I18nState>(
    () => ({
      lang,
      isRTL: RTL_LANGS.includes(lang),
      ready,
      t: (key, vars) => translate(lang, key, vars),
      setLang: async (code) => {
        await AsyncStorage.setItem(LANG_KEY, code);
        const rtl = RTL_LANGS.includes(code);
        const directionChanged = I18nManager.isRTL !== rtl;
        if (directionChanged) {
          // Flip the native layout direction. Update the strings right away so
          // the change is visible, then reload so the mirrored layout fully
          // applies. If the reload is a no-op (e.g. a release build without
          // expo-updates), the startup sync mirrors the layout on next launch.
          try {
            I18nManager.allowRTL(rtl);
            I18nManager.forceRTL(rtl);
          } catch {
            /* ignore */
          }
          setLangState(code);
          reloadApp();
          return;
        }
        // Same direction (e.g. English → Thai, or Arabic → Farsi): swap live.
        setLangState(code);
      },
    }),
    [lang, ready]
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}
