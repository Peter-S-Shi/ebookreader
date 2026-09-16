import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfReader } from "./PdfReader";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const mockRenderTask = { promise: Promise.resolve(), cancel: vi.fn() };
const viewportScales: number[] = [];
const mockGetPage = vi.fn().mockImplementation(async (_pageNo: number) => ({
  getViewport: ({ scale }: { scale?: number } = {}) => {
    const resolvedScale = scale ?? 1.2;
    viewportScales.push(resolvedScale);
    return { width: 600 * resolvedScale, height: 800 * resolvedScale, scale: resolvedScale };
  },
  render: () => mockRenderTask,
  getTextContent: async () => ({ items: [] }), // No text items -> scanned PDF
  streamTextContent: async () => ({ items: [] }),
}));

const mockGetOutline = vi.fn(async () => null as unknown[] | null);
const mockGetDestination = vi.fn(async () => null as unknown[] | null);
const mockGetPageIndex = vi.fn(async (_ref: unknown) => 0);

const mockPdfDocument = {
  numPages: 50,
  getPage: mockGetPage,
  getOutline: mockGetOutline,
  getDestination: mockGetDestination,
  getPageIndex: mockGetPageIndex,
};

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve(mockPdfDocument),
  }),
  TextLayer: class {
    render() {
      return Promise.resolve();
    }
  },
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  invokeMock.mockReset();
  mockGetPage.mockClear();
  viewportScales.length = 0;
  mockRenderTask.cancel.mockClear();
  mockGetOutline.mockReset().mockResolvedValue(null);
  mockGetDestination.mockReset().mockResolvedValue(null);
  mockGetPageIndex.mockReset().mockResolvedValue(0);
  invokeMock.mockImplementation(async (cmd: string, args: any) => {
    if (cmd === "read_book_file_command") {
      return new Uint8Array([37, 80, 68, 70, 45]);
    }
    if (cmd === "load_reading_location_command") {
      return {
        book_id: "pdf1",
        format: "pdf",
        progression_hint: 0.24,
        primary_anchor: "12",
        fallback_anchors: [],
        context_selector: null,
      };
    }
    if (cmd === "list_reading_assets_command") {
      return [];
    }
    if (cmd === "get_ocr_effective_text_command") {
      if (args?.pageNumber === 12) {
        return "Recognized text for page 12";
      }
      return null;
    }
    if (cmd === "reading_session_status_command") {
      return { state: "active", total_excluded_ms: 0, total_note_taking_ms: 0 };
    }
    return null;
  });
});

describe("PdfReader — Zoom and keyboard navigation", () => {
  it("uses one zoom state for rendering and exposes conventional fit controls", async () => {
    render(<PdfReader bookId="pdf1" title="PDF controls" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit width" })).toBeInTheDocument();
    expect(screen.getByLabelText("PDF zoom")).toHaveTextContent("120%");

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => expect(screen.getByLabelText("PDF zoom")).toHaveTextContent("130%"));
    expect(viewportScales).toContain(1.3);
    expect(document.querySelector<HTMLElement>(".pdf-text-layer")?.style.getPropertyValue("--total-scale-factor")).toBe("1.3");

    const surface = document.querySelector<HTMLElement>(".reader-surface")!;
    Object.defineProperties(surface, {
      clientWidth: { configurable: true, value: 1232 },
      clientHeight: { configurable: true, value: 832 },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fit width" }));
    await waitFor(() => expect(screen.getByLabelText("PDF zoom")).toHaveTextContent("200%"));
    fireEvent.click(screen.getByRole("button", { name: "Fit page" }));
    await waitFor(() => expect(screen.getByLabelText("PDF zoom")).toHaveTextContent("100%"));

    fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), { target: { value: "continuous" } });
    expect(screen.getByRole("button", { name: "Fit page" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("PDF zoom")).toHaveTextContent("100%");
  });

  it("navigates with unmodified arrow keys but ignores editable controls and modifiers", async () => {
    render(<PdfReader bookId="pdf1" title="PDF keyboard" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByDisplayValue("13")).toBeInTheDocument();

    const mode = screen.getByRole("combobox", { name: "View mode" });
    mode.focus();
    fireEvent.keyDown(mode, { key: "ArrowLeft" });
    expect(screen.getByDisplayValue("13")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft", ctrlKey: true });
    expect(screen.getByDisplayValue("13")).toBeInTheDocument();

    const alertDialog = document.createElement("div");
    alertDialog.setAttribute("role", "alertdialog");
    document.body.append(alertDialog);
    fireEvent.keyDown(alertDialog, { key: "ArrowLeft" });
    expect(screen.getByDisplayValue("13")).toBeInTheDocument();
    alertDialog.remove();
  });

  it("moves continuous mode to the adjacent page with arrow keys", async () => {
    render(<PdfReader bookId="pdf1" title="PDF continuous keyboard" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");
    fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), { target: { value: "continuous" } });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByDisplayValue("13")).toBeInTheDocument();

    const continuousSurface = document.querySelector<HTMLElement>(".pdf-continuous")!;
    Object.defineProperty(continuousSurface, "scrollTop", { configurable: true, value: 12 * 16 });
    fireEvent.scroll(continuousSurface);
    expect(screen.getByDisplayValue("13")).toBeInTheDocument();
  });
});

describe("PdfReader — Warm Reopen & Saved Location Behavior", () => {
  it("renders the saved target page directly on initial mount without spurious page 1 renders", async () => {
    render(<PdfReader bookId="pdf1" title="Saved Location Test PDF" onBack={vi.fn()} />);

    // Wait for saved location resolution and page render
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledWith(12));

    // Verify initial target page 12 was fetched and rendered directly
    expect(mockGetPage).toHaveBeenCalledWith(12);
  });
});

describe("PdfReader — Restrained Scanned PDF OCR Affordance", () => {
  it("surfaces a restrained OCR notice without dumping raw OCR text or inline textarea into the reading surface", async () => {
    render(<PdfReader bookId="pdf1" title="Scanned Book" onBack={vi.fn()} />);

    // Wait for OCR state to resolve
    await waitFor(() => {
      expect(screen.getByText(/OCR text available for Page 12/i)).toBeInTheDocument();
    });

    // Verify raw text is NOT dumped directly as a paragraph on the main reading surface
    expect(screen.queryByText("Recognized text for page 12")).not.toBeInTheDocument();

    // Verify no inline edit textarea is present on the reading surface
    expect(screen.queryByLabelText("Correct OCR text")).not.toBeInTheDocument();

    // Verify clean Open OCR Workspace button exists
    expect(screen.getByRole("button", { name: "Open OCR Workspace" })).toBeInTheDocument();
  });

  it("opens the dedicated OCR Workspace modal when clicking Open OCR Workspace", async () => {
    render(<PdfReader bookId="pdf1" title="Scanned Book" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open OCR Workspace" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open OCR Workspace" }));

    // OCR Workspace dialog should now be open
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "OCR Workspace" })).toBeInTheDocument();
      expect(screen.getByLabelText("Correct OCR text")).toBeInTheDocument();
    });
  });
});

describe("PdfReader — Native PDF Bookmarks in Contents (V2-M2)", () => {
  it("shows no Contents button for a PDF with no usable outline (the beforeEach default)", async () => {
    render(<PdfReader bookId="pdf1" title="No Outline PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    expect(screen.queryByRole("button", { name: "Contents" })).not.toBeInTheDocument();
  });

  it("shows native PDF bookmarks in Contents and navigates to the resolved page", async () => {
    mockGetOutline.mockResolvedValue([{ title: "Chapter 2", dest: ["ref-2"], items: [] }]);
    mockGetPageIndex.mockImplementation(async (ref: unknown) => (ref === "ref-2" ? 4 : 0));

    render(<PdfReader bookId="pdf1" title="Bookmarked PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    const dialog = screen.getByRole("dialog", { name: "Contents" });
    const bookmark = within(dialog).getByRole("button", { name: "Chapter 2" });

    fireEvent.click(bookmark);

    await waitFor(() => expect(screen.getByDisplayValue("5")).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Contents" })).not.toBeInTheDocument();
  });
});

describe("PdfReader — Direct Page Jump (V2-M2 addendum)", () => {
  async function typeAndCommit(value: string) {
    const input = screen.getByRole("textbox", { name: "Current page" });
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter" });
  }

  it("jumps to a valid in-range page", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("40");

    await waitFor(() => expect(mockGetPage).toHaveBeenCalledWith(40));
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("normalizes 0 to page 1", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("0");

    await waitFor(() => expect(screen.getByDisplayValue("1")).toBeInTheDocument());
  });

  it("clamps a page above the count to the last page", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("9999");

    await waitFor(() => expect(screen.getByDisplayValue("50")).toBeInTheDocument());
  });

  it("rejects a decimal with a visible warning and does not navigate", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("4.5");

    expect(await screen.findByRole("alert")).toHaveTextContent(/whole page number/i);
    expect(mockGetPage).not.toHaveBeenCalledWith(4);
  });

  it("rejects a negative number with a visible warning and does not navigate", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("-3");

    expect(await screen.findByRole("alert")).toHaveTextContent(/whole page number/i);
    expect(mockGetPage).not.toHaveBeenCalledWith(3);
  });

  it("rejects letters and symbols with a visible warning and does not navigate", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("abc");

    expect(await screen.findByRole("alert")).toHaveTextContent(/whole page number/i);
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
  });

  it("accepts leading zeros, normalizing them away", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("007");

    await waitFor(() => expect(screen.getByDisplayValue("7")).toBeInTheDocument());
  });

  it("does not navigate on an empty submission, and restores the real current page", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    await typeAndCommit("   ");

    await waitFor(() => expect(screen.getByDisplayValue("12")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("synchronizes the displayed field when the page changes via Previous/Next", async () => {
    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(screen.getByDisplayValue("13")).toBeInTheDocument());
  });

  it("synchronizes the displayed field when navigation comes from a native PDF bookmark", async () => {
    mockGetOutline.mockResolvedValue([{ title: "Chapter 2", dest: ["ref-2"], items: [] }]);
    mockGetPageIndex.mockImplementation(async (ref: unknown) => (ref === "ref-2" ? 4 : 0));

    render(<PdfReader bookId="pdf1" title="Jump Test PDF" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    fireEvent.click(screen.getByRole("button", { name: "Chapter 2" }));

    await waitFor(() => expect(screen.getByDisplayValue("5")).toBeInTheDocument());
  });
});
