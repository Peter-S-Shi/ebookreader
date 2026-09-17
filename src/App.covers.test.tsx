import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { clearEpubCoverCache } from "./epubCover";
import { clearPdfCoverCache } from "./pdfCover";

const { invokeMock, openMock, collectionsMock, makeBookMock, mockGetDocument, mockGetPage } = vi.hoisted(() => {
  const getPage = vi.fn().mockImplementation(async () => ({
    getViewport: ({ scale }: { scale?: number } = {}) => ({
      width: 600 * (scale ?? 1.0),
      height: 800 * (scale ?? 1.0),
    }),
    render: () => ({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  }));
  const pdfDoc = {
    numPages: 5,
    getPage,
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const getDocument = vi.fn((_params?: any) => ({
    promise: Promise.resolve(pdfDoc),
  }));

  return {
    invokeMock: vi.fn(),
    openMock: vi.fn(),
    collectionsMock: vi.fn(),
    makeBookMock: vi.fn(),
    mockGetDocument: getDocument,
    mockGetPage: getPage,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => {
    const [cmd] = args as [string, { key?: string; bookId?: string } | undefined];
    if (cmd === "list_collections_command" || cmd === "list_collections_for_book_command") {
      return Promise.resolve([]);
    }
    if (cmd === "get_setting_command") {
      return Promise.resolve(null);
    }
    return invokeMock(...args);
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));

vi.mock("foliate-js/view.js", () => ({
  makeBook: (...args: unknown[]) => makeBookMock(...args),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (params: any) => mockGetDocument(params),
}));

describe("App Library Cover Integration (EPUB + PDF)", () => {
  beforeEach(() => {
    clearEpubCoverCache();
    clearPdfCoverCache();
    invokeMock.mockReset();
    openMock.mockReset();
    collectionsMock.mockReset();
    makeBookMock.mockReset();
    mockGetDocument.mockClear();
    mockGetPage.mockClear();
    vi.restoreAllMocks();

    let urlCounter = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      return `blob:http://localhost/mock-cover-${++urlCounter}`;
    });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    }) as any;

    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback: (blob: Blob | null) => void) => {
      callback(new Blob(["mock-canvas-bytes"], { type: "image/jpeg" }));
    });
  });

  it("renders cover images for EPUB and PDF books with declared covers, and placeholder for TXT", async () => {
    const mockBooks = [
      {
        book_id: "epub-with-cover",
        title: "EPUB With Cover",
        path: "C:/books/with-cover.epub",
        format: "epub",
        ownership_mode: "reference",
        available: true,
        last_opened_at: "2026-09-16T12:00:00Z",
      },
      {
        book_id: "pdf-book",
        title: "PDF Book",
        path: "C:/books/doc.pdf",
        format: "pdf",
        ownership_mode: "reference",
        available: true,
        last_opened_at: null,
      },
      {
        book_id: "txt-book",
        title: "TXT Book",
        path: "C:/books/doc.txt",
        format: "txt",
        ownership_mode: "reference",
        available: true,
        last_opened_at: null,
      },
    ];

    invokeMock.mockImplementation(async (cmd: string, args?: { bookId?: string }) => {
      if (cmd === "list_library_command") return mockBooks;
      if (cmd === "get_reading_progress_command") {
        return {
          book_id: args?.bookId ?? "",
          furthest_location: null,
          last_location: null,
          active_read_in_progress: true,
          active_pass_progress: 42,
          completed_read_count: 1,
          total_read_count: 1,
          last_read_at: "2026-09-16T12:00:00Z",
          started_at: "2026-09-16T10:00:00Z",
          completed_at: null,
        };
      }
      if (cmd === "read_book_file_command") {
        return new Uint8Array([1, 2, 3]);
      }
      return null;
    });

    const fakeBlob = new Blob(["fake-img-bytes"], { type: "image/png" });
    makeBookMock.mockResolvedValue({
      getCover: vi.fn().mockResolvedValue(fakeBlob),
    });

    const { container } = render(<App />);

    // Wait for library to render
    await screen.findByText("EPUB With Cover");
    await screen.findByText("PDF Book");
    await screen.findByText("TXT Book");

    // EPUB (2 instances: continue reading + library grid) and PDF (1 instance in library grid) render cover images
    await waitFor(() => {
      const coverImgs = container.querySelectorAll("img.cover-img");
      expect(coverImgs.length).toBe(3);
    });

    // TXT book displays the text format placeholder
    expect(screen.getByText("TXT")).toBeInTheDocument();

    // Completed Read badge and progress remain intact
    expect(screen.getAllByText("Read 1x").length).toBe(2);
    expect(screen.getAllByText("142%").length).toBe(2);
  });
});
