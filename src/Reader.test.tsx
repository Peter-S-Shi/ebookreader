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

interface FakeFoliateView {
  open: ReturnType<typeof vi.fn>;
  goTo: ReturnType<typeof vi.fn>;
  goToTextStart: ReturnType<typeof vi.fn>;
  getCFI: ReturnType<typeof vi.fn>;
  setStyles: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeChild?: unknown;
  style: Record<string, unknown>;
  book: { toc: unknown[]; sections: unknown[] };
  isFixedLayout: boolean;
  renderer: { setStyles: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn> };
  lastLocation?: { cfi?: string; fraction?: number };
}

function mockFoliateView(): FakeFoliateView {
  const fakeView: FakeFoliateView = {
    open: vi.fn().mockResolvedValue(undefined),
    goTo: vi.fn().mockResolvedValue({}),
    goToTextStart: vi.fn().mockResolvedValue(undefined),
    getCFI: vi.fn().mockReturnValue("epubcfi(/6/2!/4)"),
    setStyles: vi.fn(),
    addEventListener: vi.fn(),
    style: {},
    book: { toc: [], sections: [] },
    isFixedLayout: false,
    renderer: { setStyles: vi.fn(), setAttribute: vi.fn(), removeAttribute: vi.fn() },
    lastLocation: undefined,
  };
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag === "foliate-view") return fakeView as unknown as HTMLElement;
    return realCreateElement(tag, options);
  }) as typeof document.createElement;
  return fakeView;
}

const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  document.createElement = realCreateElement;
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "read_book_file_command":
        return [0, 1, 2, 3];
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

  it("resumes the saved location instead of the text start when one exists", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "read_book_file_command") return [0, 1, 2, 3];
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
    expect(css).not.toContain("color:");
  });
});
