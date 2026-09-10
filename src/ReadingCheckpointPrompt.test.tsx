import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReadingCheckpointPrompt } from "./ReadingCheckpointPrompt";

describe("ReadingCheckpointPrompt (FC-A10)", () => {
  it("Skip dismisses without saving a note", async () => {
    const user = userEvent.setup();
    const onSaveNote = vi.fn();
    const onDismiss = vi.fn();

    render(<ReadingCheckpointPrompt onSaveNote={onSaveNote} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(onSaveNote).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("Save & Continue saves the written reflection as a Note, then dismisses", async () => {
    const user = userEvent.setup();
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    const onDismiss = vi.fn();

    render(<ReadingCheckpointPrompt onSaveNote={onSaveNote} onDismiss={onDismiss} />);
    await user.type(screen.getByLabelText("Reading Checkpoint reflection"), "This chapter surprised me.");
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(onSaveNote).toHaveBeenCalledWith("This chapter surprised me.");
    expect(onDismiss).toHaveBeenCalled();
  });

  it("Save & Continue with an empty reflection just dismisses, without saving a blank Note", async () => {
    const user = userEvent.setup();
    const onSaveNote = vi.fn();
    const onDismiss = vi.fn();

    render(<ReadingCheckpointPrompt onSaveNote={onSaveNote} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Save & Continue" }));

    expect(onSaveNote).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});
