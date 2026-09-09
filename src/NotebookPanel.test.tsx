import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotebookPanel } from "./NotebookPanel";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("NotebookPanel", () => {
  it("lists the book's existing Notebook assets on mount", async () => {
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A free-standing thought", orphaned: false },
      { id: "a2", book_id: "book-1", kind: "excerpt", text: "A collected passage", orphaned: false },
    ]);

    render(<NotebookPanel bookId="book-1" onClose={() => {}} />);

    expect(await screen.findByText("A free-standing thought")).toBeInTheDocument();
    expect(screen.getByText("A collected passage")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("list_reading_assets_command", { bookId: "book-1" });
  });

  it("marks an orphaned asset as Detached without hiding its text", async () => {
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "annotation", text: "Old highlight", orphaned: true },
    ]);

    render(<NotebookPanel bookId="book-1" onClose={() => {}} />);

    expect(await screen.findByText("Old highlight")).toBeInTheDocument();
    expect(screen.getByText("Detached")).toBeInTheDocument();
  });

  it("adding a note calls create_reading_asset_command with kind note and no anchor, then refreshes the list", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // initial list
    render(<NotebookPanel bookId="book-1" onClose={() => {}} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_reading_assets_command", { bookId: "book-1" }));

    invokeMock.mockResolvedValueOnce({ id: "a1", book_id: "book-1", kind: "note", text: "New thought", orphaned: false }); // create
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "New thought", orphaned: false },
    ]); // refreshed list

    await user.type(screen.getByLabelText("New note"), "New thought");
    await user.click(screen.getByText("Add Note"));

    expect(invokeMock).toHaveBeenCalledWith("create_reading_asset_command", {
      bookId: "book-1",
      kind: "note",
      text: "New thought",
      anchor: null,
    });
    expect(await screen.findByText("New thought")).toBeInTheDocument();
  });

  it("does not add an empty note", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<NotebookPanel bookId="book-1" onClose={() => {}} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("Add Note"));

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("shows a Jump to action for a source-anchored asset and calls onJumpTo with its anchor", async () => {
    const user = userEvent.setup();
    const onJumpTo = vi.fn();
    const anchor = {
      book_id: "book-1",
      format: "epub",
      progression_hint: 0.5,
      primary_anchor: "epubcfi(/6/4!/4/2/1:0)",
      fallback_anchors: [],
      context_selector: null,
    };
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "annotation", text: "a highlight", anchor, orphaned: false },
    ]);

    render(<NotebookPanel bookId="book-1" onClose={() => {}} onJumpTo={onJumpTo} />);
    await screen.findByText("a highlight");

    await user.click(screen.getByText("Jump to"));
    expect(onJumpTo).toHaveBeenCalledWith(anchor);
  });

  it("does not offer Jump to for a free-standing note or an orphaned asset", async () => {
    const anchor = {
      book_id: "book-1",
      format: "epub",
      progression_hint: 0.5,
      primary_anchor: "epubcfi(/6/4!/4/2/1:0)",
      fallback_anchors: [],
      context_selector: null,
    };
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "free-standing", anchor: null, orphaned: false },
      { id: "a2", book_id: "book-1", kind: "annotation", text: "stale highlight", anchor, orphaned: true },
    ]);

    render(<NotebookPanel bookId="book-1" onClose={() => {}} onJumpTo={vi.fn()} />);
    await screen.findByText("free-standing");

    expect(screen.queryByText("Jump to")).not.toBeInTheDocument();
  });

  it("calls onClose when Close is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    invokeMock.mockResolvedValueOnce([]);
    render(<NotebookPanel bookId="book-1" onClose={onClose} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
