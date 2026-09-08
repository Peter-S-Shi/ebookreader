import { useCallback, useRef, useState } from "react";
import { createPageTurnSound } from "./pageTurnSound";

/// DESIGN.md SS18: sound needs "an immediate On/Off control" (this hook's
/// `enabled`/`toggle`) alongside a Settings preference -- the Settings
/// surface itself is a later, separate checkpoint (DESIGN.md SS15), so
/// this is session-only for now, matching Typography's per-book override.
export function useSoundToggle() {
  const [enabled, setEnabled] = useState(true);
  const playerRef = useRef<(() => void) | null>(null);

  const toggle = useCallback(() => setEnabled((e) => !e), []);

  const playPageTurn = useCallback(() => {
    if (!enabled) return;
    playerRef.current ??= createPageTurnSound();
    playerRef.current();
  }, [enabled]);

  return { enabled, toggle, playPageTurn };
}
