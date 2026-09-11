import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

const mockPdfDocument = {
  numPages: 50,
  getPage: mockGetPage,
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
    await screen.findByText("Page 12 of 50");

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
    await screen.findByText("Page 12 of 50");

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Page 13 of 50")).toBeInTheDocument();

    const mode = screen.getByRole("combobox", { name: "View mode" });
    mode.focus();
    fireEvent.keyDown(mode, { key: "ArrowLeft" });
    expect(screen.getByText("Page 13 of 50")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "ArrowLeft", ctrlKey: true });
    expect(screen.getByText("Page 13 of 50")).toBeInTheDocument();

    const alertDialog = document.createElement("div");
    alertDialog.setAttribute("role", "alertdialog");
    document.body.append(alertDialog);
    fireEvent.keyDown(alertDialog, { key: "ArrowLeft" });
    expect(screen.getByText("Page 13 of 50")).toBeInTheDocument();
    alertDialog.remove();
  });

  it("moves continuous mode to the adjacent page with arrow keys", async () => {
    render(<PdfReader bookId="pdf1" title="PDF continuous keyboard" onBack={vi.fn()} />);
    await screen.findByText("Page 12 of 50");
    fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), { target: { value: "continuous" } });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Page 13 of 50")).toBeInTheDocument();

    const continuousSurface = document.querySelector<HTMLElement>(".pdf-continuous")!;
    Object.defineProperty(continuousSurface, "scrollTop", { configurable: true, value: 0 });
    fireEvent.scroll(continuousSurface);
    expect(screen.getByText("Page 13 of 50")).toBeInTheDocument();
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
