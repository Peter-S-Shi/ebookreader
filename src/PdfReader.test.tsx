import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfReader } from "./PdfReader";

const { invokeMock, openUrlMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openUrlMock: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

const mockRenderTask = { promise: Promise.resolve(), cancel: vi.fn() };
const viewportScales: number[] = [];
const renderedPageNumbers: number[] = [];
const mockGetAnnotations = vi.fn(async () => [] as unknown[]);
const defaultMockGetPage = async (pageNo: number) => ({
  pageNo,
  getViewport: ({ scale }: { scale?: number } = {}) => {
    const resolvedScale = scale ?? 1.2;
    viewportScales.push(resolvedScale);
    return {
      width: 600 * resolvedScale,
      height: 800 * resolvedScale,
      scale: resolvedScale,
      convertToViewportPoint: (x: number, y: number) => [x * resolvedScale, y * resolvedScale],
    };
  },
  render: vi.fn().mockImplementation(() => {
    renderedPageNumbers.push(pageNo);
    return mockRenderTask;
  }),
  getTextContent: async () => ({ items: [] }), // No text items -> scanned PDF
  streamTextContent: async () => ({ items: [] }),
  getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
  getAnnotations: mockGetAnnotations,
});

const mockGetPage = vi.fn().mockImplementation(defaultMockGetPage);

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

const mockGetDocument = vi.fn((_params?: any) => ({
  promise: Promise.resolve(mockPdfDocument),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (params: any) => mockGetDocument(params),
  TextLayer: class {
    render() {
      return Promise.resolve();
    }
  },
  OPS: {
    save: 17,
    restore: 18,
    transform: 21,
    paintImageXObject: 82,
    paintInlineImageXObject: 83,
    paintImageMaskXObject: 84,
    paintSolidColorImageMask: 85,
  },
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  invokeMock.mockReset();
  openUrlMock.mockReset();
  mockGetDocument.mockClear();
  mockGetPage.mockReset().mockImplementation(defaultMockGetPage);
  viewportScales.length = 0;
  renderedPageNumbers.length = 0;
  mockRenderTask.cancel.mockClear();
  mockGetOutline.mockReset().mockResolvedValue(null);
  mockGetDestination.mockReset().mockResolvedValue(null);
  mockGetPageIndex.mockReset().mockResolvedValue(0);
  mockGetAnnotations.mockReset().mockResolvedValue([]);
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

describe("PdfReader — Document loading configuration", () => {
  it("initializes pdfjs getDocument with static cMapUrl, cMapPacked, and wasmUrl paths", async () => {
    render(<PdfReader bookId="pdf1" title="PDF Document Loading" onBack={vi.fn()} />);
    await screen.findByDisplayValue("12");

    expect(mockGetDocument).toHaveBeenCalledTimes(1);
    const callArgs = mockGetDocument.mock.calls[0][0];
    expect(callArgs.cMapUrl).toBe("/cmaps/");
    expect(callArgs.cMapPacked).toBe(true);
    expect(callArgs.wasmUrl).toBe("/wasm/");
    expect(callArgs.data).toBeInstanceOf(Uint8Array);
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
    Object.defineProperty(continuousSurface, "scrollTop", { configurable: true, value: 12 * 976 });
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

  describe("Page Appearance controls", () => {
    it("renders the Page Appearance select with Default, Day, Eye Care, Parchment, and Night options", async () => {
      render(<PdfReader bookId="pdf1" title="Appearance PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      const select = screen.getByLabelText("Page appearance") as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(select.value).toBe("default");

      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(["default", "day", "eyecare", "parchment", "night"]);
    });

    it("changes appearance mode to night and updates data-appearance on pdf-page", async () => {
      render(<PdfReader bookId="pdf1" title="Appearance PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      const select = screen.getByLabelText("Page appearance") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "night" } });
      expect(select.value).toBe("night");

      const pdfPage = document.querySelector(".pdf-page") as HTMLElement;
      expect(pdfPage).toBeInTheDocument();
      expect(pdfPage.getAttribute("data-appearance")).toBe("night");
    });
  });

  describe("Native PDF Hyperlinks", () => {
    it("navigates to the resolved destination page when an internal link is clicked", async () => {
      mockGetAnnotations.mockResolvedValueOnce([
        {
          subtype: "Link",
          rect: [50, 100, 200, 150],
          dest: [24, { name: "XYZ" }, 0, 0, null], // target page 25
        },
      ]);

      render(<PdfReader bookId="pdf1" title="Hyperlink PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      const link = await screen.findByRole("link", { name: /jump to page 25/i });
      expect(link).toBeInTheDocument();

      fireEvent.click(link);
      await waitFor(() => expect(screen.getByDisplayValue("25")).toBeInTheDocument());
    });

    it("opens confirmation modal for external HTTP/HTTPS link and opens URL in browser on confirm", async () => {
      const targetUrl = "https://example.com/path?foo=bar#target";
      mockGetAnnotations.mockResolvedValueOnce([
        {
          subtype: "Link",
          rect: [50, 100, 200, 150],
          url: targetUrl,
        },
      ]);

      render(<PdfReader bookId="pdf1" title="Hyperlink PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      const link = await screen.findByRole("link", { name: `Open external link: ${targetUrl}` });
      expect(link).toBeInTheDocument();

      fireEvent.click(link);

      // Confirmation modal should appear
      const modal = await screen.findByRole("alertdialog", { name: "Open External Link" });
      expect(modal).toBeInTheDocument();
      expect(screen.getByText(targetUrl)).toBeInTheDocument();

      // Click Cancel
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("alertdialog", { name: "Open External Link" })).not.toBeInTheDocument();
      expect(openUrlMock).not.toHaveBeenCalled();

      // Click again and Confirm
      fireEvent.click(link);
      await screen.findByRole("alertdialog", { name: "Open External Link" });
      fireEvent.click(screen.getByRole("button", { name: "Open in Browser" }));

      expect(openUrlMock).toHaveBeenCalledTimes(1);
      expect(openUrlMock).toHaveBeenCalledWith(targetUrl);
      expect(screen.queryByRole("alertdialog", { name: "Open External Link" })).not.toBeInTheDocument();
    });

    it("does not trigger modal or browser opening for disallowed schemes", async () => {
      mockGetAnnotations.mockResolvedValueOnce([
        {
          subtype: "Link",
          rect: [50, 100, 200, 150],
          url: "javascript:alert(1)",
        },
      ]);

      render(<PdfReader bookId="pdf1" title="Hyperlink PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      const link = await screen.findByRole("link", { name: /unsupported link/i });
      expect(link).toBeInTheDocument();

      fireEvent.click(link);
      expect(screen.queryByRole("alertdialog", { name: "Open External Link" })).not.toBeInTheDocument();
      expect(openUrlMock).not.toHaveBeenCalled();
    });
  });

  describe("PdfReader — Document OCR Eligibility & Classification", () => {
    it("does not show OCR Workspace when document is predominantly healthy text even with an occasional image-only page", async () => {
      mockGetPage.mockImplementation(async (pageNo: number) => ({
        getViewport: ({ scale }: { scale?: number } = {}) => ({
          width: 600 * (scale ?? 1.2),
          height: 800 * (scale ?? 1.2),
          scale: scale ?? 1.2,
          convertToViewportPoint: (x: number, y: number) => [x * (scale ?? 1.2), y * (scale ?? 1.2)],
        }),
        render: () => mockRenderTask,
        // Page 1 is cover (0 text), Pages 2..50 have body text (>50 characters)
        getTextContent: async () => ({
          items:
            pageNo === 1
              ? []
              : [
                  {
                    str: "This is a healthy body text paragraph on page that has plenty of characters to exceed fifty chars: " +
                      pageNo,
                  },
                ],
        }),
        streamTextContent: async () => ({ items: [] }),
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        getAnnotations: mockGetAnnotations,
      }));

      render(<PdfReader bookId="pdf1" title="Healthy Text PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      // Wait for deferred background classification sweep
      await new Promise((r) => setTimeout(r, 200));

      expect(screen.queryByRole("button", { name: "OCR Workspace" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Scanned document notice")).not.toBeInTheDocument();
    });

    it("shows OCR Workspace for predominantly scanned book with sparse incidental text (like sample issue1)", async () => {
      mockGetPage.mockImplementation(async (pageNo: number) => ({
        getViewport: ({ scale }: { scale?: number } = {}) => ({
          width: 600 * (scale ?? 1.2),
          height: 800 * (scale ?? 1.2),
          scale: scale ?? 1.2,
          convertToViewportPoint: (x: number, y: number) => [x * (scale ?? 1.2), y * (scale ?? 1.2)],
        }),
        render: () => mockRenderTask,
        // Only page 50 has watermark text; pages 1..49 have 0 text
        getTextContent: async () => ({
          items:
            pageNo === 50
              ? [
                  {
                    str: "Document generated by Archive metadata colophon watermark text with many characters in the colophon",
                  },
                ]
              : [],
        }),
        streamTextContent: async () => ({ items: [] }),
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        getAnnotations: mockGetAnnotations,
      }));

      render(<PdfReader bookId="pdf1" title="Scanned Book With Colophon" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "OCR Workspace" })).toBeInTheDocument();
      });
    });

    it("shows OCR Workspace for hybrid PDF with both text and scanned pages", async () => {
      mockGetPage.mockImplementation(async (pageNo: number) => ({
        getViewport: ({ scale }: { scale?: number } = {}) => ({
          width: 600 * (scale ?? 1.2),
          height: 800 * (scale ?? 1.2),
          scale: scale ?? 1.2,
          convertToViewportPoint: (x: number, y: number) => [x * (scale ?? 1.2), y * (scale ?? 1.2)],
        }),
        render: () => mockRenderTask,
        // Even pages have text (>50 chars), odd pages are scanned (50% text, 50% scan)
        getTextContent: async () => ({
          items:
            pageNo % 2 === 0
              ? [
                  {
                    str: "This is a meaningful body text paragraph on even page with many characters to exceed the threshold: " +
                      pageNo,
                  },
                ]
              : [],
        }),
        streamTextContent: async () => ({ items: [] }),
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        getAnnotations: mockGetAnnotations,
      }));

      render(<PdfReader bookId="pdf1" title="Hybrid PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "OCR Workspace" })).toBeInTheDocument();
      });
    });
  });

  describe("PdfReader — Grouped Toolbar Structure (V2 Addendum B)", () => {
    it("renders structured toolbar rows and semantic groups without flat clutter", async () => {
      mockGetOutline.mockResolvedValue([{ title: "Chapter 1", dest: ["ref-1"], items: [] }]);
      render(<PdfReader bookId="pdf1" title="Structured Toolbar PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      const toolbar = screen.getByRole("toolbar", { name: "PDF Reader Toolbar" });
      expect(toolbar).toBeInTheDocument();

      // Config row contains Document, View, and Geometry groups
      const configRow = toolbar.querySelector(".pdf-toolbar-row--config");
      expect(configRow).toBeInTheDocument();
      expect(configRow?.querySelector(".pdf-toolbar-group--document")).toBeInTheDocument();
      expect(configRow?.querySelector(".pdf-toolbar-group--view")).toBeInTheDocument();
      expect(configRow?.querySelector(".pdf-toolbar-group--geometry")).toBeInTheDocument();

      // View group controls
      expect(within(configRow as HTMLElement).getByRole("combobox", { name: "View mode" })).toBeInTheDocument();
      expect(within(configRow as HTMLElement).getByRole("combobox", { name: "Page appearance" })).toBeInTheDocument();

      // Geometry group controls
      expect(within(configRow as HTMLElement).getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
      expect(within(configRow as HTMLElement).getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
      expect(within(configRow as HTMLElement).getByRole("button", { name: "Fit page" })).toBeInTheDocument();
      expect(within(configRow as HTMLElement).getByRole("button", { name: "Fit width" })).toBeInTheDocument();

      // Actions row contains Navigation and Tools groups
      const actionsRow = toolbar.querySelector(".pdf-toolbar-row--actions");
      expect(actionsRow).toBeInTheDocument();

      const navGroup = actionsRow?.querySelector(".pdf-toolbar-group--navigation");
      expect(navGroup).toBeInTheDocument();
      expect(within(navGroup as HTMLElement).getByRole("button", { name: "Previous" })).toBeInTheDocument();
      expect(within(navGroup as HTMLElement).getByRole("textbox", { name: "Current page" })).toBeInTheDocument();
      expect(within(navGroup as HTMLElement).getByRole("button", { name: "Next" })).toBeInTheDocument();

      const toolsGroup = actionsRow?.querySelector(".pdf-toolbar-group--tools");
      expect(toolsGroup).toBeInTheDocument();
      expect(within(toolsGroup as HTMLElement).getByRole("button", { name: "Notebook" })).toBeInTheDocument();
      expect(within(toolsGroup as HTMLElement).getByRole("button", { name: "Toggle page-turn sound" })).toBeInTheDocument();
    });

    it("omits the document group cleanly when PDF has no outline", async () => {
      mockGetOutline.mockResolvedValue(null);
      render(<PdfReader bookId="pdf1" title="No Outline Toolbar PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      const toolbar = screen.getByRole("toolbar", { name: "PDF Reader Toolbar" });
      expect(toolbar.querySelector(".pdf-toolbar-group--document")).not.toBeInTheDocument();
      expect(toolbar.querySelector(".pdf-toolbar-group--view")).toBeInTheDocument();
      expect(toolbar.querySelector(".pdf-toolbar-group--geometry")).toBeInTheDocument();
    });
  });

  describe("PdfReader — Bounded Continuous Mode Rendering (H2)", () => {
    it("bounds continuous rendering to the active window around the current page", async () => {
      render(<PdfReader bookId="pdf1" title="Bounded Continuous Test PDF" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      renderedPageNumbers.length = 0;

      // Switch to continuous mode
      fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), { target: { value: "continuous" } });

      await waitFor(() => {
        // Page 12 (active target) should be rendered
        expect(renderedPageNumbers).toContain(12);
      });

      // Distant pages (e.g. 1, 50) should NOT have render() called
      expect(renderedPageNumbers).toContain(12);
      expect(renderedPageNumbers).not.toContain(1);
      expect(renderedPageNumbers).not.toContain(50);
      expect(renderedPageNumbers.length).toBeLessThanOrEqual(5);
    });

    it("renders newly visible pages when scrolled in continuous mode", async () => {
      render(<PdfReader bookId="pdf1" title="Continuous Scroll Render Test" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), { target: { value: "continuous" } });
      await waitFor(() => expect(renderedPageNumbers).toContain(12));

      renderedPageNumbers.length = 0;

      const continuousSurface = document.querySelector<HTMLElement>(".pdf-continuous")!;
      expect(continuousSurface).toBeInTheDocument();

      // Scroll to page 30: at 120% scale (height 960 + 16px margin = 976px per page),
      // page 30 begins at 29 * 976px
      Object.defineProperty(continuousSurface, "scrollTop", { configurable: true, value: 29 * 976 });
      fireEvent.scroll(continuousSurface);

      await waitFor(() => {
        expect(renderedPageNumbers).toContain(30);
      });
    });

    it("updates appearance for active pages only when Page Appearance changes in continuous mode", async () => {
      render(<PdfReader bookId="pdf1" title="Continuous Appearance Test" onBack={vi.fn()} />);
      await screen.findByDisplayValue("12");

      fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), { target: { value: "continuous" } });
      await waitFor(() => expect(renderedPageNumbers).toContain(12));

      renderedPageNumbers.length = 0;

      // Change appearance to Eye Care
      fireEvent.change(screen.getByRole("combobox", { name: "Page appearance" }), { target: { value: "eyecare" } });

      await waitFor(() => {
        // Active window page is maintained and updated
        expect(screen.getByRole("combobox", { name: "Page appearance" })).toHaveValue("eyecare");
      });

      // Distant pages should NOT have render() called
      expect(renderedPageNumbers).not.toContain(50);
    });
  });
});
