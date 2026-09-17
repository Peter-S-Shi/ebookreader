// V2-M3 item 2: two independent presentation settings for how the Library
// grid shows reading progress. Both are display-only -- neither ever
// writes back to ReadingProgress; the underlying truth (completed_read_count,
// active_read_in_progress, active_pass_progress) is unaffected by either.
import type { ReadingProgressDTO } from "./useReadingProgress";

export type ProgressDisplayMode = "cumulative" | "current";
export type CompletedReadMarkMode = "show" | "hide";

/** Cumulative mode: the same `completed_read_count * 100 + active
 * progress` formula the domain layer's own `cumulative_percent()` uses.
 * Current-Read mode: the active read's own 0-100 position; a completed
 * book with no active next read reads as 100% (not 0%, since
 * active_pass_progress resets to 0 on completion); a never-started book
 * reads as 0%. */
export function computeLibraryDisplayPercent(progress: ReadingProgressDTO, mode: ProgressDisplayMode): number {
  if (mode === "cumulative") {
    const activePortion = progress.active_read_in_progress ? progress.active_pass_progress : 0;
    return progress.completed_read_count * 100 + activePortion;
  }
  if (progress.active_read_in_progress) return progress.active_pass_progress;
  return progress.completed_read_count >= 1 ? 100 : 0;
}

/** `null` when the mark should not render at all: hidden by setting, or
 * nothing has been completed yet regardless of setting. V2-M3 final
 * corrective: compact badge text ("Read Nx"), not body-text prose ("Read N
 * times"), since this now renders as a corner badge, not inline metadata. */
export function computeCompletedReadMarkText(progress: ReadingProgressDTO, markMode: CompletedReadMarkMode): string | null {
  if (markMode === "hide") return null;
  if (progress.completed_read_count < 1) return null;
  return `Read ${progress.completed_read_count}x`;
}
