"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
type ThemeContextValue = { preference: ThemePreference; setPreference: (value: ThemePreference) => void };
const ThemeContext = createContext<ThemeContextValue>({ preference: "system", setPreference: () => {} });
const STORAGE_KEY = "spot-theme";
const CHANGE_EVENT = "spot-theme-change";
let cachedPreference: ThemePreference = "system";

function getPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") cachedPreference = value;
  } catch {}
  return cachedPreference;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(CHANGE_EVENT, callback); };
}

function resolveTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const apply = useCallback((value: ThemePreference) => {
    cachedPreference = value;
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
    document.documentElement.dataset.themePreference = value;
    document.documentElement.dataset.theme = resolveTheme(value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  const preference = useSyncExternalStore(subscribe, getPreference, () => "system" as ThemePreference);

  useEffect(() => {
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = resolveTheme(preference);
  }, [preference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => { if (preference === "system") document.documentElement.dataset.theme = resolveTheme("system"); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preference]);

  const context = useMemo(() => ({ preference, setPreference: apply }), [preference, apply]);
  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() { return useContext(ThemeContext); }
