import { useCallback, useEffect, useRef, useState } from "react";
import { createPageTurnSound } from "./pageTurnSound";
import { DEFAULT_SOUND_PAGE_TURN_ENABLED, loadBooleanSetting, saveBooleanSetting, SOUND_PAGE_TURN_ENABLED_KEY } from "./appSettings";

/// DESIGN.md SS15/SS18: Page Turn Sound On/Off is a persisted Settings
/// preference (FC-A09), not session-only -- this hook still offers the
/// immediate in-Reader On/Off control DESIGN.md SS18 also names, but a
/// toggle here now persists across Readers/restarts via the same
/// generic `app_setting` store the rest of Settings uses.
export function useSoundToggle() {
  const [enabled, setEnabled] = useState(DEFAULT_SOUND_PAGE_TURN_ENABLED);
  const playerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBooleanSetting(SOUND_PAGE_TURN_ENABLED_KEY, DEFAULT_SOUND_PAGE_TURN_ENABLED).then((loaded) => {
      if (!cancelled) setEnabled(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => {
    setEnabled((e) => {
      const next = !e;
      saveBooleanSetting(SOUND_PAGE_TURN_ENABLED_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const playPageTurn = useCallback(() => {
    if (!enabled) return;
    playerRef.current ??= createPageTurnSound();
    playerRef.current();
  }, [enabled]);

  return { enabled, toggle, playPageTurn };
}
