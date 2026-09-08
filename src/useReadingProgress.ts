import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { justReachedCompletion } from "./completionTrigger";

export interface ReadingProgressDTO {
  completed_read_count: number;
  active_read_in_progress: boolean;
  active_pass_progress: number;
}

/// PRODUCT_SPEC.md SS8: tracks a Book's ReadingProgress and surfaces the
/// completion prompt exactly once per crossing into 100% ("Reaching the
/// final page completes the current read" -> "You finished this Book.
/// Start another read?"), not on every subsequent navigation tick once
/// already there.
export function useReadingProgress(bookId: string) {
  const [progress, setProgress] = useState<ReadingProgressDTO | null>(null);
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);
  const lastFractionRef = useRef(0);

  useEffect(() => {
    invoke<ReadingProgressDTO>("get_reading_progress_command", { bookId })
      .then((p) => {
        setProgress(p);
        lastFractionRef.current = p.active_read_in_progress ? p.active_pass_progress / 100 : 1;
      })
      .catch(() => {});
  }, [bookId]);

  const advance = useCallback(
    (fraction: number) => {
      const previous = lastFractionRef.current;
      lastFractionRef.current = fraction;

      invoke<ReadingProgressDTO>("advance_reading_progress_command", {
        bookId,
        progressPercent: fraction * 100,
      })
        .then(setProgress)
        .catch(() => {});

      if (justReachedCompletion(previous, fraction)) {
        invoke<ReadingProgressDTO>("complete_current_read_command", { bookId })
          .then((p) => {
            setProgress(p);
            setShowCompletionPrompt(true);
          })
          .catch(() => {});
      }
    },
    [bookId],
  );

  const startNextRead = useCallback(() => {
    setShowCompletionPrompt(false);
    lastFractionRef.current = 0;
    invoke<ReadingProgressDTO>("start_next_read_command", { bookId }).then(setProgress).catch(() => {});
  }, [bookId]);

  const dismissCompletionPrompt = useCallback(() => {
    setShowCompletionPrompt(false);
  }, []);

  return { progress, showCompletionPrompt, advance, startNextRead, dismissCompletionPrompt };
}
