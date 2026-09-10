import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reader } from "./Reader";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
// The real foliate-js custom element is heavy (pulls in zip.js/web
// workers) and not needed to exercise Reader's own navigation-on-open
// logic -- `document.createElement("foliate-view")` is intercepted per
// test instead (see `mockFoliateView` below), so this import just needs
// to resolve without doing anything.
vi.mock("foliate-js/view.js", () => ({}));

interface FakeFoliateView extends HTMLElement {
  open: ReturnType<typeof vi.fn>;
  goTo: ReturnType<typeof vi.fn>;
  goToTextStart: ReturnType<typeof vi.fn>;
  goLeft: ReturnType<typeof vi.fn>;
  goRight: ReturnType<typeof vi.fn>;
  prev: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
  getCFI: ReturnType<typeof vi.fn>;
  setStyles: ReturnType<typeof vi.fn>;
  book: { toc: unknown[]; sections: unknown[] };
  isFixedLayout: boolean;
  renderer: { setStyles: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn> };
  lastLocation?: { cfi?: string; fraction?: number };
  emitSectionLoad(doc: Document, index?: number): void;
}

function mockFoliateView(): FakeFoliateView {
  const fakeView = realCreateElement("div") as unknown as FakeFoliateView;
  Object.assign(fakeView, {
    open: vi.fn().mockResolvedValue(undefined),
    goTo: vi.fn().mockResolvedValue({}),
    goToTextStart: vi.fn().mockResolvedValue(undefined),
    goLeft: vi.fn().mockResolvedValue(undefined),
    goRight: vi.fn().mockResolvedValue(undefined),
    prev: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    getCFI: vi.fn().mockReturnValue("epubcfi(/6/2!/4)"),
    setStyles: vi.fn(),
    book: { toc: [], sections: [] },
    isFixedLayout: false,
    renderer: { setStyles: vi.fn(), setAttribute: vi.fn(), removeAttribute: vi.fn() },
    lastLocation: undefined,
    emitSectionLoad(doc: Document, index = 0) {
      fakeView.dispatchEvent(new CustomEvent("load", { detail: { doc, index } }));
    },
  });
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag === "foliate-view") return fakeView as unknown as HTMLElement;
    return realCreateElement(tag, options);
  }) as typeof document.createElement;
  return fakeView;
}

function makeSectionDocument(markup = "<main><p tabindex='0'>Readable EPUB content</p></main>") {
  const doc = document.implementation.createHTMLDocument("EPUB section");
  doc.body.innerHTML = markup;
  return doc;
}

const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  document.createElement = realCreateElement;
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "read_book_file_command":
        return new Uint8Array([0, 1, 2, 3]);
      case "load_reading_location_command":
        return null;
      case "reading_session_status_command":
        return { state: "active", total_excluded_ms: 0, total_note_taking_ms: 0 };
      default:
        return null;
    }
  });
});

describe("Reader — EPUB navigation on open (HA-002 / PRODUCT_SPEC.md SS7 'Reader always shows real content')", () => {
  it("shows the Book's real text start on a fresh open with no saved location and no initial anchor", async () => {
    const fakeView = mockFoliateView();

    render(<Reader bookId="b1" title="Fresh Book" onBack={vi.fn()} />);

    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    // foliate-js's `open()` only sets up the renderer -- it never renders
    // any section by itself. Without an explicit navigation call the
    // reading surface stays blank even though the TOC is already
    // populated (the real HA-002 symptom). A fresh Book (no saved
    // location, no initialAnchor from Search/Notes) must still resolve to
    // real visible content.
    await waitFor(() => expect(fakeView.goToTextStart).toHaveBeenCalled());
    expect(fakeView.goTo).not.toHaveBeenCalled();
  });

  it("applies display:block and full width/height styles to foliate-view custom element", async () => {
    const fakeView = mockFoliateView();

    render(<Reader bookId="b1" title="Fresh Book" onBack={vi.fn()} />);

    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    expect(fakeView.style.width).toBe("100%");
    expect(fakeView.style.height).toBe("100%");
    expect(fakeView.style.display).toBe("block");
  });

  it("resumes the saved location instead of the text start when one exists", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "read_book_file_command") return new Uint8Array([0, 1, 2, 3]);
      if (cmd === "load_reading_location_command") {
        return { book_id: "b1", format: "epub", progression_hint: 0.4, primary_anchor: "epubcfi(/6/8!/4)", fallback_anchors: [], context_selector: null };
      }
      if (cmd === "reading_session_status_command") {
        return { state: "active", total_excluded_ms: 0, total_note_taking_ms: 0 };
      }
      return null;
    });
    const fakeView = mockFoliateView();

    render(<Reader bookId="b1" title="Resumed Book" onBack={vi.fn()} />);

    await waitFor(() => expect(fakeView.goTo).toHaveBeenCalledWith("epubcfi(/6/8!/4)"));
    expect(fakeView.goToTextStart).not.toHaveBeenCalled();
  });

  it("jumps to an exact initialAnchor (Search/Notes jump) instead of the text start", async () => {
    const fakeView = mockFoliateView();
    const initialAnchor = {
      book_id: "b1",
      format: "epub",
      progression_hint: 0.1,
      primary_anchor: "epubcfi(/6/4!/2)",
      fallback_anchors: [],
      context_selector: null,
    };

    render(<Reader bookId="b1" title="Jump Book" onBack={vi.fn()} initialAnchor={initialAnchor} />);

    await waitFor(() => expect(fakeView.goTo).toHaveBeenCalledWith("epubcfi(/6/4!/2)"));
    expect(fakeView.goToTextStart).not.toHaveBeenCalled();
  });
});

describe("Reader — Dark theme propagation into the rendered EPUB (HA-007)", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("forces a readable foreground/background on the rendered section when the app is in Dark theme", async () => {
    document.documentElement.dataset.theme = "dark";
    const fakeView = mockFoliateView();

    render(<Reader bookId="b1" title="Dark Theme Book" onBack={vi.fn()} />);

    await waitFor(() => expect(fakeView.renderer.setStyles).toHaveBeenCalled());
    const css = fakeView.renderer.setStyles.mock.calls[0][0] as string;
    expect(css).toContain("color: #f6f6f6 !important");
    expect(css).toContain("background-color: #1a1a1a !important");
  });

  it("does not override colors when the app is in Light theme", async () => {
    document.documentElement.dataset.theme = "light";
    const fakeView = mockFoliateView();

    render(<Reader bookId="b1" title="Light Theme Book" onBack={vi.fn()} />);

    await waitFor(() => expect(fakeView.renderer.setStyles).toHaveBeenCalled());
    const css = fakeView.renderer.setStyles.mock.calls[0][0] as string;
    expect(css).not.toContain("color: #f6f6f6 !important");
  });
});

describe("Reader — paginated reading input (HA-011)", () => {
  it("uses foliate-js directional navigation for ArrowLeft/ArrowRight in paginated modes", async () => {
    const fakeView = mockFoliateView();
    render(<Reader bookId="b1" title="Keyboard Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));

    expect(fakeView.goRight).toHaveBeenCalledTimes(1);
    expect(fakeView.goLeft).toHaveBeenCalledTimes(1);
  });

  it("uses foliate-js directional navigation for ArrowLeft/ArrowRight from the rendered EPUB document", async () => {
    const fakeView = mockFoliateView();
    render(<Reader bookId="b1" title="EPUB Keyboard Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    const sectionDoc = makeSectionDocument();
    fakeView.emitSectionLoad(sectionDoc);
    const paragraph = sectionDoc.querySelector("p")!;

    paragraph.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    paragraph.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));

    expect(fakeView.goRight).toHaveBeenCalledTimes(1);
    expect(fakeView.goLeft).toHaveBeenCalledTimes(1);
  });

  it("does not miss the EPUB document that loads during the initial fresh-open navigation", async () => {
    const fakeView = mockFoliateView();
    const sectionDoc = makeSectionDocument();
    fakeView.goToTextStart.mockImplementation(async () => {
      fakeView.emitSectionLoad(sectionDoc);
    });
    render(<Reader bookId="b1" title="Initial Load Keyboard Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.goToTextStart).toHaveBeenCalled());

    sectionDoc.querySelector("p")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(fakeView.goRight).toHaveBeenCalledTimes(1);
  });

  it("does not hijack keyboard navigation while the user is editing a form control", async () => {
    const fakeView = mockFoliateView();
    render(
      <>
        <input aria-label="Editing" />
        <Reader bookId="b1" title="Keyboard Book" onBack={vi.fn()} />
      </>,
    );
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    const input = document.querySelector("input")!;
    input.focus();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(fakeView.goRight).not.toHaveBeenCalled();
  });

  it("uses foliate-js reading-order navigation for mouse wheel in paginated modes", async () => {
    const fakeView = mockFoliateView();
    const { container } = render(<Reader bookId="b1" title="Wheel Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());

    container.querySelector(".reader")!.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));
    container.querySelector(".reader")!.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true }));

    expect(fakeView.next).toHaveBeenCalledTimes(1);
    expect(fakeView.prev).toHaveBeenCalledTimes(1);
  });

  it("uses foliate-js reading-order navigation for mouse wheel from the rendered EPUB document", async () => {
    const fakeView = mockFoliateView();
    render(<Reader bookId="b1" title="EPUB Wheel Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    const sectionDoc = makeSectionDocument();
    fakeView.emitSectionLoad(sectionDoc);
    const paragraph = sectionDoc.querySelector("p")!;

    paragraph.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    paragraph.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }));

    expect(fakeView.next).toHaveBeenCalledTimes(1);
    expect(fakeView.prev).toHaveBeenCalledTimes(1);
  });

  it("supports the same EPUB document wheel navigation in Single Page mode", async () => {
    const fakeView = mockFoliateView();
    const { container } = render(<Reader bookId="b1" title="Single Page EPUB Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    const sectionDoc = makeSectionDocument();
    fakeView.emitSectionLoad(sectionDoc);

    const select = container.querySelector("select[aria-label='View mode']") as HTMLSelectElement;
    select.value = "paginated-single";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sectionDoc.querySelector("p")!.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));

    expect(fakeView.next).toHaveBeenCalledTimes(1);
  });

  it("keeps foliate relocate persistence active after keyboard page turns from the rendered EPUB document", async () => {
    const fakeView = mockFoliateView();
    fakeView.goRight.mockImplementation(async () => {
      fakeView.dispatchEvent(
        new CustomEvent("relocate", {
          detail: { cfi: "epubcfi(/6/4!/2)", fraction: 0.42 },
        }),
      );
    });
    render(<Reader bookId="b1" title="Persistent EPUB Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    const sectionDoc = makeSectionDocument();
    fakeView.emitSectionLoad(sectionDoc);

    sectionDoc.querySelector("p")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("save_reading_location_command", {
        location: {
          book_id: "b1",
          format: "epub",
          progression_hint: 0.42,
          primary_anchor: "epubcfi(/6/4!/2)",
          fallback_anchors: [],
          context_selector: null,
        },
      }),
    );
  });

  it("keeps Continuous Scroll as natural scrolling instead of remapping wheel input to page turns", async () => {
    const fakeView = mockFoliateView();
    const { container } = render(<Reader bookId="b1" title="Scrolled Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());

    const select = container.querySelector("select[aria-label='View mode']") as HTMLSelectElement;
    select.value = "scrolled";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    container.querySelector(".reader")!.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));

    expect(fakeView.next).not.toHaveBeenCalled();
    expect(fakeView.prev).not.toHaveBeenCalled();
  });

  it("keeps Continuous Scroll natural for mouse wheel from the rendered EPUB document", async () => {
    const fakeView = mockFoliateView();
    const { container } = render(<Reader bookId="b1" title="Scrolled EPUB Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    const sectionDoc = makeSectionDocument();
    fakeView.emitSectionLoad(sectionDoc);

    const select = container.querySelector("select[aria-label='View mode']") as HTMLSelectElement;
    select.value = "scrolled";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    sectionDoc.querySelector("p")!.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));

    expect(fakeView.next).not.toHaveBeenCalled();
    expect(fakeView.prev).not.toHaveBeenCalled();
  });

  it("does not hijack EPUB form controls for page turns", async () => {
    const fakeView = mockFoliateView();
    render(<Reader bookId="b1" title="EPUB Form Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.open).toHaveBeenCalled());
    const sectionDoc = makeSectionDocument("<label>Search <input /></label>");
    fakeView.emitSectionLoad(sectionDoc);
    const input = sectionDoc.querySelector("input")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    input.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));

    expect(fakeView.goRight).not.toHaveBeenCalled();
    expect(fakeView.next).not.toHaveBeenCalled();
  });
});

describe("Reader — Highlight Management", () => {
  it("includes a clear/remove highlight swatch button in selection toolbar", async () => {
    const fakeView = mockFoliateView();
    const sectionDoc = makeSectionDocument();
    fakeView.goToTextStart.mockImplementation(async () => {
      fakeView.emitSectionLoad(sectionDoc);
    });
    render(<Reader bookId="b1" title="Clear Swatch Book" onBack={vi.fn()} />);
    await waitFor(() => expect(fakeView.goToTextStart).toHaveBeenCalled());

    // Trigger selection
    const textNode = sectionDoc.querySelector("p")!.firstChild!;
    const range = sectionDoc.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 8);
    sectionDoc.getSelection = () =>
      ({
        isCollapsed: false,
        rangeCount: 1,
        toString: () => "Selected text",
        getRangeAt: () => range,
        removeAllRanges: vi.fn(),
      } as unknown as Selection);

    sectionDoc.dispatchEvent(new Event("selectionchange"));

    await waitFor(() => expect(document.querySelector(".highlight-swatch--clear")).not.toBeNull());
  });
});
