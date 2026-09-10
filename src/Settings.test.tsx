import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";
import {
  ACCENT_COLOR_KEY,
  AUTO_PAUSE_AFTER_INACTIVITY_KEY,
  COUNT_NOTE_TAKING_KEY,
  PAUSE_ON_BACKGROUND_KEY,
  REDUCED_MOTION_KEY,
  SOUND_PAGE_TURN_ENABLED_KEY,
  THEME_MODE_KEY,
  TRACK_ACTUAL_READING_TIME_KEY,
  TYPOGRAPHY_GLOBAL_KEY,
} from "./appSettings";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  document.documentElement.removeAttribute("data-theme");
  delete document.documentElement.dataset.motion;
});

describe("Settings — Appearance", () => {
  it("loads persisted theme mode and accent color on mount", async () => {
    invokeMock.mockResolvedValueOnce("dark").mockResolvedValueOnce("#abcdef");
    render(<Settings />);

    expect(await screen.findByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByLabelText("Accent Color")).toHaveValue("#abcdef");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("defaults to Match System when nothing is persisted yet", async () => {
    invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    render(<Settings />);

    expect(await screen.findByRole("radio", { name: "Match System" })).toBeChecked();
  });

  it("persists a theme mode change and applies it immediately", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    render(<Settings />);
    await screen.findByRole("radio", { name: "Match System" });

    invokeMock.mockResolvedValueOnce(undefined); // set_setting_command
    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: THEME_MODE_KEY, value: "dark" }),
    );
  });

  it("persists an accent color change", async () => {
    invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    render(<Settings />);
    await screen.findByLabelText("Accent Color");

    invokeMock.mockResolvedValueOnce(undefined); // set_setting_command
    // jsdom color inputs don't support real user typing; go through the
    // native value setter (bypassing React's tracked-value shim) and fire
    // the events a native color picker would dispatch.
    const input = screen.getByLabelText("Accent Color") as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    nativeSetter.call(input, "#112233");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: ACCENT_COLOR_KEY, value: "#112233" }),
    );
  });
});

describe("Settings — Actual Reading Time (PRODUCT_SPEC.md SS10; FC-A06)", () => {
  it("defaults all four policies to On when nothing is persisted yet", async () => {
    invokeMock.mockResolvedValue(null);
    render(<Settings />);

    expect(await screen.findByRole("checkbox", { name: "Track Actual Reading Time" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pause When App Is in Background" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Auto-pause After 5 Minutes Inactivity" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Count Note-taking as Reading Time" })).toBeChecked();
  });

  it("loads a persisted 'off' value for one policy without affecting the others", async () => {
    invokeMock.mockImplementation(async (cmd: string, args: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === PAUSE_ON_BACKGROUND_KEY) return "false";
      return null;
    });
    render(<Settings />);

    expect(await screen.findByRole("checkbox", { name: "Pause When App Is in Background" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Track Actual Reading Time" })).toBeChecked();
  });

  it("persists turning off Track Actual Reading Time", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    render(<Settings />);
    const checkbox = await screen.findByRole("checkbox", { name: "Track Actual Reading Time" });

    await user.click(checkbox);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: TRACK_ACTUAL_READING_TIME_KEY, value: "false" }),
    );
  });

  it("persists turning off Count Note-taking as Reading Time", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    render(<Settings />);
    const checkbox = await screen.findByRole("checkbox", { name: "Count Note-taking as Reading Time" });

    await user.click(checkbox);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: COUNT_NOTE_TAKING_KEY, value: "false" }),
    );
  });

  it("persists turning off Auto-pause After 5 Minutes Inactivity", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    render(<Settings />);
    const checkbox = await screen.findByRole("checkbox", { name: "Auto-pause After 5 Minutes Inactivity" });

    await user.click(checkbox);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", {
        key: AUTO_PAUSE_AFTER_INACTIVITY_KEY,
        value: "false",
      }),
    );
  });
});

describe("Settings — Typography defaults (PRODUCT_SPEC.md SS7.4; FC-A08)", () => {
  it("exposes persisted global typography defaults in Settings", async () => {
    invokeMock.mockImplementation(async (cmd: string, args: { key?: string }) => {
      if (cmd === "get_setting_command" && args.key === TYPOGRAPHY_GLOBAL_KEY) {
        return JSON.stringify({
          font: { source: "SYSTEM", family: "Georgia" },
          cjkFont: { source: "SYSTEM", family: "Microsoft YaHei" },
          fontSizePercent: 115,
          lineHeight: 1.6,
          pageWidthCh: 66,
          marginPercent: 8,
        });
      }
      if (cmd === "list_system_fonts_command") return ["Georgia", "Microsoft YaHei"];
      return null;
    });

    render(<Settings />);

    expect(await screen.findByRole("group", { name: "Typography" })).toBeInTheDocument();
    expect(screen.getByLabelText("Font Source")).toHaveValue("SYSTEM:Georgia");
    expect(screen.getByLabelText("CJK Font Override")).toHaveValue("SYSTEM:Microsoft YaHei");
    expect(screen.getByLabelText("Margins")).toHaveValue("8");
  });

  it("persists a global typography default change", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_system_fonts_command") return ["Georgia"];
      return null;
    });
    render(<Settings />);
    await screen.findByRole("group", { name: "Typography" });

    await user.selectOptions(screen.getByLabelText("Font Source"), "SYSTEM:Georgia");

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", {
        key: TYPOGRAPHY_GLOBAL_KEY,
        value: expect.stringContaining('"family":"Georgia"'),
      }),
    );
  });
});

describe("Settings — Sound & Motion (DESIGN.md SS15/SS17/SS18; FC-A09)", () => {
  it("defaults to Page Turn Sound on and Standard motion when nothing is persisted yet", async () => {
    invokeMock.mockResolvedValue(null);
    render(<Settings />);

    expect(await screen.findByRole("checkbox", { name: "Page Turn Sound" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Standard" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Reduced" })).not.toBeChecked();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it("loads a persisted Reduced Motion preference and applies it to the document", async () => {
    invokeMock.mockImplementation(async (cmd: string, args: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === REDUCED_MOTION_KEY) return "true";
      return null;
    });
    render(<Settings />);

    expect(await screen.findByRole("radio", { name: "Reduced" })).toBeChecked();
    expect(document.documentElement.dataset.motion).toBe("reduced");
  });

  it("persists turning off Page Turn Sound", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    render(<Settings />);
    const checkbox = await screen.findByRole("checkbox", { name: "Page Turn Sound" });

    await user.click(checkbox);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: SOUND_PAGE_TURN_ENABLED_KEY, value: "false" }),
    );
  });

  it("selecting Reduced persists it and applies it to the document immediately", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    render(<Settings />);
    await screen.findByRole("radio", { name: "Standard" });

    await user.click(screen.getByRole("radio", { name: "Reduced" }));

    expect(document.documentElement.dataset.motion).toBe("reduced");
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_setting_command", { key: REDUCED_MOTION_KEY, value: "true" }),
    );
  });
});
