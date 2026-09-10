import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  document.documentElement.removeAttribute("data-theme");
  delete document.documentElement.dataset.motion;
});

describe("Settings Canonical Surface (ER-SET-001; C2 Batch 2 Corrective)", () => {
  it("renders canonical settingsLayout with persistent secondary subnav and active pane", async () => {
    invokeMock.mockResolvedValue(null);
    const { container } = render(<Settings />);

    expect(await screen.findByRole("radio", { name: "Match System" })).toBeInTheDocument();

    const layout = container.querySelector(".settingsLayout");
    expect(layout).toBeInTheDocument();

    const subnav = container.querySelector(".settingsSubnav");
    expect(subnav).toBeInTheDocument();

    const subnavButtons = subnav?.querySelectorAll(".setNav");
    expect(subnavButtons?.length).toBe(6);

    const appearanceBtn = screen.getByRole("button", { name: "Appearance" });
    expect(appearanceBtn).toHaveClass("active");

    const activePane = container.querySelector(".settingsPane.active");
    expect(activePane).toBeInTheDocument();
    expect(activePane?.id).toBe("appearancePane");
  });

  it("switches active settings pane when subnav item is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    const { container } = render(<Settings />);

    await screen.findByRole("button", { name: "Appearance" });

    const readingBtn = screen.getByRole("button", { name: "Reading" });
    await user.click(readingBtn);

    expect(readingBtn).toHaveClass("active");
    const activePane = container.querySelector(".settingsPane.active");
    expect(activePane?.id).toBe("readingPane");
  });
});
