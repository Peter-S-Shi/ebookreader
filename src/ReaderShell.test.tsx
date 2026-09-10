import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReaderShell } from "./ReaderShell";

describe("ReaderShell Focus mode", () => {
  it("shows the title, Back button, and toolbar extras normally", () => {
    render(
      <ReaderShell title="My Book" onBack={vi.fn()} toolbarExtra={<button type="button">Aa</button>}>
        <p>content</p>
      </ReaderShell>,
    );
    expect(screen.getByText("My Book")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aa" })).toBeInTheDocument();
  });

  it("hides title, Back, and toolbar extras in Focus mode, keeping only Exit Focus", async () => {
    const user = userEvent.setup();
    render(
      <ReaderShell title="My Book" onBack={vi.fn()} toolbarExtra={<button type="button">Aa</button>}>
        <p>content</p>
      </ReaderShell>,
    );

    await user.click(screen.getByRole("button", { name: "Focus" }));

    expect(screen.queryByText("My Book")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aa" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit Focus" })).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("restores the full toolbar when Exit Focus is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ReaderShell title="My Book" onBack={vi.fn()}>
        <p>content</p>
      </ReaderShell>,
    );

    await user.click(screen.getByRole("button", { name: "Focus" }));
    await user.click(screen.getByRole("button", { name: "Exit Focus" }));

    expect(screen.getByText("My Book")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Library" })).toBeInTheDocument();
  });

  it("truncates a long title (via CSS class + tooltip) instead of crowding out toolbar controls (HA-004)", () => {
    const longTitle =
      "A Very Long Book Title That Would Otherwise Push Every Toolbar Control Off-screen Or Onto A Second Line";
    render(
      <ReaderShell
        title={longTitle}
        onBack={vi.fn()}
        status="Ready"
        toolbarExtra={
          <>
            <button type="button">Contents</button>
            <button type="button">Aa</button>
            <button type="button" aria-label="Toggle page-turn sound">
              Sound: On
            </button>
            <button type="button">Notebook</button>
          </>
        }
      >
        <p>content</p>
      </ReaderShell>,
    );

    const titleEl = screen.getByText(longTitle);
    expect(titleEl).toHaveClass("reader-title");
    expect(titleEl).toHaveAttribute("title", longTitle);
    // Every entry point must stay reachable regardless of title length --
    // the title truncates via CSS ellipsis, never these controls.
    expect(screen.getByRole("button", { name: "Back to Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle page-turn sound" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notebook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Focus" })).toBeInTheDocument();
  });

  it("hides the overlay (e.g. an open Typography panel) while in Focus mode", async () => {
    const user = userEvent.setup();
    render(
      <ReaderShell title="My Book" onBack={vi.fn()} overlay={<div>Typography Panel</div>}>
        <p>content</p>
      </ReaderShell>,
    );
    expect(screen.getByText("Typography Panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Focus" }));

    expect(screen.queryByText("Typography Panel")).not.toBeInTheDocument();
  });

  it("renders a compact reading progress affordance when progressPercent is supplied", () => {
    render(
      <ReaderShell title="My Book" onBack={vi.fn()} progressPercent={42.8}>
        <p>content</p>
      </ReaderShell>,
    );

    expect(screen.getByLabelText("Reading progress: 43%")).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
  });
});
