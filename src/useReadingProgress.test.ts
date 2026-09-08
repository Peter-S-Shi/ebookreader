import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingProgress } from "./useReadingProgress";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("useReadingProgress", () => {
  it("loads the current progress on mount", async () => {
    invokeMock.mockResolvedValueOnce({ completed_read_count: 0, active_read_in_progress: true, active_pass_progress: 20 });
    const { result } = renderHook(() => useReadingProgress("book-1"));

    await waitFor(() => expect(result.current.progress?.active_pass_progress).toBe(20));
    expect(invokeMock).toHaveBeenCalledWith("get_reading_progress_command", { bookId: "book-1" });
  });

  it("advancing progress calls advance_reading_progress_command with a 0-100 percent", async () => {
    invokeMock.mockResolvedValueOnce({ completed_read_count: 0, active_read_in_progress: true, active_pass_progress: 0 });
    const { result } = renderHook(() => useReadingProgress("book-1"));
    await waitFor(() => expect(result.current.progress).not.toBeNull());

    invokeMock.mockResolvedValueOnce({ completed_read_count: 0, active_read_in_progress: true, active_pass_progress: 50 });
    act(() => result.current.advance(0.5));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("advance_reading_progress_command", { bookId: "book-1", progressPercent: 50 }),
    );
  });

  it("shows the completion prompt exactly once when fraction first reaches 1.0", async () => {
    invokeMock.mockResolvedValueOnce({ completed_read_count: 0, active_read_in_progress: true, active_pass_progress: 90 });
    const { result } = renderHook(() => useReadingProgress("book-1"));
    await waitFor(() => expect(result.current.progress).not.toBeNull());

    invokeMock.mockResolvedValueOnce({ completed_read_count: 0, active_read_in_progress: true, active_pass_progress: 100 }); // advance call
    invokeMock.mockResolvedValueOnce({ completed_read_count: 1, active_read_in_progress: false, active_pass_progress: 0 }); // complete call
    act(() => result.current.advance(1.0));

    await waitFor(() => expect(result.current.showCompletionPrompt).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("complete_current_read_command", { bookId: "book-1" });

    // A further advance at the same (already-completed) fraction must not re-trigger.
    invokeMock.mockClear();
    invokeMock.mockResolvedValueOnce({ completed_read_count: 1, active_read_in_progress: false, active_pass_progress: 0 });
    act(() => result.current.advance(1.0));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("advance_reading_progress_command", expect.anything()));
    expect(invokeMock).not.toHaveBeenCalledWith("complete_current_read_command", expect.anything());
  });

  it("startNextRead dismisses the prompt and resets tracking to 0", async () => {
    invokeMock.mockResolvedValueOnce({ completed_read_count: 1, active_read_in_progress: false, active_pass_progress: 0 });
    const { result } = renderHook(() => useReadingProgress("book-1"));
    await waitFor(() => expect(result.current.progress).not.toBeNull());

    invokeMock.mockResolvedValueOnce({ completed_read_count: 1, active_read_in_progress: true, active_pass_progress: 0 });
    act(() => result.current.startNextRead());

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("start_next_read_command", { bookId: "book-1" }));
    expect(result.current.showCompletionPrompt).toBe(false);
  });
});
