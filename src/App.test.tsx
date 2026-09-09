import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("./Reader", () => ({
  Reader: ({
    bookId,
    title,
    onBack,
    initialAnchor,
  }: {
    bookId: string;
    title: string;
    onBack: () => void;
    initialAnchor?: { primary_anchor: string };
  }) => (
    <div>
      <p>Reading: {title} ({bookId})</p>
      {initialAnchor && <p>Jump target: {initialAnchor.primary_anchor}</p>}
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  ),
}));
vi.mock("./PdfReader", () => ({
  PdfReader: ({ bookId, title, onBack }: { bookId: string; title: string; onBack: () => void }) => (
    <div>
      <p>Reading PDF: {title} ({bookId})</p>
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  ),
}));
vi.mock("./TxtReader", () => ({
  TxtReader: ({ bookId, title, onBack }: { bookId: string; title: string; onBack: () => void }) => (
    <div>
      <p>Reading TXT: {title} ({bookId})</p>
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  ),
}));

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
  vi.restoreAllMocks();
});

describe("App shell", () => {
  it("renders the EbookReader application shell", async () => {
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    expect(screen.getByRole("heading", { name: "EbookReader" })).toBeInTheDocument();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_library_command"));
  });
});

describe("Library", () => {
  it("shows an empty-library message when there are no books", async () => {
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    expect(await screen.findByText(/library is empty/i)).toBeInTheDocument();
  });

  it("lists books returned by list_library_command", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "abc", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    expect(await screen.findByText("Alice's Adventures in Wonderland")).toBeInTheDocument();
  });

  it("imports a book via the native file picker and refreshes the list", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // initial list on mount
    openMock.mockResolvedValueOnce("C:/books/new-book.epub");
    invokeMock.mockResolvedValueOnce("new-book-id"); // import_book_command
    invokeMock.mockResolvedValueOnce([
      { book_id: "new-book-id", title: "new-book", path: "C:/books/new-book.epub", format: "epub", ownership_mode: "reference", available: true },
    ]); // refreshed list

    render(<App />);
    await screen.findByText(/library is empty/i);

    await user.click(screen.getByRole("button", { name: /import book/i }));

    expect(await screen.findByText("new-book")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("import_book_command", {
      path: "C:/books/new-book.epub",
      ownershipMode: "reference",
    });
  });

  it("shows Needs Relink for a book whose file is missing, not for one that's present", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "missing", title: "Missing Book", path: "C:/books/gone.epub", format: "epub", ownership_mode: "reference", available: false },
      { book_id: "present", title: "Present Book", path: "C:/books/here.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    const missingItem = (await screen.findByText("Missing Book")).closest("li")!;
    expect(within(missingItem).getByText(/needs relink/i)).toBeInTheDocument();

    const presentItem = screen.getByText("Present Book").closest("li")!;
    expect(within(presentItem).queryByText(/needs relink/i)).not.toBeInTheDocument();
  });

  it("removes a book from the Library only after confirming the separated consequence", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([
      { book_id: "to-remove", title: "Removable Book", path: "C:/books/removable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]); // initial list
    invokeMock.mockResolvedValueOnce(undefined); // remove_book_command
    invokeMock.mockResolvedValueOnce([]); // refreshed list

    render(<App />);
    await screen.findByText("Removable Book");

    await user.click(screen.getByRole("button", { name: "Remove from Library" }));

    expect(await screen.findByText(/library is empty/i)).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Reading data is kept"));
    expect(invokeMock).toHaveBeenCalledWith("remove_book_command", { bookId: "to-remove" });
  });

  it("does not remove a book when Remove from Library confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    invokeMock.mockResolvedValueOnce([
      { book_id: "keep", title: "Keep Book", path: "C:/books/keep.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);

    render(<App />);
    await screen.findByText("Keep Book");

    await user.click(screen.getByRole("button", { name: "Remove from Library" }));

    expect(invokeMock).not.toHaveBeenCalledWith("remove_book_command", { bookId: "keep" });
    expect(screen.getByText("Keep Book")).toBeInTheDocument();
  });

  it("deletes reading data through an explicitly labeled destructive action while keeping file semantics separate", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([
      { book_id: "data-book", title: "Data Book", path: "C:/books/data.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    invokeMock.mockResolvedValueOnce(undefined); // delete_reading_data_command
    invokeMock.mockResolvedValueOnce([
      { book_id: "data-book", title: "Data Book", path: "C:/books/data.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);

    render(<App />);
    await screen.findByText("Data Book");

    await user.click(screen.getByRole("button", { name: "Delete Reading Data" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("The Book file stays in place"));
    expect(invokeMock).toHaveBeenCalledWith("delete_reading_data_command", { bookId: "data-book" });
    expect(await screen.findByText("Data Book")).toBeInTheDocument();
  });

  it("offers Managed-Copy file deletion only for managed-copy books", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([
      { book_id: "managed", title: "Managed Book", path: "C:/app/managed.epub", format: "epub", ownership_mode: "managed_copy", available: true },
      { book_id: "reference", title: "Reference Book", path: "C:/books/reference.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    invokeMock.mockResolvedValueOnce(undefined); // delete_managed_copy_file_command
    invokeMock.mockResolvedValueOnce([
      { book_id: "managed", title: "Managed Book", path: "C:/app/managed.epub", format: "epub", ownership_mode: "managed_copy", available: false },
      { book_id: "reference", title: "Reference Book", path: "C:/books/reference.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);

    render(<App />);
    const managedItem = (await screen.findByText("Managed Book")).closest("li")!;
    const referenceItem = screen.getByText("Reference Book").closest("li")!;

    expect(within(managedItem).getByRole("button", { name: "Delete Managed-Copy File" })).toBeInTheDocument();
    expect(within(referenceItem).queryByRole("button", { name: "Delete Managed-Copy File" })).not.toBeInTheDocument();

    await user.click(within(managedItem).getByRole("button", { name: "Delete Managed-Copy File" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Reference source files are never deleted"));
    expect(invokeMock).toHaveBeenCalledWith("delete_managed_copy_file_command", { bookId: "managed" });
  });
});

describe("Top-level navigation (DESIGN.md; FC-C06)", () => {
  it("shows Library by default and marks it as the current destination", async () => {
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    expect(screen.getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Notes" })).not.toHaveAttribute("aria-current");
  });

  it("switching to another destination hides the Library panel, and back shows it again", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    invokeMock.mockResolvedValueOnce([]); // list_all_reading_assets_command
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.queryByText("Book One")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByText("Book One")).toBeInTheDocument();
  });

  it("keeps Search visible regardless of which destination is active", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([]); // list_all_reading_assets_command
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.getByLabelText("Search the library")).toBeInTheDocument();
  });

  it("Reader stays contextual: opening a Book does not add a new nav destination", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "epub-1", title: "Openable EPUB", path: "C:/books/openable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Openable EPUB" }));

    await screen.findByText(/Reading: Openable EPUB/);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("opens the Settings panel and loads Appearance", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // initial list
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null); // get_setting_command x2
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Appearance")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("get_setting_command", { key: "appearance.theme_mode" });
  });
});

describe("Library-wide Search", () => {
  it("runs a search and shows results with the matching book's title", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole" }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(invokeMock).toHaveBeenCalledWith("search_library_command", { query: "rabbit" });
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;
    expect(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" })).toBeInTheDocument();
  });

  it("shows a no-results message for an empty result set", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([]);
    await user.type(screen.getByLabelText("Search the library"), "nothing");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });

  it("clicking a search result opens its book", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole" }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;

    await user.click(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" }));

    expect(await screen.findByText(/Reading: Alice's Adventures in Wonderland \(book-1\)/)).toBeInTheDocument();
  });

  const sampleAnchor = {
    book_id: "book-1",
    format: "epub",
    progression_hint: 0.2,
    primary_anchor: "epubcfi(/6/4!/4/2/1:0)",
    fallback_anchors: [],
    context_selector: null,
  };

  it("FC-C01: opening a search result with a real anchor seeks the Reader there", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole", anchor: sampleAnchor }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;

    await user.click(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" }));

    expect(await screen.findByText(`Jump target: ${sampleAnchor.primary_anchor}`)).toBeInTheDocument();
  });

  it("a search result with no anchor opens the Book plainly (truthful, not a guessed jump)", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole", anchor: null }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;

    await user.click(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" }));

    await screen.findByText(/Reading: Alice's Adventures in Wonderland/);
    expect(screen.queryByText(/Jump target:/)).not.toBeInTheDocument();
  });
});

describe("Global Notes", () => {
  it("lists Notebook assets across all books when opened", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A cross-book thought", orphaned: false },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(invokeMock).toHaveBeenCalledWith("list_all_reading_assets_command", { kind: null });
    expect(await screen.findByText("A cross-book thought")).toBeInTheDocument();
  });

  it("filtering by asset type re-queries with the selected kind", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_all_reading_assets_command", { kind: null }));

    invokeMock.mockResolvedValueOnce([
      { id: "e1", book_id: "book-1", kind: "excerpt", text: "a collected passage", orphaned: false },
    ]);
    await user.selectOptions(screen.getByLabelText("Filter Notes by type"), "excerpt");

    expect(invokeMock).toHaveBeenCalledWith("list_all_reading_assets_command", { kind: "excerpt" });
    expect(await screen.findByText("a collected passage")).toBeInTheDocument();
  });

  it("FC-C02: opening a Global Notes asset with a real anchor seeks the Reader there", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    const anchor = {
      book_id: "book-1",
      format: "epub",
      progression_hint: 0.1,
      primary_anchor: "epubcfi(/6/2!/4/2/1:0)",
      fallback_anchors: [],
      context_selector: "chapter 1",
    };
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A source-anchored thought", orphaned: false, anchor },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(await screen.findByRole("button", { name: "Book One" }));

    expect(await screen.findByText(`Jump target: ${anchor.primary_anchor}`)).toBeInTheDocument();
  });

  it("a free-standing Note (no anchor) opens the Book plainly", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A free-standing thought", orphaned: false, anchor: null },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(await screen.findByRole("button", { name: "Book One" }));

    await screen.findByText(/Reading: Book One/);
    expect(screen.queryByText(/Jump target:/)).not.toBeInTheDocument();
  });

  it("marks an orphaned Global Notes entry as Detached", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "annotation", text: "stale highlight", orphaned: true },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(await screen.findByText("stale highlight")).toBeInTheDocument();
    expect(screen.getByText("Detached")).toBeInTheDocument();
  });
});

describe("Opening a book", () => {
  it("opens the Reader for an available EPUB when its title is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "epub-1", title: "Openable EPUB", path: "C:/books/openable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Openable EPUB" }));

    expect(await screen.findByText(/Reading: Openable EPUB \(epub-1\)/)).toBeInTheDocument();
  });

  it("returns to the Library when the Reader's Back to Library is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "epub-1", title: "Openable EPUB", path: "C:/books/openable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Openable EPUB" }));
    await screen.findByText(/Reading: Openable EPUB/);

    await user.click(screen.getByRole("button", { name: /back to library/i }));

    expect(await screen.findByText("Openable EPUB")).toBeInTheDocument();
    expect(screen.queryByText(/Reading: Openable EPUB/)).not.toBeInTheDocument();
  });

  it("opens the PdfReader for an available PDF when its title is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "pdf-1", title: "A PDF Book", path: "C:/books/a.pdf", format: "pdf", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "A PDF Book" }));

    expect(await screen.findByText(/Reading PDF: A PDF Book \(pdf-1\)/)).toBeInTheDocument();
  });

  it("opens the TxtReader for an available TXT when its title is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "txt-1", title: "A TXT Book", path: "C:/books/a.txt", format: "txt", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "A TXT Book" }));

    expect(await screen.findByText(/Reading TXT: A TXT Book \(txt-1\)/)).toBeInTheDocument();
  });

  it("does not offer to open a format with no renderer at all", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "mystery-1", title: "A Mystery Format", path: "C:/books/a.xyz", format: "xyz", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await screen.findByText("A Mystery Format");
    expect(screen.queryByRole("button", { name: "A Mystery Format" })).not.toBeInTheDocument();
  });

  it("does not offer to open a book that Needs Relink", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "missing-1", title: "Missing EPUB", path: "C:/books/gone.epub", format: "epub", ownership_mode: "reference", available: false },
    ]);
    render(<App />);

    await screen.findByText("Missing EPUB");
    expect(screen.queryByRole("button", { name: "Missing EPUB" })).not.toBeInTheDocument();
  });
});
