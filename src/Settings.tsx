import { useEffect, useState } from "react";
import {
  ACCENT_COLOR_KEY,
  applyAppearance,
  AUTO_PAUSE_AFTER_INACTIVITY_KEY,
  COUNT_NOTE_TAKING_KEY,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY,
  DEFAULT_COUNT_NOTE_TAKING,
  DEFAULT_PAUSE_ON_BACKGROUND,
  DEFAULT_THEME_MODE,
  DEFAULT_TRACK_ACTUAL_READING_TIME,
  DEFAULT_UPDATE_CHECK_ON_STARTUP,
  loadAndApplyAppearance,
  loadBooleanSetting,
  loadUpdateCheckOnStartupPreference,
  PAUSE_ON_BACKGROUND_KEY,
  saveBooleanSetting,
  saveUpdateCheckOnStartupPreference,
  setSetting,
  THEME_MODE_KEY,
  TRACK_ACTUAL_READING_TIME_KEY,
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
  const [updateCheckOnStartup, setUpdateCheckOnStartup] = useState(DEFAULT_UPDATE_CHECK_ON_STARTUP);
  const [trackActualReadingTime, setTrackActualReadingTime] = useState(DEFAULT_TRACK_ACTUAL_READING_TIME);
  const [pauseOnBackground, setPauseOnBackground] = useState(DEFAULT_PAUSE_ON_BACKGROUND);
  const [autoPauseAfterInactivity, setAutoPauseAfterInactivity] = useState(DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY);
  const [countNoteTaking, setCountNoteTaking] = useState(DEFAULT_COUNT_NOTE_TAKING);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      loadAndApplyAppearance(),
      loadUpdateCheckOnStartupPreference(),
      loadBooleanSetting(TRACK_ACTUAL_READING_TIME_KEY, DEFAULT_TRACK_ACTUAL_READING_TIME),
      loadBooleanSetting(PAUSE_ON_BACKGROUND_KEY, DEFAULT_PAUSE_ON_BACKGROUND),
      loadBooleanSetting(AUTO_PAUSE_AFTER_INACTIVITY_KEY, DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY),
      loadBooleanSetting(COUNT_NOTE_TAKING_KEY, DEFAULT_COUNT_NOTE_TAKING),
    ]).then(([{ themeMode, accentColor }, checkOnStartup, track, pauseBg, autoPause, countNotes]) => {
      setThemeMode(themeMode);
      setAccentColor(accentColor);
      setUpdateCheckOnStartup(checkOnStartup);
      setTrackActualReadingTime(track);
      setPauseOnBackground(pauseBg);
      setAutoPauseAfterInactivity(autoPause);
      setCountNoteTaking(countNotes);
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

  async function updateUpdateCheckOnStartup(next: boolean) {
    setUpdateCheckOnStartup(next);
    await saveUpdateCheckOnStartupPreference(next);
  }

  async function updateTrackActualReadingTime(next: boolean) {
    setTrackActualReadingTime(next);
    await saveBooleanSetting(TRACK_ACTUAL_READING_TIME_KEY, next);
  }

  async function updatePauseOnBackground(next: boolean) {
    setPauseOnBackground(next);
    await saveBooleanSetting(PAUSE_ON_BACKGROUND_KEY, next);
  }

  async function updateAutoPauseAfterInactivity(next: boolean) {
    setAutoPauseAfterInactivity(next);
    await saveBooleanSetting(AUTO_PAUSE_AFTER_INACTIVITY_KEY, next);
  }

  async function updateCountNoteTaking(next: boolean) {
    setCountNoteTaking(next);
    await saveBooleanSetting(COUNT_NOTE_TAKING_KEY, next);
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
      <section aria-label="Update Awareness">
        <h2>Update Awareness</h2>
        <label>
          <input
            type="checkbox"
            checked={updateCheckOnStartup}
            onChange={(e) => updateUpdateCheckOnStartup(e.target.checked)}
          />
          Check for updates on startup
        </label>
      </section>
      <section aria-label="Actual Reading Time">
        <h2>Actual Reading Time</h2>
        <label>
          <input
            type="checkbox"
            checked={trackActualReadingTime}
            onChange={(e) => updateTrackActualReadingTime(e.target.checked)}
          />
          Track Actual Reading Time
        </label>
        <label>
          <input
            type="checkbox"
            checked={pauseOnBackground}
            onChange={(e) => updatePauseOnBackground(e.target.checked)}
          />
          Pause When App Is in Background
        </label>
        <label>
          <input
            type="checkbox"
            checked={autoPauseAfterInactivity}
            onChange={(e) => updateAutoPauseAfterInactivity(e.target.checked)}
          />
          Auto-pause After 5 Minutes Inactivity
        </label>
        <label>
          <input
            type="checkbox"
            checked={countNoteTaking}
            onChange={(e) => updateCountNoteTaking(e.target.checked)}
          />
          Count Note-taking as Reading Time
        </label>
      </section>
    </div>
  );
}
