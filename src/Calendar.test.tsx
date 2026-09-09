import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Calendar } from "./Calendar";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "get_calendar_range_command") return Promise.resolve([]);
    if (cmd === "get_calendar_day_command") {
      return Promise.resolve({ actual_seconds: 0, planned_seconds: null });
    }
    return Promise.resolve(undefined);
  });
});

describe("Calendar", () => {
  it("loads the current month's activity range and today's day detail on mount", async () => {
    render(<Calendar />);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_calendar_range_command", expect.anything()));
    expect(invokeMock).toHaveBeenCalledWith("get_calendar_day_command", expect.objectContaining({ day: expect.any(String) }));
  });

  it("shows a day's actual reading time and marks planned as Not set when no goal is in effect", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_calendar_range_command") return Promise.resolve([]);
      if (cmd === "get_calendar_day_command") {
        return Promise.resolve({ actual_seconds: 3120, planned_seconds: null });
      }
      return Promise.resolve(undefined);
    });

    render(<Calendar />);

    expect(await screen.findByText("52m")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("shows the planned figure in effect for the selected day", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_calendar_range_command") return Promise.resolve([]);
      if (cmd === "get_calendar_day_command") {
        return Promise.resolve({ actual_seconds: 0, planned_seconds: 5400 });
      }
      return Promise.resolve(undefined);
    });

    render(<Calendar />);

    expect(await screen.findByText("1h 30m")).toBeInTheDocument();
  });

  it("clicking a day cell selects it and loads its detail", async () => {
    const user = userEvent.setup();
    render(<Calendar />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_calendar_day_command", expect.anything()));
    invokeMock.mockClear();

    const dayFifteen = screen.getByRole("gridcell", { name: "15" });
    await user.click(dayFifteen);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "get_calendar_day_command",
        expect.objectContaining({ day: expect.stringMatching(/-15$/) }),
      ),
    );
  });

  it("saving a daily goal calls set_daily_goal_command with the entered hours converted to seconds", async () => {
    const user = userEvent.setup();
    render(<Calendar />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_calendar_day_command", expect.anything()));

    const input = screen.getByLabelText("Daily reading goal in hours");
    await user.clear(input);
    await user.type(input, "1.5");
    await user.click(screen.getByRole("button", { name: "Save goal" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "set_daily_goal_command",
        expect.objectContaining({ seconds: 5400, effectiveDay: expect.any(String) }),
      ),
    );
  });
});
