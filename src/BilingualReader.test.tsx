import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BilingualReader } from "./BilingualReader";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 5,
      getPage: (pageNum: number) =>
        Promise.resolve({
          getTextContent: () => Promise.resolve({ items: [{ str: `PDF Page ${pageNum} text` }] }),
        }),
    }),
  }),
}));

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const pkg = {
  id: "pkg-1",
  book_id_a: "book-a",
  book_id_b: "book-b",
  lang_a: "en",
  lang_b: "zh",
  mappings: [
    { a: [1], b: [1] },
    { a: [4], b: [4, 5] },
  ],
};

const bookA = { bookId: "book-a", title: "English Edition", format: "txt" };
const bookB = { bookId: "book-b", title: "Chinese Edition", format: "txt" };

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string, args: { bookId: string }) => {
    if (cmd === "read_book_file_command") {
      return Promise.resolve(args.bookId === "book-a" ? bytesOf("Hello fox.") : bytesOf("你好狐狸。"));
    }
    return Promise.resolve(undefined);
  });
});

describe("BilingualReader", () => {
  it("extracts and displays each side's plain text independently", async () => {
    render(<BilingualReader package={pkg} bookA={bookA} bookB={bookB} onBack={() => {}} />);

    expect(await screen.findByText("Hello fox.")).toBeInTheDocument();
    expect(await screen.findByText("你好狐狸。")).toBeInTheDocument();
  });

  it("swap sides puts the other book's pane first", async () => {
    const user = userEvent.setup();
    render(<BilingualReader package={pkg} bookA={bookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText("Hello fox.");

    const headingsBefore = screen.getAllByText(/Edition$/);
    expect(headingsBefore[0]).toHaveTextContent("English Edition");

    await user.click(screen.getByRole("button", { name: /swap/i }));

    const headingsAfter = screen.getAllByText(/Edition$/);
    expect(headingsAfter[0]).toHaveTextContent("Chinese Edition");
  });

  it("toggling sync navigation flips the button label", async () => {
    const user = userEvent.setup();
    render(<BilingualReader package={pkg} bookA={bookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText("Hello fox.");

    expect(screen.getByText(/Sync navigation on/)).toBeInTheDocument();
    await user.click(screen.getByText(/Sync navigation on/));
    expect(screen.getByText(/Sync navigation off/)).toBeInTheDocument();
  });

  it("the Alignment panel classifies a clean 1:1 mapping as ok and a many-to-one mapping as review", async () => {
    const user = userEvent.setup();
    render(<BilingualReader package={pkg} bookA={bookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText("Hello fox.");

    await user.click(screen.getByRole("button", { name: "Alignment" }));

    expect(await screen.findByText("↔")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("calling onBack invokes the provided callback", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<BilingualReader package={pkg} bookA={bookA} bookB={bookB} onBack={onBack} />);
    await screen.findByText("Hello fox.");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("opens the Contents drawer and shows truthful empty state for unstructured TXT books", async () => {
    const user = userEvent.setup();
    render(<BilingualReader package={pkg} bookA={bookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText("Hello fox.");

    await user.click(screen.getByRole("button", { name: /Contents/i }));
    expect(screen.getByRole("region", { name: "Book Contents" })).toBeInTheDocument();
    expect(screen.getByText("No contents available for this source.")).toBeInTheDocument();
  });

  it("opens the Contents drawer and displays structured contents for PDF / EPUB books", async () => {
    const user = userEvent.setup();
    const pdfBookA = { bookId: "book-a", title: "PDF Edition", format: "pdf" };
    render(<BilingualReader package={pkg} bookA={pdfBookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText(/PDF Page 1 text/);

    await user.click(screen.getByRole("button", { name: /Contents/i }));
    expect(screen.getByRole("region", { name: "Book Contents" })).toBeInTheDocument();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
  });
});
