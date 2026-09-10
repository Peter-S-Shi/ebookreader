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
  applyMotionPreference,
  DEFAULT_REDUCED_MOTION,
  DEFAULT_SOUND_PAGE_TURN_ENABLED,
  loadAndApplyAppearance,
  loadAndApplyMotionPreference,
  loadBooleanSetting,
  loadGlobalTypography,
  loadUpdateCheckOnStartupPreference,
  PAUSE_ON_BACKGROUND_KEY,
  REDUCED_MOTION_KEY,
  saveBooleanSetting,
  saveGlobalTypography,
  saveUpdateCheckOnStartupPreference,
  setSetting,
  SOUND_PAGE_TURN_ENABLED_KEY,
  THEME_MODE_KEY,
  TRACK_ACTUAL_READING_TIME_KEY,
  type ThemeMode,
} from "./appSettings";
import { TypographyPanel } from "./TypographyPanel";
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from "./typography";

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
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [soundPageTurnEnabled, setSoundPageTurnEnabled] = useState(DEFAULT_SOUND_PAGE_TURN_ENABLED);
  const [reducedMotion, setReducedMotion] = useState(DEFAULT_REDUCED_MOTION);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      loadAndApplyAppearance(),
      loadUpdateCheckOnStartupPreference(),
      loadBooleanSetting(TRACK_ACTUAL_READING_TIME_KEY, DEFAULT_TRACK_ACTUAL_READING_TIME),
      loadBooleanSetting(PAUSE_ON_BACKGROUND_KEY, DEFAULT_PAUSE_ON_BACKGROUND),
      loadBooleanSetting(AUTO_PAUSE_AFTER_INACTIVITY_KEY, DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY),
      loadBooleanSetting(COUNT_NOTE_TAKING_KEY, DEFAULT_COUNT_NOTE_TAKING),
      loadGlobalTypography(),
      loadBooleanSetting(SOUND_PAGE_TURN_ENABLED_KEY, DEFAULT_SOUND_PAGE_TURN_ENABLED),
      loadAndApplyMotionPreference(),
    ]).then(
      ([
        { themeMode, accentColor },
        checkOnStartup,
        track,
        pauseBg,
        autoPause,
        countNotes,
        typography,
        soundEnabled,
        motionReduced,
      ]) => {
        setThemeMode(themeMode);
        setAccentColor(accentColor);
        setUpdateCheckOnStartup(checkOnStartup);
        setTrackActualReadingTime(track);
        setPauseOnBackground(pauseBg);
        setAutoPauseAfterInactivity(autoPause);
        setCountNoteTaking(countNotes);
        setTypography(typography);
        setSoundPageTurnEnabled(soundEnabled);
        setReducedMotion(motionReduced);
        setLoaded(true);
      },
    );
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

  async function updateTypography(next: TypographySettings) {
    setTypography(next);
    await saveGlobalTypography(next);
  }

  async function updateSoundPageTurnEnabled(next: boolean) {
    setSoundPageTurnEnabled(next);
    await saveBooleanSetting(SOUND_PAGE_TURN_ENABLED_KEY, next);
  }

  async function updateReducedMotion(next: boolean) {
    setReducedMotion(next);
    applyMotionPreference(next);
    await saveBooleanSetting(REDUCED_MOTION_KEY, next);
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
      <section aria-label="Typography">
        <h2>Typography</h2>
        <div role="group" aria-label="Typography">
          <TypographyPanel settings={typography} onChange={updateTypography} onClose={() => {}} showHeader={false} />
        </div>
      </section>
      <section aria-label="Sound & Motion">
        <h2>Sound &amp; Motion</h2>
        <label>
          <input
            type="checkbox"
            checked={soundPageTurnEnabled}
            onChange={(e) => updateSoundPageTurnEnabled(e.target.checked)}
          />
          Page Turn Sound
        </label>
        <fieldset>
          <legend>Motion</legend>
          <label>
            <input type="radio" name="motion" checked={!reducedMotion} onChange={() => updateReducedMotion(false)} />
            Standard
          </label>
          <label>
            <input type="radio" name="motion" checked={reducedMotion} onChange={() => updateReducedMotion(true)} />
            Reduced
          </label>
        </fieldset>
      </section>
    </div>
  );
}
