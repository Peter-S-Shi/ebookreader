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
  Reader: ({ bookId, title, onBack }: { bookId: string; title: string; onBack: () => void }) => (
    <div>
      <p>Reading: {title} ({bookId})</p>
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  ),
}));

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
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

  it("removes a book via Remove and refreshes the list", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "to-remove", title: "Removable Book", path: "C:/books/removable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]); // initial list
    invokeMock.mockResolvedValueOnce(undefined); // remove_book_command
    invokeMock.mockResolvedValueOnce([]); // refreshed list

    render(<App />);
    await screen.findByText("Removable Book");

    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(await screen.findByText(/library is empty/i)).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("remove_book_command", { bookId: "to-remove" });
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

  it("does not offer to open a PDF (format not yet supported by the Reader)", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "pdf-1", title: "A PDF Book", path: "C:/books/a.pdf", format: "pdf", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await screen.findByText("A PDF Book");
    expect(screen.queryByRole("button", { name: "A PDF Book" })).not.toBeInTheDocument();
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
