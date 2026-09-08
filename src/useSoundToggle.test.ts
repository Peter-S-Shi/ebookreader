import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSoundToggle } from "./useSoundToggle";

describe("useSoundToggle", () => {
  it("starts enabled", () => {
    const { result } = renderHook(() => useSoundToggle());
    expect(result.current.enabled).toBe(true);
  });

  it("toggles enabled off and back on", () => {
    const { result } = renderHook(() => useSoundToggle());

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
  });

  it("playPageTurn does not throw when disabled or enabled", () => {
    const { result } = renderHook(() => useSoundToggle());
    expect(() => act(() => result.current.playPageTurn())).not.toThrow();

    act(() => result.current.toggle());
    expect(() => act(() => result.current.playPageTurn())).not.toThrow();
  });
});
