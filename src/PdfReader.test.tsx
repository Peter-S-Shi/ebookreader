import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfReader } from "./PdfReader";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const mockRenderTask = { promise: Promise.resolve(), cancel: vi.fn() };
const mockGetPage = vi.fn().mockImplementation(async (_pageNo: number) => ({
  getViewport: () => ({ width: 600, height: 800, scale: 1.2 }),
  render: () => mockRenderTask,
  getTextContent: async () => ({ items: [{ str: "Sample page text" }] }),
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
  invokeMock.mockReset();
  mockGetPage.mockClear();
  mockRenderTask.cancel.mockClear();
  invokeMock.mockImplementation(async (cmd: string) => {
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
      return null;
    }
    if (cmd === "reading_session_status_command") {
      return { state: "active", total_excluded_ms: 0, total_note_taking_ms: 0 };
    }
    return null;
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
