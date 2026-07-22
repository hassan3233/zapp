import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Zappchat palette — dark with an electric-yellow energy accent.
export const darkColors = {
  bg: "#0E0F13",
  surface: "#15171C",
  surfaceAlt: "#1C1F26",
  primary: "#FFD11E", // electric yellow
  primaryDark: "#E6B800",
  onPrimary: "#15171C", // text/icon shown on a yellow surface
  bubbleMine: "#FFD11E", // my messages = yellow
  bubbleMineText: "#15171C",
  bubbleTheirs: "#1C1F26",
  text: "#FFFFFF",
  textMuted: "#8A93A2",
  border: "#232730",
  danger: "#FF5A5F",
};

// Light counterpart — same accent, light surfaces.
export const lightColors: ThemeColors = {
  bg: "#F5F6F8",
  surface: "#FFFFFF",
  surfaceAlt: "#ECEEF2",
  primary: "#FFD11E",
  primaryDark: "#E6B800",
  onPrimary: "#15171C",
  bubbleMine: "#FFD11E",
  bubbleMineText: "#15171C",
  bubbleTheirs: "#E9ECF1",
  text: "#14161A",
  textMuted: "#6B7280",
  border: "#DDE1E7",
  danger: "#E5484D",
};

export type ThemeColors = typeof darkColors;
export type ThemePref = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

const THEME_KEY = "zapp.theme";

// Deprecated static fallback (kept so any non-component code still compiles).
// Components must use useTheme() so they re-render when the theme changes.
export const colors = darkColors;

type ThemeState = {
  colors: ThemeColors;
  scheme: Scheme;
  pref: ThemePref;
  setPref: (p: ThemePref) => Promise<void>;
  ready: boolean;
};

const ThemeCtx = createContext<ThemeState | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // reactive: follows the OS in "system" mode
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") {
        setPrefState(saved);
      }
      setReady(true);
    })();
  }, []);

  const scheme: Scheme =
    pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  const value = useMemo<ThemeState>(
    () => ({
      colors: scheme === "light" ? lightColors : darkColors,
      scheme,
      pref,
      ready,
      setPref: async (p: ThemePref) => {
        setPrefState(p);
        await AsyncStorage.setItem(THEME_KEY, p);
      },
    }),
    [scheme, pref, ready]
  );

  return React.createElement(ThemeCtx.Provider, { value }, children);
}

export function useTheme(): ThemeColors {
  return (useContext(ThemeCtx)?.colors) ?? darkColors;
}

export function useThemePref() {
  const ctx = useContext(ThemeCtx);
  return {
    pref: ctx?.pref ?? "system",
    scheme: ctx?.scheme ?? "dark",
    setPref: ctx?.setPref ?? (async () => {}),
  };
}
