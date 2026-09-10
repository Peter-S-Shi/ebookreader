import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Calendar } from "./Calendar";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("Calendar Canonical Surface (ER-CAL-001; C2 Batch 4)", () => {
  it("renders calendar month grid and detail panel", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_calendar_range_command") return [];
      if (cmd === "get_calendar_day_command") return { actual_seconds: 1800, planned_seconds: 3600 };
      return null;
    });

    const { container } = render(<Calendar />);

    expect(screen.getByRole("region", { name: "Calendar" })).toBeInTheDocument();
    expect(container.querySelector(".calendar-grid")).toBeInTheDocument();
    expect(container.querySelector(".calendar-detail")).toBeInTheDocument();
  });
});
