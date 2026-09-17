import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEpubCoverCache,
  getOrFetchEpubCoverUrl,
  markEpubCoverBroken,
} from "./epubCover";

const { invokeMock, makeBookMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  makeBookMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("foliate-js/view.js", () => ({
  makeBook: (...args: unknown[]) => makeBookMock(...args),
}));

describe("epubCover module", () => {
  beforeEach(() => {
    clearEpubCoverCache();
    invokeMock.mockReset();
    makeBookMock.mockReset();
  });

  it("returns null immediately for non-EPUB formats without IPC or parsing", async () => {
    const pdfUrl = await getOrFetchEpubCoverUrl("book-pdf-1", "pdf");
    const txtUrl = await getOrFetchEpubCoverUrl("book-txt-1", "txt");

    expect(pdfUrl).toBeNull();
    expect(txtUrl).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(makeBookMock).not.toHaveBeenCalled();
  });

  it("extracts and returns an object URL when EPUB has a valid cover", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    invokeMock.mockResolvedValueOnce(fakeBytes);

    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const fakeBook = {
      getCover: vi.fn().mockResolvedValue(fakeBlob),
    };
    makeBookMock.mockResolvedValueOnce(fakeBook);

    const coverUrl = await getOrFetchEpubCoverUrl("book-epub-1", "epub");

    expect(invokeMock).toHaveBeenCalledWith("read_book_file_command", { bookId: "book-epub-1" });
    expect(makeBookMock).toHaveBeenCalled();
    expect(coverUrl).toMatch(/^blob:/);
  });

  it("returns null when EPUB has no cover declared", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    invokeMock.mockResolvedValueOnce(fakeBytes);

    const fakeBook = {
      getCover: vi.fn().mockResolvedValue(null),
    };
    makeBookMock.mockResolvedValueOnce(fakeBook);

    const coverUrl = await getOrFetchEpubCoverUrl("book-epub-no-cover", "epub");

    expect(coverUrl).toBeNull();
  });

  it("returns null safely when read_book_file_command or makeBook throws", async () => {
    invokeMock.mockRejectedValueOnce(new Error("File not found on disk"));

    const coverUrl = await getOrFetchEpubCoverUrl("book-epub-corrupt", "epub");

    expect(coverUrl).toBeNull();
  });

  it("deduplicates concurrent requests for the same book without duplicate IPC or parsing", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    invokeMock.mockResolvedValueOnce(fakeBytes);

    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const fakeBook = {
      getCover: vi.fn().mockResolvedValue(fakeBlob),
    };
    makeBookMock.mockResolvedValueOnce(fakeBook);

    // Call simultaneously (e.g. from Continue Reading and Library grid)
    const [url1, url2] = await Promise.all([
      getOrFetchEpubCoverUrl("book-shared-1", "epub"),
      getOrFetchEpubCoverUrl("book-shared-1", "epub"),
    ]);

    expect(url1).toBe(url2);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(makeBookMock).toHaveBeenCalledTimes(1);
  });

  it("returns cached result on subsequent calls", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    invokeMock.mockResolvedValueOnce(fakeBytes);

    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const fakeBook = {
      getCover: vi.fn().mockResolvedValue(fakeBlob),
    };
    makeBookMock.mockResolvedValueOnce(fakeBook);

    const url1 = await getOrFetchEpubCoverUrl("book-cached-1", "epub");
    const url2 = await getOrFetchEpubCoverUrl("book-cached-1", "epub");

    expect(url1).toBe(url2);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("allows marking a cover as broken so it falls back to null", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    invokeMock.mockResolvedValueOnce(fakeBytes);

    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const fakeBook = {
      getCover: vi.fn().mockResolvedValue(fakeBlob),
    };
    makeBookMock.mockResolvedValueOnce(fakeBook);

    const url1 = await getOrFetchEpubCoverUrl("book-broken-1", "epub");
    expect(url1).toBeTruthy();

    markEpubCoverBroken("book-broken-1");

    const url2 = await getOrFetchEpubCoverUrl("book-broken-1", "epub");
    expect(url2).toBeNull();
  });
});
