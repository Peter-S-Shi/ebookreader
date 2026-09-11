import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BilingualReader } from "./BilingualReader";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const mockPdfOutline = vi.fn().mockResolvedValue(null);
const mockGetDestination = vi.fn().mockResolvedValue([{}]);
const mockGetPageIndex = vi.fn().mockResolvedValue(2);

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 5,
      getPage: (pageNum: number) =>
        Promise.resolve({
          getTextContent: () => Promise.resolve({ items: [{ str: `PDF Page ${pageNum} text` }] }),
        }),
      getOutline: mockPdfOutline,
      getDestination: mockGetDestination,
      getPageIndex: mockGetPageIndex,
    }),
  }),
}));

vi.mock("foliate-js/view.js", () => ({}));

let fakeFoliateBook: any = {
  toc: [],
  sections: [],
};

const realCreateElement = document.createElement.bind(document);

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
  mockPdfOutline.mockReset().mockResolvedValue(null);
  mockGetDestination.mockReset().mockResolvedValue([{}]);
  mockGetPageIndex.mockReset().mockResolvedValue(2);

  fakeFoliateBook = {
    toc: [],
    sections: [],
  };

  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag === "foliate-view") {
      const fakeView = realCreateElement("div") as any;
      fakeView.open = vi.fn().mockResolvedValue(undefined);
      fakeView.book = fakeFoliateBook;
      return fakeView;
    }
    return realCreateElement(tag, options);
  }) as typeof document.createElement;

  invokeMock.mockImplementation((cmd: string, args: { bookId: string }) => {
    if (cmd === "read_book_file_command") {
      return Promise.resolve(args.bookId === "book-a" ? bytesOf("Hello fox.") : bytesOf("你好狐狸。"));
    }
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  document.createElement = realCreateElement;
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

  it("uses real PDF document outline when available in Contents drawer", async () => {
    const user = userEvent.setup();
    mockPdfOutline.mockResolvedValueOnce([
      { title: "Preface", dest: "dest-preface" },
      { title: "Chapter 1: The Beginning", dest: ["page-dest-1"] },
    ]);
    mockGetPageIndex.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const pdfBookA = { bookId: "book-a", title: "PDF Edition", format: "pdf" };
    render(<BilingualReader package={pkg} bookA={pdfBookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText(/PDF Page 1 text/);

    await user.click(screen.getByRole("button", { name: /Contents/i }));
    expect(screen.getByRole("region", { name: "Book Contents" })).toBeInTheDocument();
    expect(screen.getByText("Preface")).toBeInTheDocument();
    expect(screen.getByText("Chapter 1: The Beginning")).toBeInTheDocument();
  });

  it("falls back to Page 1..N navigation when PDF document has no outline", async () => {
    const user = userEvent.setup();
    mockPdfOutline.mockResolvedValueOnce(null);

    const pdfBookA = { bookId: "book-a", title: "PDF Edition", format: "pdf" };
    render(<BilingualReader package={pkg} bookA={pdfBookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText(/PDF Page 1 text/);

    await user.click(screen.getByRole("button", { name: /Contents/i }));
    expect(screen.getByRole("region", { name: "Book Contents" })).toBeInTheDocument();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByText("Page 5")).toBeInTheDocument();
  });

  it("uses real EPUB publication TOC when available in Contents drawer", async () => {
    const user = userEvent.setup();
    fakeFoliateBook = {
      toc: [
        { label: "Prologue", href: "text/ch00.xhtml" },
        { label: "Chapter 1: The First Step", href: "text/ch01.xhtml" },
      ],
      sections: [
        { name: "text/ch00.xhtml", createDocument: () => Promise.resolve({ body: { textContent: "Prologue text" } }) },
        { name: "text/ch01.xhtml", createDocument: () => Promise.resolve({ body: { textContent: "Chapter 1 text" } }) },
      ],
    };

    const epubBookA = { bookId: "book-a", title: "EPUB Edition", format: "epub" };
    render(<BilingualReader package={pkg} bookA={epubBookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText(/Prologue text/);

    await user.click(screen.getByRole("button", { name: /Contents/i }));
    expect(screen.getByRole("region", { name: "Book Contents" })).toBeInTheDocument();
    expect(screen.getByText("Prologue")).toBeInTheDocument();
    expect(screen.getByText("Chapter 1: The First Step")).toBeInTheDocument();
  });

  it("falls back to Section 1..N when EPUB has no publication TOC", async () => {
    const user = userEvent.setup();
    fakeFoliateBook = {
      toc: [],
      sections: [
        { createDocument: () => Promise.resolve({ body: { textContent: "Section 1 text" } }) },
        { createDocument: () => Promise.resolve({ body: { textContent: "Section 2 text" } }) },
      ],
    };

    const epubBookA = { bookId: "book-a", title: "EPUB Edition", format: "epub" };
    render(<BilingualReader package={pkg} bookA={epubBookA} bookB={bookB} onBack={() => {}} />);
    await screen.findByText(/Section 1 text/);

    await user.click(screen.getByRole("button", { name: /Contents/i }));
    expect(screen.getByRole("region", { name: "Book Contents" })).toBeInTheDocument();
    expect(screen.getByText("Section 1")).toBeInTheDocument();
    expect(screen.getByText("Section 2")).toBeInTheDocument();
  });
});
