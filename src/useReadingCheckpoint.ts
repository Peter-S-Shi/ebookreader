import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_READING_CHECKPOINT_ENABLED, loadBooleanSetting, READING_CHECKPOINT_ENABLED_KEY } from "./appSettings";

/// FC-A10 (`DESIGN.md` SS20 "Derived Screens": Reading Checkpoint):
/// intercepts a Reader's "Back to Library" exit with an optional,
/// dismissible reflection prompt, gated by the default-Off Settings
/// preference. Disabled (the common case until a user opts in) is a
/// pure pass-through -- `requestBack` calls the real `onBack`
/// immediately, with no prompt and no extra render.
export function useReadingCheckpoint() {
  const [enabled, setEnabled] = useState(DEFAULT_READING_CHECKPOINT_ENABLED);
  const [showPrompt, setShowPrompt] = useState(false);
  const pendingBackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBooleanSetting(READING_CHECKPOINT_ENABLED_KEY, DEFAULT_READING_CHECKPOINT_ENABLED).then((loaded) => {
      if (!cancelled) setEnabled(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestBack = useCallback(
    (onBack: () => void) => {
      if (!enabled) {
        onBack();
        return;
      }
      pendingBackRef.current = onBack;
      setShowPrompt(true);
    },
    [enabled],
  );

  const dismiss = useCallback(() => {
    setShowPrompt(false);
    const onBack = pendingBackRef.current;
    pendingBackRef.current = null;
    onBack?.();
  }, []);

  return { showPrompt, requestBack, dismiss };
}
