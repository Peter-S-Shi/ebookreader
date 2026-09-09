import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCENT_COLOR_KEY,
  applyAppearance,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_THEME_MODE,
  getSetting,
  loadAndApplyAppearance,
  setSetting,
  THEME_MODE_KEY,
} from "./appSettings";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.removeProperty("--accent-color");
});

describe("getSetting / setSetting", () => {
  it("reads a setting via get_setting_command", async () => {
    invokeMock.mockResolvedValueOnce("dark");
    expect(await getSetting(THEME_MODE_KEY)).toBe("dark");
    expect(invokeMock).toHaveBeenCalledWith("get_setting_command", { key: THEME_MODE_KEY });
  });

  it("writes a setting via set_setting_command", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await setSetting(ACCENT_COLOR_KEY, "#ff0000");
    expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: ACCENT_COLOR_KEY, value: "#ff0000" });
  });
});

describe("applyAppearance", () => {
  it("sets data-theme for an explicit light/dark choice", () => {
    applyAppearance("dark", "#123456");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--accent-color")).toBe("#123456");
  });

  it("clears data-theme for system (falls through to prefers-color-scheme)", () => {
    document.documentElement.dataset.theme = "dark";
    applyAppearance("system", "#123456");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("loadAndApplyAppearance", () => {
  it("falls back to defaults when nothing has been persisted yet", async () => {
    invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const result = await loadAndApplyAppearance();
    expect(result).toEqual({ themeMode: DEFAULT_THEME_MODE, accentColor: DEFAULT_ACCENT_COLOR });
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("applies a previously persisted theme and accent", async () => {
    invokeMock.mockResolvedValueOnce("light").mockResolvedValueOnce("#00ff00");
    const result = await loadAndApplyAppearance();
    expect(result).toEqual({ themeMode: "light", accentColor: "#00ff00" });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--accent-color")).toBe("#00ff00");
  });
});
