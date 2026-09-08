import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActualReadingTimeHeartbeat } from "./useActualReadingTimeHeartbeat";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ state: "active", total_excluded_ms: 0 });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useActualReadingTimeHeartbeat", () => {
  it("records elapsed active time on each tick", async () => {
    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));

    await vi.advanceTimersByTimeAsync(1000);

    expect(invokeMock).toHaveBeenCalledWith(
      "record_active_reading_time_command",
      expect.objectContaining({ bookId: "book-1" }),
    );
  });

  it("nets out excluded time reported by reading_session_status_command between ticks", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "reading_session_status_command") {
        return Promise.resolve({ state: "active", total_excluded_ms: 300 });
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));
    await vi.advanceTimersByTimeAsync(1000);

    // First tick: excluded delta from the priming read (300) to this tick's
    // read (still 300) is 0 -- excludedSeconds should be 0 on this tick.
    expect(invokeMock).toHaveBeenCalledWith(
      "record_active_reading_time_command",
      expect.objectContaining({ excludedSeconds: 0 }),
    );
  });

  it("flushes a final tick on unmount", async () => {
    const { unmount } = renderHook(() => useActualReadingTimeHeartbeat("book-1", 60_000));

    unmount();
    await vi.advanceTimersByTimeAsync(0);

    expect(invokeMock).toHaveBeenCalledWith(
      "record_active_reading_time_command",
      expect.objectContaining({ bookId: "book-1" }),
    );
  });
});
