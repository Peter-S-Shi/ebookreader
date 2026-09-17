import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPdfCoverCache,
  getOrFetchPdfCoverUrl,
  markPdfCoverBroken,
} from "./pdfCover";

const { invokeMock, mockGetDocument, mockGetPage } = vi.hoisted(() => {
  const renderTask = { promise: Promise.resolve(), cancel: vi.fn() };
  const getPage = vi.fn().mockImplementation(async () => ({
    getViewport: ({ scale }: { scale?: number } = {}) => ({
      width: 600 * (scale ?? 1.0),
      height: 800 * (scale ?? 1.0),
    }),
    render: () => renderTask,
    cleanup: vi.fn(),
  }));
  const pdfDoc = {
    numPages: 10,
    getPage,
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const getDocument = vi.fn((_params?: any) => ({
    promise: Promise.resolve(pdfDoc),
  }));

  return {
    invokeMock: vi.fn(),
    mockGetDocument: getDocument,
    mockGetPage: getPage,
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (params: any) => mockGetDocument(params),
}));

describe("pdfCover", () => {
  let createdUrls: string[] = [];
  let revokedUrls: string[] = [];

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    clearPdfCoverCache();
    invokeMock.mockReset();
    mockGetDocument.mockClear();
    mockGetPage.mockClear();
    vi.restoreAllMocks();

    let urlCounter = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const url = `blob:http://localhost/mock-pdf-cover-${++urlCounter}`;
      createdUrls.push(url);
      return url;
    });

    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
      revokedUrls.push(url);
    });

    // Mock HTMLCanvasElement.toBlob and getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    }) as any;

    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback: (blob: Blob | null) => void) => {
      callback(new Blob(["mock-canvas-bytes"], { type: "image/jpeg" }));
    });
  });

  it("returns null immediately for non-PDF formats without invoking IPC or pdfjs", async () => {
    const epubResult = await getOrFetchPdfCoverUrl("book-1", "epub");
    const txtResult = await getOrFetchPdfCoverUrl("book-2", "txt");

    expect(epubResult).toBeNull();
    expect(txtResult).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it("extracts Page 1 thumbnail using pdfjs and returns Object URL", async () => {
    invokeMock.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70, 45])); // %PDF-

    const coverUrl = await getOrFetchPdfCoverUrl("pdf-1", "pdf");

    expect(coverUrl).toMatch(/^blob:http:\/\/localhost\/mock-pdf-cover-/);
    expect(invokeMock).toHaveBeenCalledWith("read_book_file_command", { bookId: "pdf-1" });
    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        cMapUrl: "/cmaps/",
        cMapPacked: true,
        wasmUrl: "/wasm/",
      }),
    );
    expect(mockGetPage).toHaveBeenCalledWith(1);
  });

  it("caches successful cover URL and does not re-parse on subsequent calls", async () => {
    invokeMock.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70, 45]));

    const firstUrl = await getOrFetchPdfCoverUrl("pdf-cached", "pdf");
    expect(firstUrl).not.toBeNull();
    expect(mockGetDocument).toHaveBeenCalledTimes(1);

    const secondUrl = await getOrFetchPdfCoverUrl("pdf-cached", "pdf");
    expect(secondUrl).toBe(firstUrl);
    expect(mockGetDocument).toHaveBeenCalledTimes(1); // not called again
  });

  it("deduplicates concurrent in-flight requests for the same bookId", async () => {
    invokeMock.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]));

    const [urlA, urlB] = await Promise.all([
      getOrFetchPdfCoverUrl("pdf-concurrent", "pdf"),
      getOrFetchPdfCoverUrl("pdf-concurrent", "pdf"),
    ]);

    expect(urlA).toBe(urlB);
    expect(mockGetDocument).toHaveBeenCalledTimes(1);
  });

  it("caches null and returns null when reading file or pdfjs fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("File read error"));

    const failedUrl = await getOrFetchPdfCoverUrl("pdf-broken", "pdf");
    expect(failedUrl).toBeNull();

    // Subsequent request returns cached null without invoking IPC again
    const cachedNull = await getOrFetchPdfCoverUrl("pdf-broken", "pdf");
    expect(cachedNull).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("revokes Object URL when marked as broken", async () => {
    invokeMock.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70, 45]));

    const coverUrl = await getOrFetchPdfCoverUrl("pdf-to-break", "pdf");
    expect(coverUrl).not.toBeNull();

    markPdfCoverBroken("pdf-to-break");
    expect(revokedUrls).toContain(coverUrl);

    // Subsequent fetch returns null
    const nextUrl = await getOrFetchPdfCoverUrl("pdf-to-break", "pdf");
    expect(nextUrl).toBeNull();
  });

  it("revokes all allocated Object URLs when cache is cleared", async () => {
    invokeMock.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]));

    const url1 = await getOrFetchPdfCoverUrl("pdf-1", "pdf");
    const url2 = await getOrFetchPdfCoverUrl("pdf-2", "pdf");

    expect(createdUrls).toHaveLength(2);

    clearPdfCoverCache();

    expect(revokedUrls).toContain(url1);
    expect(revokedUrls).toContain(url2);
  });
});