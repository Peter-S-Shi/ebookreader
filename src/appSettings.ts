import { invoke } from "@tauri-apps/api/core";

// Setting keys, mirroring `crates/domain/src/settings.rs::keys`. Kept in
// sync manually -- there is no cross-language codegen in this project.
export const THEME_MODE_KEY = "appearance.theme_mode";
export const ACCENT_COLOR_KEY = "appearance.accent_color";

export type ThemeMode = "light" | "dark" | "system";

export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_ACCENT_COLOR = "#3b6ea5";

export async function getSetting(key: string): Promise<string | null> {
  return await invoke<string | null>("get_setting_command", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  await invoke("set_setting_command", { key, value });
}

/// Apply the persisted (or default) Appearance settings to the document
/// root as `data-theme` + `--accent-color`, so every component -- not just
/// the Settings panel itself -- reflects the current choice via CSS.
export function applyAppearance(themeMode: ThemeMode, accentColor: string) {
  const root = document.documentElement;
  if (themeMode === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = themeMode;
  }
  root.style.setProperty("--accent-color", accentColor);
}

export async function loadAndApplyAppearance(): Promise<{ themeMode: ThemeMode; accentColor: string }> {
  const [storedTheme, storedAccent] = await Promise.all([getSetting(THEME_MODE_KEY), getSetting(ACCENT_COLOR_KEY)]);
  const themeMode = (storedTheme as ThemeMode | null) ?? DEFAULT_THEME_MODE;
  const accentColor = storedAccent ?? DEFAULT_ACCENT_COLOR;
  applyAppearance(themeMode, accentColor);
  return { themeMode, accentColor };
}
