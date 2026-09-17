import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCENT_COLOR_KEY,
  applyAppearance,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_COMPLETED_READ_MARK_MODE,
  DEFAULT_PROGRESS_DISPLAY_MODE,
  DEFAULT_THEME_MODE,
  loadGlobalTypography,
  loadLibrarySortOption,
  loadPerBookTypography,
  loadCompletedReadMarkMode,
  loadLibraryProgressDisplayMode,
  getSetting,
  loadAndApplyAppearance,
  saveCompletedReadMarkMode,
  saveGlobalTypography,
  saveLibraryProgressDisplayMode,
  saveLibrarySortOption,
  savePerBookTypography,
  setSetting,
  THEME_MODE_KEY,
  TYPOGRAPHY_GLOBAL_KEY,
  typographyBookKey,
} from "./appSettings";
import { DEFAULT_TYPOGRAPHY } from "./typography";

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

describe("library progress-display settings (V2-M3 item 2)", () => {
  it("defaults progress display to cumulative and the completed-read mark to shown when nothing is persisted", async () => {
    invokeMock.mockResolvedValueOnce(null);
    expect(await loadLibraryProgressDisplayMode()).toBe(DEFAULT_PROGRESS_DISPLAY_MODE);

    invokeMock.mockResolvedValueOnce(null);
    expect(await loadCompletedReadMarkMode()).toBe(DEFAULT_COMPLETED_READ_MARK_MODE);
  });

  it("loads a persisted current-read display mode and hidden mark", async () => {
    invokeMock.mockResolvedValueOnce("current");
    expect(await loadLibraryProgressDisplayMode()).toBe("current");

    invokeMock.mockResolvedValueOnce("hide");
    expect(await loadCompletedReadMarkMode()).toBe("hide");
  });

  it("falls back to defaults for a stale/corrupt stored value rather than coercing it", async () => {
    invokeMock.mockResolvedValueOnce("not-a-real-mode");
    expect(await loadLibraryProgressDisplayMode()).toBe(DEFAULT_PROGRESS_DISPLAY_MODE);

    invokeMock.mockResolvedValueOnce("not-a-real-mode");
    expect(await loadCompletedReadMarkMode()).toBe(DEFAULT_COMPLETED_READ_MARK_MODE);
  });

  it("persists changes via the generic setting store", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await saveLibraryProgressDisplayMode("current");
    expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: "library.progress_display_mode", value: "current" });

    invokeMock.mockResolvedValueOnce(undefined);
    await saveCompletedReadMarkMode("hide");
    expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: "library.completed_read_mark_mode", value: "hide" });
  });

  it("defaults library sort option to recent-import-desc when unset or corrupt", async () => {
    invokeMock.mockResolvedValueOnce(null);
    expect(await loadLibrarySortOption()).toBe("recent-import-desc");

    invokeMock.mockResolvedValueOnce("invalid-sort-option");
    expect(await loadLibrarySortOption()).toBe("recent-import-desc");
  });

  it("loads and saves library sort option", async () => {
    invokeMock.mockResolvedValueOnce("title-asc");
    expect(await loadLibrarySortOption()).toBe("title-asc");

    invokeMock.mockResolvedValueOnce(undefined);
    await saveLibrarySortOption("recent-open-desc");
    expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: "library.sort_option", value: "recent-open-desc" });
  });
});

describe("typography settings", () => {
  it("loads global typography defaults from the generic settings store", async () => {
    invokeMock.mockResolvedValueOnce(
      JSON.stringify({
        ...DEFAULT_TYPOGRAPHY,
        font: { source: "SYSTEM", family: "Georgia" },
        marginPercent: 9,
      }),
    );

    expect(await loadGlobalTypography()).toMatchObject({
      font: { source: "SYSTEM", family: "Georgia" },
      marginPercent: 9,
    });
    expect(invokeMock).toHaveBeenCalledWith("get_setting_command", { key: TYPOGRAPHY_GLOBAL_KEY });
  });

  it("saves global typography defaults as one coherent serialized value", async () => {
    await saveGlobalTypography({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 125 });

    expect(invokeMock).toHaveBeenCalledWith("set_setting_command", {
      key: TYPOGRAPHY_GLOBAL_KEY,
      value: expect.stringContaining('"fontSizePercent":125'),
    });
  });

  it("uses a per-book override when present, otherwise falls back to the global default", async () => {
    invokeMock.mockImplementation(async (cmd: string, args: { key?: string }) => {
      if (cmd === "get_setting_command" && args.key === typographyBookKey("book-1")) return null;
      if (cmd === "get_setting_command" && args.key === TYPOGRAPHY_GLOBAL_KEY) {
        return JSON.stringify({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 110 });
      }
      return null;
    });

    expect(await loadPerBookTypography("book-1")).toMatchObject({ fontSizePercent: 110 });
  });

  it("uses the per-book override itself when one is actually set, not the global default", async () => {
    invokeMock.mockImplementation(async (cmd: string, args: { key?: string }) => {
      if (cmd === "get_setting_command" && args.key === typographyBookKey("book-1")) {
        return JSON.stringify({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 130 });
      }
      if (cmd === "get_setting_command" && args.key === TYPOGRAPHY_GLOBAL_KEY) {
        return JSON.stringify({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 110 });
      }
      return null;
    });

    expect(await loadPerBookTypography("book-1")).toMatchObject({ fontSizePercent: 130 });
  });

  it("saves per-book typography overrides under the book-specific key", async () => {
    await savePerBookTypography("book-1", { ...DEFAULT_TYPOGRAPHY, lineHeight: 1.8 });

    expect(invokeMock).toHaveBeenCalledWith("set_setting_command", {
      key: typographyBookKey("book-1"),
      value: expect.stringContaining('"lineHeight":1.8'),
    });
  });
});
