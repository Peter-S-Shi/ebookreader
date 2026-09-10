import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_TYPOGRAPHY,
  deserializeTypographySettings,
  serializeTypographySettings,
  type TypographySettings,
} from "./typography";

// Setting keys, mirroring `crates/domain/src/settings.rs::keys`. Kept in
// sync manually -- there is no cross-language codegen in this project.
export const THEME_MODE_KEY = "appearance.theme_mode";
export const ACCENT_COLOR_KEY = "appearance.accent_color";
export const UPDATE_CHECK_ON_STARTUP_KEY = "update_awareness.check_on_startup";
// FC-A06: PRODUCT_SPEC.md SS10's small Actual Reading Time policy
// surface, all default On.
export const TRACK_ACTUAL_READING_TIME_KEY = "actual_reading_time.track_enabled";
export const PAUSE_ON_BACKGROUND_KEY = "actual_reading_time.pause_on_background";
export const AUTO_PAUSE_AFTER_INACTIVITY_KEY = "actual_reading_time.auto_pause_after_inactivity";
export const COUNT_NOTE_TAKING_KEY = "actual_reading_time.count_note_taking";
// FC-A09: DESIGN.md SS15/SS17/SS18 "Sound & Motion": Page Turn Sound
// On/Off, Standard / Reduced Motion.
export const SOUND_PAGE_TURN_ENABLED_KEY = "sound.page_turn_enabled";
export const REDUCED_MOTION_KEY = "motion.reduced";
// FC-A10: DESIGN.md SS20 "Derived Screens" lists Reading Checkpoint;
// PRODUCT_SPEC.md SS15 "V1 does not become a complex habit/gamification
// system" -- a single optional, default-Off, dismissible reflection
// prompt at session end, not a streak/rating mechanic.
export const READING_CHECKPOINT_ENABLED_KEY = "reading_checkpoint.enabled";
export const TYPOGRAPHY_GLOBAL_KEY = "typography.global_default";

export type ThemeMode = "light" | "dark" | "system";

export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_ACCENT_COLOR = "#3b6ea5";
// PRODUCT_SPEC.md SS17 lists "optional automatic startup check" as
// included V1 behavior, so an unset preference defaults to on.
export const DEFAULT_UPDATE_CHECK_ON_STARTUP = true;
// PRODUCT_SPEC.md SS10: all four Actual Reading Time policies default On.
export const DEFAULT_TRACK_ACTUAL_READING_TIME = true;
export const DEFAULT_PAUSE_ON_BACKGROUND = true;
export const DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY = true;
export const DEFAULT_COUNT_NOTE_TAKING = true;
export const DEFAULT_SOUND_PAGE_TURN_ENABLED = true;
// DESIGN.md SS17 "Honor OS reduced-motion preference and product Reduced
// setting" -- the OS preference already covers most reduced-motion
// needs, so the app-level setting defaults to Standard (off) rather than
// forcing Reduced everywhere.
export const DEFAULT_REDUCED_MOTION = false;
// MANUAL_QA.md SS17 lists Reading Checkpoint alongside other Settings
// persistence to verify, but every ticket description and DESIGN.md's
// bare mention agree it starts Off.
export const DEFAULT_READING_CHECKPOINT_ENABLED = false;

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

/// Generic boolean-setting reader: anything other than exactly "true" or
/// "false" (including unset/`null`, or a stale/corrupt value) resolves to
/// `defaultValue` rather than being coerced -- a boolean setting is never
/// silently treated as "off" just because it wasn't a recognized string.
export async function loadBooleanSetting(key: string, defaultValue: boolean): Promise<boolean> {
  const stored = await getSetting(key);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return defaultValue;
}

export async function saveBooleanSetting(key: string, value: boolean): Promise<void> {
  await setSetting(key, value ? "true" : "false");
}

export function typographyBookKey(bookId: string): string {
  return `typography.book.${bookId}`;
}

export async function loadGlobalTypography(): Promise<TypographySettings> {
  return deserializeTypographySettings(await getSetting(TYPOGRAPHY_GLOBAL_KEY));
}

export async function saveGlobalTypography(settings: TypographySettings): Promise<void> {
  await setSetting(TYPOGRAPHY_GLOBAL_KEY, serializeTypographySettings(settings));
}

export async function loadPerBookTypography(bookId: string): Promise<TypographySettings> {
  const perBook = deserializeTypographySettings(await getSetting(typographyBookKey(bookId)));
  if (perBook !== DEFAULT_TYPOGRAPHY) return perBook;
  return loadGlobalTypography();
}

export async function savePerBookTypography(bookId: string, settings: TypographySettings): Promise<void> {
  await setSetting(typographyBookKey(bookId), serializeTypographySettings(settings));
}

/// FC-A09 (`DESIGN.md` SS17 "Honor OS reduced-motion preference and
/// product Reduced setting"; `MANUAL_QA.md` QA-UI-04 "must not ...
/// override system reduced-motion preference"): this only ever adds an
/// additional way to *request* reduced motion -- it can never force
/// motion back on when the OS itself prefers reduced motion. CSS
/// combines this attribute with `@media (prefers-reduced-motion)` via
/// `AND`, never `OR` in the "allow motion" direction.
export function applyMotionPreference(reduced: boolean) {
  const root = document.documentElement;
  if (reduced) {
    root.dataset.motion = "reduced";
  } else {
    delete root.dataset.motion;
  }
}

export async function loadAndApplyMotionPreference(): Promise<boolean> {
  const reduced = await loadBooleanSetting(REDUCED_MOTION_KEY, DEFAULT_REDUCED_MOTION);
  applyMotionPreference(reduced);
  return reduced;
}
