import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";
import { ACCENT_COLOR_KEY, AUTO_PAUSE_AFTER_INACTIVITY_KEY, COUNT_NOTE_TAKING_KEY, PAUSE_ON_BACKGROUND_KEY, THEME_MODE_KEY, TRACK_ACTUAL_READING_TIME_KEY } from "./appSettings";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  document.documentElement.removeAttribute("data-theme");
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
