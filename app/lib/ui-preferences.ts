export type UiPreferences = { density: "comfortable" | "compact"; reduceMotion: boolean };
export const DEFAULT_PREFERENCES: UiPreferences = { density: "comfortable", reduceMotion: false };
const STORAGE_KEY = "spot-ui-preferences";
const CHANGE_EVENT = "spot-ui-preferences-change";
let cachedRaw: string | null = null;
let cachedPreferences = DEFAULT_PREFERENCES;

export function readUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? "{}";
    if (raw === cachedRaw) return cachedPreferences;
    const value = JSON.parse(raw) as Partial<UiPreferences>;
    cachedRaw = raw;
    cachedPreferences = { density: value.density === "compact" ? "compact" : "comfortable", reduceMotion: value.reduceMotion === true };
    return cachedPreferences;
  } catch { cachedRaw = null; return cachedPreferences; }
}

export function subscribeUiPreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(CHANGE_EVENT, callback); };
}

export function saveUiPreferences(value: UiPreferences) {
  const raw = JSON.stringify(value);
  cachedRaw = raw;
  cachedPreferences = value;
  try { localStorage.setItem(STORAGE_KEY, raw); } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
