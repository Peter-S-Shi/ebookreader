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

type SettingsPane = "appearance" | "reading" | "typography" | "sound" | "files" | "updates";

/// `DESIGN.md` / Prototype v0.5 "Settings": the canonical top-level management surface
/// featuring a persistent secondary Settings subnav for Appearance, Reading, Typography,
/// Sound & Motion, Files & Data, and About & Updates.
export function Settings() {
  const [activePane, setActivePane] = useState<SettingsPane>("appearance");
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
    <div className="settingsLayout">
      <aside className="settingsSubnav" aria-label="Settings navigation">
        <h3>Preferences</h3>
        <button
          type="button"
          className={`setNav ${activePane === "appearance" ? "active" : ""}`}
          onClick={() => setActivePane("appearance")}
        >
          Appearance
        </button>
        <button
          type="button"
          className={`setNav ${activePane === "reading" ? "active" : ""}`}
          onClick={() => setActivePane("reading")}
        >
          Reading
        </button>
        <button
          type="button"
          className={`setNav ${activePane === "typography" ? "active" : ""}`}
          onClick={() => setActivePane("typography")}
        >
          Typography
        </button>
        <button
          type="button"
          className={`setNav ${activePane === "sound" ? "active" : ""}`}
          onClick={() => setActivePane("sound")}
        >
          Sound &amp; Motion
        </button>
        <button
          type="button"
          className={`setNav ${activePane === "files" ? "active" : ""}`}
          onClick={() => setActivePane("files")}
        >
          Files &amp; Data
        </button>
        <h3 style={{ marginTop: "20px" }}>Product</h3>
        <button
          type="button"
          className={`setNav ${activePane === "updates" ? "active" : ""}`}
          onClick={() => setActivePane("updates")}
        >
          About &amp; Updates
        </button>
      </aside>

      <div className="settingsContent">
        <section
          aria-label="Appearance"
          className={`settingsPane ${activePane === "appearance" ? "active" : ""}`}
          id="appearancePane"
        >
          <h2>Appearance</h2>
          <div className="settingsLead">Customize the application shell without changing semantic meaning.</div>

          <div className="settingGroup">
            <h3>Mode</h3>
            <div className="settingRow">
              <div>
                <b>Application appearance</b>
                <div className="desc">System follows Windows. Light and Dark can keep independent custom palettes.</div>
              </div>
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
            </div>
          </div>

          <div className="settingGroup">
            <h3>Theme</h3>
            <div className="settingRow">
              <div>
                <b>Accent Color</b>
                <div className="desc">Accent influences primary actions, selection, progress, focus, and restrained highlights.</div>
              </div>
              <div className="colorCell">
                <input
                  id="accent-color-picker"
                  aria-label="Accent Color"
                  type="color"
                  value={accentColor}
                  onChange={(e) => updateAccentColor(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="networkNote">
            Semantic states (Success, Warning, Danger) remain independent of the Accent color palette.
          </div>
        </section>

        <section
          aria-label="Reading"
          className={`settingsPane ${activePane === "reading" ? "active" : ""}`}
          id="readingPane"
        >
          <h2>Reading</h2>
          <div className="settingsLead">
            Keep Actual Reading Time understandable and user-controlled without turning Settings into a telemetry console.
          </div>

          <div className="settingGroup">
            <h3>Actual Reading Time</h3>
            <div className="settingRow">
              <div>
                <b>Track Actual Reading Time</b>
                <div className="desc">Master switch for new reading-time tracking.</div>
              </div>
              <label className="settings-field">
                <input
                  type="checkbox"
                  aria-label="Track Actual Reading Time"
                  checked={trackActualReadingTime}
                  onChange={(e) => updateTrackActualReadingTime(e.target.checked)}
                />
              </label>
            </div>
            <div className="settingRow">
              <div>
                <b>Pause when app is in background</b>
                <div className="desc">Do not count time while another application is in focus.</div>
              </div>
              <label className="settings-field">
                <input
                  type="checkbox"
                  aria-label="Pause When App Is in Background"
                  checked={pauseOnBackground}
                  onChange={(e) => updatePauseOnBackground(e.target.checked)}
                />
              </label>
            </div>
            <div className="settingRow">
              <div>
                <b>Auto-pause after 5 min inactivity</b>
                <div className="desc">The inactivity interval is fixed at five minutes in V1.</div>
              </div>
              <label className="settings-field">
                <input
                  type="checkbox"
                  aria-label="Auto-pause After 5 Minutes Inactivity"
                  checked={autoPauseAfterInactivity}
                  onChange={(e) => updateAutoPauseAfterInactivity(e.target.checked)}
                />
              </label>
            </div>
            <div className="settingRow">
              <div>
                <b>Count note-taking as reading time</b>
                <div className="desc">Notes and excerpts inside the current Book remain part of the reading workflow.</div>
              </div>
              <label className="settings-field">
                <input
                  type="checkbox"
                  aria-label="Count Note-taking as Reading Time"
                  checked={countNoteTaking}
                  onChange={(e) => updateCountNoteTaking(e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="settingGroup">
            <h3>Reading Behaviour</h3>
            <div className="settingRow">
              <div>
                <b>Reading Checkpoint</b>
                <div className="desc">Offer a short optional reflection when a reading session ends.</div>
              </div>
              <label className="settings-field">
                <input
                  type="checkbox"
                  aria-label="Prompt for a reflection when leaving a Reader session"
                  checked={readingCheckpointEnabled}
                  onChange={(e) => updateReadingCheckpointEnabled(e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="networkNote">
            Windows lock / sleep always pauses reading time. That is a data-correctness rule, not a preference.
          </div>
        </section>

        <section
          aria-label="Typography"
          className={`settingsPane ${activePane === "typography" ? "active" : ""}`}
          id="typographyPane"
        >
          <h2>Typography</h2>
          <div className="settingsLead">
            Global defaults for reflowable EPUB and TXT. A Book can override these from the Reader's Aa panel.
          </div>

          <div className="settingGroup">
            <h3>Default reading typography</h3>
            <div role="group" aria-label="Typography">
              <TypographyPanel settings={typography} onChange={updateTypography} onClose={() => {}} showHeader={false} />
            </div>
          </div>

          <div className="networkNote">
            Font controls do not appear for ordinary PDF, scanned PDF, or fixed-layout EPUB where reflowable typography is not applicable.
          </div>
        </section>

        <section
          aria-label="Sound & Motion"
          className={`settingsPane ${activePane === "sound" ? "active" : ""}`}
          id="soundPane"
        >
          <h2>Sound &amp; Motion</h2>
          <div className="settingsLead">A quiet interface at rest, with restrained physical feedback during interaction.</div>

          <div className="settingGroup">
            <h3>Page experience</h3>
            <div className="settingRow">
              <div>
                <b>Page-turn sound</b>
                <div className="desc">A brief, locally synthesized paper-rustle effect when turning pages.</div>
              </div>
              <label className="settings-field">
                <input
                  type="checkbox"
                  aria-label="Page Turn Sound"
                  checked={soundPageTurnEnabled}
                  onChange={(e) => updateSoundPageTurnEnabled(e.target.checked)}
                />
              </label>
            </div>
            <div className="settingRow">
              <div>
                <b>Motion</b>
                <div className="desc">Standard uses gentle glide motion; Reduced favors minimal fades and honors OS preferences.</div>
              </div>
              <div className="seg">
                <label className={`seg-item ${!reducedMotion ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="motion"
                    value="standard"
                    checked={!reducedMotion}
                    onChange={() => updateReducedMotion(false)}
                  />
                  <span>Standard</span>
                </label>
                <label className={`seg-item ${reducedMotion ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="motion"
                    value="reduced"
                    checked={reducedMotion}
                    onChange={() => updateReducedMotion(true)}
                  />
                  <span>Reduced</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Files & Data"
          className={`settingsPane ${activePane === "files" ? "active" : ""}`}
          id="filesPane"
        >
          <h2>Files &amp; Data</h2>
          <div className="settingsLead">
            Choose how new books enter the library while keeping destructive recovery operations in the Data workspace.
          </div>

          <div className="settingGroup">
            <h3>Import</h3>
            <div className="settingRow">
              <div>
                <b>Default import method</b>
                <div className="desc">Reference keeps original file in place. Managed Copy stores a copy inside managed library.</div>
              </div>
              <div className="seg">
                <label className={`seg-item ${defaultImportMode === "reference" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="default-import-mode"
                    value="reference"
                    checked={defaultImportMode === "reference"}
                    onChange={() => updateDefaultImportMode("reference")}
                  />
                  <span>Reference</span>
                </label>
                <label className={`seg-item ${defaultImportMode === "managed_copy" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="default-import-mode"
                    value="managed_copy"
                    checked={defaultImportMode === "managed_copy"}
                    onChange={() => updateDefaultImportMode("managed_copy")}
                  />
                  <span>Managed Copy</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="About & Updates"
          className={`settingsPane ${activePane === "updates" ? "active" : ""}`}
          id="updatesPane"
        >
          <h2>About &amp; Updates</h2>
          <div className="settingsLead">
            Update awareness is the only V1 feature that requires network access; reading remains fully local-first.
          </div>

          <div className="settingGroup">
            <h3>EbookReader</h3>
            <div className="versionGrid">
              <div className="versionCell">
                <p>Current version: {CURRENT_VERSION}</p>
                <p>Release channel: Stable</p>
              </div>
            </div>
          </div>

          <div className="settingGroup">
            <h3>Updates</h3>
            <div className="settingRow">
              <div>
                <b>Check for updates automatically</b>
                <div className="desc">On startup, check the official release channel in background without blocking application.</div>
              </div>
              <label className="settings-field">
                <input
                  type="checkbox"
                  aria-label="Check for updates on startup"
                  checked={updateCheckOnStartup}
                  onChange={(e) => updateUpdateCheckOnStartup(e.target.checked)}
                />
              </label>
            </div>
            <div className="settingRow">
              <div>
                <b>Manual Update Check</b>
                <div className="desc">Query GitHub Releases for available stable releases.</div>
              </div>
              <button type="button" className="btn" onClick={runUpdateCheck} disabled={checkingUpdate}>
                {checkingUpdate ? "Checking…" : "Check Now"}
              </button>
            </div>
            {updateResult && (
              <div className="settingRow">
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
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
