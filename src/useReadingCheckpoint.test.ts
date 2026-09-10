import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingCheckpoint } from "./useReadingCheckpoint";
import { READING_CHECKPOINT_ENABLED_KEY } from "./appSettings";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(null);
});

describe("useReadingCheckpoint (PRODUCT_SPEC.md/DESIGN.md SS20; FC-A10)", () => {
  it("calls onBack immediately when the preference is off (the default)", async () => {
    const { result } = renderHook(() => useReadingCheckpoint());
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("get_setting_command", { key: READING_CHECKPOINT_ENABLED_KEY }),
    );

    const onBack = vi.fn();
    act(() => result.current.requestBack(onBack));

    expect(onBack).toHaveBeenCalled();
    expect(result.current.showPrompt).toBe(false);
  });

  it("shows the prompt and withholds onBack until dismissed when the preference is on", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === READING_CHECKPOINT_ENABLED_KEY) return "true";
      return null;
    });

    const { result } = renderHook(() => useReadingCheckpoint());
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("get_setting_command", { key: READING_CHECKPOINT_ENABLED_KEY }),
    );
    // The mock call above confirms `invoke` resolved; flush the
    // subsequent `.then(setEnabled)` React state update it queued before
    // exercising behavior that depends on `enabled` already being true.
    await act(async () => {});

    const onBack = vi.fn();
    act(() => result.current.requestBack(onBack));

    expect(result.current.showPrompt).toBe(true);
    expect(onBack).not.toHaveBeenCalled();

    act(() => result.current.dismiss());

    expect(result.current.showPrompt).toBe(false);
    expect(onBack).toHaveBeenCalled();
  });
});
