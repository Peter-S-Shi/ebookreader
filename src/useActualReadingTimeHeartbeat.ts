import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ReadingSessionStatusDTO {
  state: string;
  total_excluded_ms: number;
}

/// PRODUCT_SPEC.md SS10 Actual Reading Time: while a Book's Reader is
/// mounted, periodically records real elapsed time net of any OS lock/
/// sleep exclusion that happened during the same interval (the one
/// exclusion this checkpoint wires through end-to-end -- see
/// actual_reading_time.rs for the other three Settings policies SS10
/// names, explicitly deferred). Flushes a final interval on unmount so
/// closing the Reader doesn't lose the last partial tick.
export function useActualReadingTimeHeartbeat(bookId: string, intervalMs = 30_000) {
  useEffect(() => {
    let lastCheckpointMs = performance.now();
    let lastExcludedMs = 0;

    async function readExcludedMs(): Promise<number> {
      try {
        const status = await invoke<ReadingSessionStatusDTO>("reading_session_status_command");
        return status.total_excluded_ms;
      } catch {
        return lastExcludedMs;
      }
    }

    readExcludedMs().then((ms) => {
      lastExcludedMs = ms;
    });

    async function tick() {
      const nowMs = performance.now();
      const elapsedSeconds = (nowMs - lastCheckpointMs) / 1000;
      const excludedNowMs = await readExcludedMs();
      const excludedSeconds = Math.max(0, excludedNowMs - lastExcludedMs) / 1000;

      lastCheckpointMs = nowMs;
      lastExcludedMs = excludedNowMs;

      // Recording a zero (or near-zero) interval is harmless -- it just
      // adds nothing -- so there's no need to gate this call, which would
      // otherwise make the unmount-flush timing-sensitive.
      invoke("record_active_reading_time_command", { bookId, elapsedSeconds, excludedSeconds }).catch(() => {});
    }

    const interval = setInterval(tick, intervalMs);
    return () => {
      clearInterval(interval);
      tick();
    };
  }, [bookId, intervalMs]);
}
