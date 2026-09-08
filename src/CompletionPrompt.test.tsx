import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompletionPrompt } from "./CompletionPrompt";

describe("CompletionPrompt", () => {
  it("shows the exact PRODUCT_SPEC.md SS8.1 prompt text", () => {
    render(<CompletionPrompt onStartNextRead={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("You finished this Book. Start another read?")).toBeInTheDocument();
  });

  it("Yes calls onStartNextRead", async () => {
    const user = userEvent.setup();
    const onStartNextRead = vi.fn();
    render(<CompletionPrompt onStartNextRead={onStartNextRead} onDismiss={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(onStartNextRead).toHaveBeenCalled();
  });

  it("No calls onDismiss", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<CompletionPrompt onStartNextRead={vi.fn()} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "No" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
