import { useEffect, useState } from "react";
import {
  ACCENT_COLOR_KEY,
  applyAppearance,
  AUTO_PAUSE_AFTER_INACTIVITY_KEY,
  COUNT_NOTE_TAKING_KEY,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY,
  DEFAULT_COUNT_NOTE_TAKING,
  DEFAULT_IMPORT_MODE,
  DEFAULT_PAUSE_ON_BACKGROUND,
  DEFAULT_READING_CHECKPOINT_ENABLED,
  DEFAULT_THEME_MODE,
  DEFAULT_TRACK_ACTUAL_READING_TIME,
  DEFAULT_UPDATE_CHECK_ON_STARTUP,
  applyMotionPreference,
  DEFAULT_REDUCED_MOTION,
  DEFAULT_SOUND_PAGE_TURN_ENABLED,
  loadAndApplyAppearance,
  loadAndApplyMotionPreference,
  loadBooleanSetting,
  loadDefaultImportMode,
  loadGlobalTypography,
  loadUpdateCheckOnStartupPreference,
  PAUSE_ON_BACKGROUND_KEY,
  READING_CHECKPOINT_ENABLED_KEY,
  REDUCED_MOTION_KEY,
  saveBooleanSetting,
  saveDefaultImportMode,
  saveGlobalTypography,
  saveUpdateCheckOnStartupPreference,
  setSetting,
  SOUND_PAGE_TURN_ENABLED_KEY,
  THEME_MODE_KEY,
  TRACK_ACTUAL_READING_TIME_KEY,
  type ImportMode,
  type ThemeMode,
} from "./appSettings";
import { TypographyPanel } from "./TypographyPanel";
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from "./typography";
import { checkForUpdate, CURRENT_VERSION, REPO_NAME, REPO_OWNER, type UpdateCheckResult } from "./updateAwareness";

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
  const [readingCheckpointEnabled, setReadingCheckpointEnabled] = useState(DEFAULT_READING_CHECKPOINT_ENABLED);
  const [defaultImportMode, setDefaultImportMode] = useState<ImportMode>(DEFAULT_IMPORT_MODE);
  const [loaded, setLoaded] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

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
      loadBooleanSetting(READING_CHECKPOINT_ENABLED_KEY, DEFAULT_READING_CHECKPOINT_ENABLED),
      loadDefaultImportMode(),
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
        checkpointEnabled,
        importMode,
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
        setReadingCheckpointEnabled(checkpointEnabled);
        setDefaultImportMode(importMode);
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

  async function updateReadingCheckpointEnabled(next: boolean) {
    setReadingCheckpointEnabled(next);
    await saveBooleanSetting(READING_CHECKPOINT_ENABLED_KEY, next);
  }

  async function updateDefaultImportMode(next: ImportMode) {
    setDefaultImportMode(next);
    await saveDefaultImportMode(next);
  }

  async function runUpdateCheck() {
    setCheckingUpdate(true);
    const result = await checkForUpdate(CURRENT_VERSION, REPO_OWNER, REPO_NAME);
    setUpdateResult(result);
    setCheckingUpdate(false);
  }

  if (!loaded) return null;

  return (
    <div className="settings-panel">
      <section aria-label="Appearance" className="settings-section">
        <h2>Appearance</h2>
        <fieldset className="settings-fieldset">
          <legend>Theme</legend>
          <div className="seg">
            {(["system", "light", "dark"] as const).map((mode) => (
              <label key={mode} className={`seg-item ${themeMode === mode ? "active" : ""}`}>
                <input
                  type="radio"
                  name="theme-mode"
                  value={mode}
                  checked={themeMode === mode}
                  onChange={() => updateThemeMode(mode)}
                />
                <span>{mode === "system" ? "Match System" : mode === "light" ? "Light" : "Dark"}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="colorCell">
          <label htmlFor="accent-color-picker">Accent Color</label>
          <input
            id="accent-color-picker"
            aria-label="Accent Color"
            type="color"
            value={accentColor}
            onChange={(e) => updateAccentColor(e.target.value)}
          />
        </div>
      </section>

      <section aria-label="About & Updates" className="settings-section">
        <h2>About &amp; Updates</h2>
        <div className="settings-info">
          <p>Current version: {CURRENT_VERSION}</p>
          <p>Release channel: Stable</p>
        </div>
        <label className="settings-field">
          <input
            type="checkbox"
            checked={updateCheckOnStartup}
            onChange={(e) => updateUpdateCheckOnStartup(e.target.checked)}
          />
          <span>Check for updates on startup</span>
        </label>
        <div className="settings-actions">
          <button type="button" className="btn" onClick={runUpdateCheck} disabled={checkingUpdate}>
            {checkingUpdate ? "Checking…" : "Check Now"}
          </button>
        </div>
        {updateResult && (
          <p role="status" className="notice">
            {updateResult.status === "up_to_date" && "Up To Date."}
            {updateResult.status === "check_failed" && "Check Failed. You may be offline."}
            {updateResult.status === "update_available" && (
              <>
                Update Available: {updateResult.latestVersion}.{" "}
                {updateResult.releaseUrl && (
                  <a href={updateResult.releaseUrl} target="_blank" rel="noreferrer">
                    Release notes
                  </a>
                )}
              </>
            )}
          </p>
        )}
      </section>

      <section aria-label="Actual Reading Time" className="settings-section">
        <h2>Actual Reading Time</h2>
        <div className="settings-fields">
          <label className="settings-field">
            <input
              type="checkbox"
              checked={trackActualReadingTime}
              onChange={(e) => updateTrackActualReadingTime(e.target.checked)}
            />
            <span>Track Actual Reading Time</span>
          </label>
          <label className="settings-field">
            <input
              type="checkbox"
              checked={pauseOnBackground}
              onChange={(e) => updatePauseOnBackground(e.target.checked)}
            />
            <span>Pause When App Is in Background</span>
          </label>
          <label className="settings-field">
            <input
              type="checkbox"
              checked={autoPauseAfterInactivity}
              onChange={(e) => updateAutoPauseAfterInactivity(e.target.checked)}
            />
            <span>Auto-pause After 5 Minutes Inactivity</span>
          </label>
          <label className="settings-field">
            <input
              type="checkbox"
              checked={countNoteTaking}
              onChange={(e) => updateCountNoteTaking(e.target.checked)}
            />
            <span>Count Note-taking as Reading Time</span>
          </label>
        </div>
      </section>

      <section aria-label="Typography" className="settings-section">
        <h2>Typography</h2>
        <div role="group" aria-label="Typography">
          <TypographyPanel settings={typography} onChange={updateTypography} onClose={() => {}} showHeader={false} />
        </div>
      </section>

      <section aria-label="Sound & Motion" className="settings-section">
        <h2>Sound &amp; Motion</h2>
        <label className="settings-field">
          <input
            type="checkbox"
            checked={soundPageTurnEnabled}
            onChange={(e) => updateSoundPageTurnEnabled(e.target.checked)}
          />
          <span>Page Turn Sound</span>
        </label>
        <fieldset className="settings-fieldset">
          <legend>Motion</legend>
          <div className="seg">
            <label className={`seg-item ${!reducedMotion ? "active" : ""}`}>
              <input type="radio" name="motion" checked={!reducedMotion} onChange={() => updateReducedMotion(false)} />
              <span>Standard</span>
            </label>
            <label className={`seg-item ${reducedMotion ? "active" : ""}`}>
              <input type="radio" name="motion" checked={reducedMotion} onChange={() => updateReducedMotion(true)} />
              <span>Reduced</span>
            </label>
          </div>
        </fieldset>
      </section>

      <section aria-label="Reading Checkpoint" className="settings-section">
        <h2>Reading Checkpoint</h2>
        <label className="settings-field">
          <input
            type="checkbox"
            checked={readingCheckpointEnabled}
            onChange={(e) => updateReadingCheckpointEnabled(e.target.checked)}
          />
          <span>Prompt for a reflection when leaving a Reader session</span>
        </label>
      </section>

      <section aria-label="Files & Data" className="settings-section">
        <h2>Files &amp; Data</h2>
        <fieldset className="settings-fieldset">
          <legend>Default Import Mode</legend>
          <div className="seg">
            <label className={`seg-item ${defaultImportMode === "reference" ? "active" : ""}`}>
              <input
                type="radio"
                name="default-import-mode"
                checked={defaultImportMode === "reference"}
                onChange={() => updateDefaultImportMode("reference")}
              />
              <span>Reference</span>
            </label>
            <label className={`seg-item ${defaultImportMode === "managed_copy" ? "active" : ""}`}>
              <input
                type="radio"
                name="default-import-mode"
                checked={defaultImportMode === "managed_copy"}
                onChange={() => updateDefaultImportMode("managed_copy")}
              />
              <span>Managed Copy</span>
            </label>
          </div>
        </fieldset>
      </section>
    </div>
  );
}
