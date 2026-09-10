import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSoundToggle } from "./useSoundToggle";
import { SOUND_PAGE_TURN_ENABLED_KEY } from "./appSettings";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(null);
});

describe("useSoundToggle", () => {
  it("starts enabled by default when no preference is persisted yet", () => {
    const { result } = renderHook(() => useSoundToggle());
    expect(result.current.enabled).toBe(true);
  });

  it("loads a persisted 'off' preference on mount (FC-A09)", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === SOUND_PAGE_TURN_ENABLED_KEY) return "false";
      return null;
    });

    const { result } = renderHook(() => useSoundToggle());

    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it("toggles enabled off and back on, persisting each change", async () => {
    const { result } = renderHook(() => useSoundToggle());
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_setting_command", { key: SOUND_PAGE_TURN_ENABLED_KEY }));

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: SOUND_PAGE_TURN_ENABLED_KEY, value: "false" }),
    );

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: SOUND_PAGE_TURN_ENABLED_KEY, value: "true" }),
    );
  });

  it("playPageTurn does not throw when disabled or enabled", () => {
    const { result } = renderHook(() => useSoundToggle());
    expect(() => act(() => result.current.playPageTurn())).not.toThrow();

    act(() => result.current.toggle());
    expect(() => act(() => result.current.playPageTurn())).not.toThrow();
  });
});
