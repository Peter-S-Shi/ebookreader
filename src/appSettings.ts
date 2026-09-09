import { invoke } from "@tauri-apps/api/core";

// Setting keys, mirroring `crates/domain/src/settings.rs::keys`. Kept in
// sync manually -- there is no cross-language codegen in this project.
export const THEME_MODE_KEY = "appearance.theme_mode";
export const ACCENT_COLOR_KEY = "appearance.accent_color";
export const UPDATE_CHECK_ON_STARTUP_KEY = "update_awareness.check_on_startup";

export type ThemeMode = "light" | "dark" | "system";

export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_ACCENT_COLOR = "#3b6ea5";
// PRODUCT_SPEC.md SS17 lists "optional automatic startup check" as
// included V1 behavior, so an unset preference defaults to on.
export const DEFAULT_UPDATE_CHECK_ON_STARTUP = true;

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

/// FC-C08: whether the optional startup Update Awareness check
/// (`PRODUCT_SPEC.md` SS17) should run. Unset resolves to
/// `DEFAULT_UPDATE_CHECK_ON_STARTUP`, not `false` -- an unset preference
/// is "not yet chosen", not "the user turned it off".
export async function loadUpdateCheckOnStartupPreference(): Promise<boolean> {
  const stored = await getSetting(UPDATE_CHECK_ON_STARTUP_KEY);
  return stored === null ? DEFAULT_UPDATE_CHECK_ON_STARTUP : stored === "true";
}

export async function saveUpdateCheckOnStartupPreference(enabled: boolean): Promise<void> {
  await setSetting(UPDATE_CHECK_ON_STARTUP_KEY, enabled ? "true" : "false");
}
