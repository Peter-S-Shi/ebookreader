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
      expect.objectContaining({ bookId: "book-1", day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
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

describe("useActualReadingTimeHeartbeat — SS10 policy controls (FC-A06)", () => {
  it("pauses on window blur and resumes on window focus (Pause When App Is in Background)", async () => {
    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));
    await vi.advanceTimersByTimeAsync(0); // let the settings-loading promise resolve

    window.dispatchEvent(new Event("blur"));
    expect(invokeMock).toHaveBeenCalledWith("pause_reading_session_command", { kind: "background" });

    window.dispatchEvent(new Event("focus"));
    expect(invokeMock).toHaveBeenCalledWith("resume_reading_session_command");
  });

  it("does not pause on blur when Pause When App Is in Background is off", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === "actual_reading_time.pause_on_background") return "false";
      if (cmd === "reading_session_status_command") return { state: "active", total_excluded_ms: 0, total_note_taking_ms: 0 };
      return null;
    });

    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));
    await vi.advanceTimersByTimeAsync(0);

    window.dispatchEvent(new Event("blur"));
    expect(invokeMock).not.toHaveBeenCalledWith("pause_reading_session_command", { kind: "background" });
  });

  it("auto-pauses after 5 minutes with no activity, and resumes on the next activity", async () => {
    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(invokeMock).toHaveBeenCalledWith("pause_reading_session_command", { kind: "inactivity" });

    window.dispatchEvent(new Event("mousemove"));
    expect(invokeMock).toHaveBeenCalledWith("resume_reading_session_command");
  });

  it("does not auto-pause for inactivity when that policy is off", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === "actual_reading_time.auto_pause_after_inactivity") return "false";
      if (cmd === "reading_session_status_command") return { state: "active", total_excluded_ms: 0, total_note_taking_ms: 0 };
      return null;
    });

    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    expect(invokeMock).not.toHaveBeenCalledWith("pause_reading_session_command", { kind: "inactivity" });
  });

  it("counts note-taking time as excluded when Count Note-taking as Reading Time is off", async () => {
    let noteTakingMs = 0;
    invokeMock.mockImplementation(async (cmd: string, args?: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === "actual_reading_time.count_note_taking") return "false";
      if (cmd === "reading_session_status_command") {
        return { state: "active", total_excluded_ms: 0, total_note_taking_ms: noteTakingMs };
      }
      return null;
    });

    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));
    await vi.advanceTimersByTimeAsync(0); // priming read + settings load

    noteTakingMs = 400; // the user had the Notebook open for 400ms of this tick's interval
    await vi.advanceTimersByTimeAsync(1000);

    expect(invokeMock).toHaveBeenCalledWith(
      "record_active_reading_time_command",
      expect.objectContaining({ excludedSeconds: 0.4 }),
    );
  });

  it("does not exclude note-taking time when Count Note-taking as Reading Time is on (the default)", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "reading_session_status_command") {
        return { state: "active", total_excluded_ms: 0, total_note_taking_ms: 400 };
      }
      return null;
    });

    renderHook(() => useActualReadingTimeHeartbeat("book-1", 1000));
    await vi.advanceTimersByTimeAsync(1000);

    expect(invokeMock).toHaveBeenCalledWith(
      "record_active_reading_time_command",
      expect.objectContaining({ excludedSeconds: 0 }),
    );
  });
});
