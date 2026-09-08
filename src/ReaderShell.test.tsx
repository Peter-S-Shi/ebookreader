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
});
