import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  document.documentElement.removeAttribute("data-theme");
  delete document.documentElement.dataset.motion;
});

describe("Settings Canonical Surface (ER-SET-001; C2 Batch 2)", () => {
  it("renders with canonical settings-panel container and structured sections", async () => {
    invokeMock.mockResolvedValue(null);
    const { container } = render(<Settings />);

    expect(await screen.findByRole("radio", { name: "Match System" })).toBeInTheDocument();

    const panel = container.querySelector(".settings-panel");
    expect(panel).toBeInTheDocument();

    // Verify sections exist as card structures
    const sections = container.querySelectorAll(".settings-section");
    expect(sections.length).toBeGreaterThanOrEqual(6);

    // Verify Appearance segmented control and color cell
    const seg = container.querySelector(".seg");
    expect(seg).toBeInTheDocument();
    const colorCell = container.querySelector(".colorCell");
    expect(colorCell).toBeInTheDocument();
  });
});
