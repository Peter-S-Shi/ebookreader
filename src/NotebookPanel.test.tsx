import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotebookPanel } from "./NotebookPanel";

const { invokeMock, saveMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), saveMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));

beforeEach(() => {
  invokeMock.mockReset();
  saveMock.mockReset();
});

describe("NotebookPanel", () => {
  it("lists the book's existing Notebook assets on mount", async () => {
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A free-standing thought", orphaned: false },
      { id: "a2", book_id: "book-1", kind: "excerpt", text: "A collected passage", orphaned: false },
    ]);

    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={() => {}} />);

    expect(await screen.findByText("A free-standing thought")).toBeInTheDocument();
    expect(screen.getByText("A collected passage")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("list_reading_assets_command", { bookId: "book-1" });
  });

  it("marks an orphaned asset as Detached without hiding its text", async () => {
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "annotation", text: "Old highlight", orphaned: true },
    ]);

    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={() => {}} />);

    expect(await screen.findByText("Old highlight")).toBeInTheDocument();
    expect(screen.getByText("Detached")).toBeInTheDocument();
  });

  it("adding a note calls create_reading_asset_command with kind note and no anchor, then refreshes the list", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // initial list
    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={() => {}} />);
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
    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={() => {}} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("Add Note"));

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("shows a Jump to action for a source-anchored asset and calls onJumpTo with the asset", async () => {
    const user = userEvent.setup();
    const onJumpTo = vi.fn().mockReturnValue(true);
    const onClose = vi.fn();
    const anchor = {
      book_id: "book-1",
      format: "epub",
      progression_hint: 0.5,
      primary_anchor: "epubcfi(/6/4!/4/2/1:0)",
      fallback_anchors: [],
      context_selector: null,
    };
    const asset = { id: "a1", book_id: "book-1", kind: "annotation", text: "a highlight", anchor, orphaned: false };
    invokeMock.mockResolvedValueOnce([asset]);

    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={onClose} onJumpTo={onJumpTo} />);
    await screen.findByText("a highlight");

    await user.click(screen.getByText("Jump to"));
    expect(onJumpTo).toHaveBeenCalledWith(asset);
  });

  it("closes the panel when a jump succeeds", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
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

    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={onClose} onJumpTo={() => true} />);
    await screen.findByText("a highlight");

    await user.click(screen.getByText("Jump to"));
    expect(onClose).toHaveBeenCalled();
  });

  it("marks the asset Orphaned and refreshes (without closing) when a jump fails to resolve", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const anchor = {
      book_id: "book-1",
      format: "epub",
      progression_hint: 0.5,
      primary_anchor: "epubcfi(/6/999!/4/2/1:0)",
      fallback_anchors: [],
      context_selector: null,
    };
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "annotation", text: "a highlight", anchor, orphaned: false },
    ]); // initial list
    invokeMock.mockResolvedValueOnce(undefined); // mark_reading_asset_orphaned_command
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "annotation", text: "a highlight", anchor, orphaned: true },
    ]); // refreshed list

    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={onClose} onJumpTo={() => false} />);
    await screen.findByText("a highlight");

    await user.click(screen.getByText("Jump to"));

    expect(invokeMock).toHaveBeenCalledWith("mark_reading_asset_orphaned_command", { assetId: "a1" });
    expect(await screen.findByText("Detached")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
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

    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={() => {}} onJumpTo={vi.fn()} />);
    await screen.findByText("free-standing");

    expect(screen.queryByText("Jump to")).not.toBeInTheDocument();
  });

  it("calls onClose when Close is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    invokeMock.mockResolvedValueOnce([]);
    render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={onClose} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  describe("Markdown export (PRODUCT_SPEC.md SS11; FC-A04)", () => {
    it("exports the Notebook to the user-chosen destination and reports where", async () => {
      const user = userEvent.setup();
      invokeMock.mockResolvedValueOnce([]); // initial list
      saveMock.mockResolvedValueOnce("C:/exports/test-book-notebook.md");
      invokeMock.mockResolvedValueOnce(undefined); // export_notebook_markdown_command

      render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={() => {}} />);
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_reading_assets_command", { bookId: "book-1" }));

      await user.click(screen.getByRole("button", { name: "Export as Markdown" }));

      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: "Test Book-notebook.md" }),
      );
      expect(invokeMock).toHaveBeenCalledWith("export_notebook_markdown_command", {
        bookId: "book-1",
        destPath: "C:/exports/test-book-notebook.md",
      });
      expect(await screen.findByText(/notebook exported to/i)).toBeInTheDocument();
    });

    it("does not export when the destination picker is cancelled", async () => {
      const user = userEvent.setup();
      invokeMock.mockResolvedValueOnce([]);
      saveMock.mockResolvedValueOnce(null);

      render(<NotebookPanel bookId="book-1" bookTitle="Test Book" onClose={() => {}} />);
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_reading_assets_command", { bookId: "book-1" }));

      await user.click(screen.getByRole("button", { name: "Export as Markdown" }));

      expect(invokeMock).not.toHaveBeenCalledWith("export_notebook_markdown_command", expect.anything());
    });
  });
});
