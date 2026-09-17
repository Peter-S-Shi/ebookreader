import { useEffect, useState } from "react";
import {
  DEFAULT_READING_POSITION_INDICATOR_ENABLED,
  loadBooleanSetting,
  READING_POSITION_INDICATOR_ENABLED_KEY,
} from "./appSettings";

/// V2-M3 item 3: shared by Reader.tsx (EPUB) and TxtReader.tsx so both
/// read the same persisted On/Off preference the same way. Read-only here
/// -- the only place this is changed is Settings.
export function useReadingPositionIndicatorEnabled(): boolean {
  const [enabled, setEnabled] = useState(DEFAULT_READING_POSITION_INDICATOR_ENABLED);

  useEffect(() => {
    let cancelled = false;
    loadBooleanSetting(READING_POSITION_INDICATOR_ENABLED_KEY, DEFAULT_READING_POSITION_INDICATOR_ENABLED).then(
      (loaded) => {
        if (!cancelled) setEnabled(loaded);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
