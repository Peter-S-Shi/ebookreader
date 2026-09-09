import { useEffect, useState } from "react";
import {
  ACCENT_COLOR_KEY,
  applyAppearance,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_THEME_MODE,
  loadAndApplyAppearance,
  setSetting,
  THEME_MODE_KEY,
  type ThemeMode,
} from "./appSettings";

/// `DESIGN.md` "Settings": the canonical top-level management surface.
/// FC-C05 corrective ticket: this is the first real, persisted section --
/// Appearance (theme mode + accent color). Later corrective tickets add
/// their own sections here (reading-time policy, typography defaults,
/// sound/motion, Reading Checkpoint, update-awareness preference, About)
/// rather than each inventing their own scattered settings surface.
export function Settings() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAndApplyAppearance().then(({ themeMode, accentColor }) => {
      setThemeMode(themeMode);
      setAccentColor(accentColor);
      setLoaded(true);
    });
  }, []);

  async function updateThemeMode(next: ThemeMode) {
    setThemeMode(next);
    applyAppearance(next, accentColor);
    await setSetting(THEME_MODE_KEY, next);
  }

  async function updateAccentColor(next: string) {
    setAccentColor(next);
    applyAppearance(themeMode, next);
    await setSetting(ACCENT_COLOR_KEY, next);
  }

  if (!loaded) return null;

  return (
    <div className="settings-panel">
      <section aria-label="Appearance">
        <h2>Appearance</h2>
        <fieldset>
          <legend>Theme</legend>
          {(["system", "light", "dark"] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="theme-mode"
                value={mode}
                checked={themeMode === mode}
                onChange={() => updateThemeMode(mode)}
              />
              {mode === "system" ? "Match System" : mode === "light" ? "Light" : "Dark"}
            </label>
          ))}
        </fieldset>
        <label>
          Accent Color
          <input
            aria-label="Accent Color"
            type="color"
            value={accentColor}
            onChange={(e) => updateAccentColor(e.target.value)}
          />
        </label>
      </section>
    </div>
  );
}
