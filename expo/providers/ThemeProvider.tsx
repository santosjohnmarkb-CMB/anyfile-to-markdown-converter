import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme } from "react-native";

import { darkTheme, lightTheme } from "@/constants/colors";
import type { Theme } from "@/constants/colors";

const MODE_KEY = "markdrop.thememode.v1";

/**
 * "dark" keeps the signature dark look always.
 * "system" follows the device appearance setting (light or dark).
 */
export type ThemeMode = "dark" | "system";

const VALID_MODES: readonly ThemeMode[] = ["dark", "system"];

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const hydrated = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(MODE_KEY);
        if (!cancelled && saved && VALID_MODES.includes(saved as ThemeMode)) {
          setModeState(saved as ThemeMode);
        }
      } catch (error) {
        console.log("[theme] failed to load mode", error);
      } finally {
        hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch((error) =>
      console.log("[theme] failed to persist mode", error),
    );
  }, []);

  const isDark = mode === "dark" || systemScheme !== "light";
  const theme: Theme = isDark ? darkTheme : lightTheme;

  return useMemo(
    () => ({ theme, mode, setMode, isDark }),
    [theme, mode, setMode, isDark],
  );
});
