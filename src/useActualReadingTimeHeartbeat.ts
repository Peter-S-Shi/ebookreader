import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AUTO_PAUSE_AFTER_INACTIVITY_KEY,
  COUNT_NOTE_TAKING_KEY,
  DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY,
  DEFAULT_COUNT_NOTE_TAKING,
  DEFAULT_PAUSE_ON_BACKGROUND,
  DEFAULT_TRACK_ACTUAL_READING_TIME,
  loadBooleanSetting,
  PAUSE_ON_BACKGROUND_KEY,
  TRACK_ACTUAL_READING_TIME_KEY,
} from "./appSettings";

interface ReadingSessionStatusDTO {
  state: string;
  total_excluded_ms: number;
  total_note_taking_ms: number;
}

// PRODUCT_SPEC.md SS10 names "Auto-pause After 5 Minutes Inactivity" as a
// frozen value, not a user-adjustable idle-timeout choice (explicitly
// out of scope: "arbitrary idle-timeout choices").
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const INACTIVITY_CHECK_INTERVAL_MS = 10_000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

/// Today's local calendar date as `YYYY-MM-DD`, for the Calendar's
/// day-keyed reading ledger (`[[calendar]]`). Deliberately local, not
/// UTC -- a desktop app's "today" is whatever the OS/user's own calendar
/// says, not a server-normalized day that could silently disagree with
/// it near midnight.
function localDay(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/// PRODUCT_SPEC.md SS10 Actual Reading Time: while a Book's Reader is
/// mounted, periodically records real elapsed time net of ReadingSession
/// exclusions -- OS lock/sleep (`reading_session_hook`), the app losing
/// focus ("Pause When App Is in Background"), and prolonged user
/// inactivity ("Auto-pause After 5 Minutes Inactivity") -- and, per
/// "Count Note-taking as Reading Time", optionally treats time the
/// Notebook was open (`NotebookPanel`'s start/stop-note-taking calls) as
/// excluded too. Each of these four policies is read from Settings on
/// mount; until that resolves (normally within the same microtask, well
/// before the first tick), this starts from PRODUCT_SPEC.md SS10's own
/// defaults (all On) rather than blocking -- so an immediate mount/
/// unmount (e.g. a quick accidental open) still flushes a tick instead of
/// silently losing it to a settings-load race. Flushes a final interval
/// on unmount so closing the Reader doesn't lose the last partial tick.
export function useActualReadingTimeHeartbeat(bookId: string, intervalMs = 30_000) {
  useEffect(() => {
    let trackEnabled = DEFAULT_TRACK_ACTUAL_READING_TIME;
    let pauseOnBackground = DEFAULT_PAUSE_ON_BACKGROUND;
    let autoPauseAfterInactivity = DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY;
    let countNoteTaking = DEFAULT_COUNT_NOTE_TAKING;

    let lastCheckpointMs = performance.now();
    let lastExcludedMs = 0;
    let lastNoteTakingMs = 0;

    async function readStatus(): Promise<ReadingSessionStatusDTO> {
      try {
        return await invoke<ReadingSessionStatusDTO>("reading_session_status_command");
      } catch {
        return { state: "active", total_excluded_ms: lastExcludedMs, total_note_taking_ms: lastNoteTakingMs };
      }
    }

    readStatus().then((status) => {
      lastExcludedMs = status.total_excluded_ms;
      lastNoteTakingMs = status.total_note_taking_ms ?? 0;
    });

    async function tick() {
      if (!trackEnabled) return;
      const nowMs = performance.now();
      const elapsedSeconds = (nowMs - lastCheckpointMs) / 1000;
      const status = await readStatus();
      const excludedNowMs = status.total_excluded_ms;
      const noteTakingNowMs = status.total_note_taking_ms ?? 0;

      let excludedSeconds = Math.max(0, excludedNowMs - lastExcludedMs) / 1000;
      if (!countNoteTaking) {
        excludedSeconds += Math.max(0, noteTakingNowMs - lastNoteTakingMs) / 1000;
      }

      lastCheckpointMs = nowMs;
      lastExcludedMs = excludedNowMs;
      lastNoteTakingMs = noteTakingNowMs;

      // Recording a zero (or near-zero) interval is harmless -- it just
      // adds nothing -- so there's no need to gate this call, which would
      // otherwise make the unmount-flush timing-sensitive.
      invoke("record_active_reading_time_command", { bookId, elapsedSeconds, excludedSeconds, day: localDay() }).catch(
        () => {},
      );
    }

    const interval = setInterval(tick, intervalMs);

    // "Pause When App Is in Background": the app losing/regaining OS
    // focus is an exact, non-heuristic signal (matching
    // `ARCHITECTURE.md`'s "no fixed inactivity-timeout window" principle
    // for lock/sleep), so a plain blur/focus pair is enough -- no polling
    // needed.
    let backgroundPaused = false;
    function handleBlur() {
      if (!pauseOnBackground || backgroundPaused) return;
      backgroundPaused = true;
      invoke("pause_reading_session_command", { kind: "background" }).catch(() => {});
    }
    function handleFocus() {
      if (!backgroundPaused) return;
      backgroundPaused = false;
      invoke("resume_reading_session_command").catch(() => {});
    }
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    // "Auto-pause After 5 Minutes Inactivity": unlike background/lock,
    // there is no discrete "went idle" event, so this is the one place a
    // polling check against a real last-activity timestamp is
    // unavoidable -- the timeout itself is still the frozen 5 minutes,
    // not a heuristic window.
    let lastActivityMs = performance.now();
    let inactivityPaused = false;
    function handleActivity() {
      lastActivityMs = performance.now();
      if (inactivityPaused) {
        inactivityPaused = false;
        invoke("resume_reading_session_command").catch(() => {});
      }
    }
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity));
    const inactivityInterval = setInterval(() => {
      if (!inactivityPaused && autoPauseAfterInactivity && performance.now() - lastActivityMs >= INACTIVITY_TIMEOUT_MS) {
        inactivityPaused = true;
        invoke("pause_reading_session_command", { kind: "inactivity" }).catch(() => {});
      }
    }, INACTIVITY_CHECK_INTERVAL_MS);

    Promise.all([
      loadBooleanSetting(TRACK_ACTUAL_READING_TIME_KEY, DEFAULT_TRACK_ACTUAL_READING_TIME),
      loadBooleanSetting(PAUSE_ON_BACKGROUND_KEY, DEFAULT_PAUSE_ON_BACKGROUND),
      loadBooleanSetting(AUTO_PAUSE_AFTER_INACTIVITY_KEY, DEFAULT_AUTO_PAUSE_AFTER_INACTIVITY),
      loadBooleanSetting(COUNT_NOTE_TAKING_KEY, DEFAULT_COUNT_NOTE_TAKING),
    ]).then(([track, pauseBg, autoPause, countNotes]) => {
      trackEnabled = track;
      pauseOnBackground = pauseBg;
      autoPauseAfterInactivity = autoPause;
      countNoteTaking = countNotes;
    });

    return () => {
      clearInterval(interval);
      tick();
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      clearInterval(inactivityInterval);
    };
  }, [bookId, intervalMs]);
}
