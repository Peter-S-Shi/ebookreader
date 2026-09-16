import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { clearEpubCoverCache } from "./epubCover";

const { invokeMock, openMock, collectionsMock, makeBookMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  collectionsMock: vi.fn(),
  makeBookMock: vi.fn(),
}));

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

describe("App EPUB Embedded Cover Integration", () => {
  beforeEach(() => {
    clearEpubCoverCache();
    invokeMock.mockReset();
    openMock.mockReset();
    collectionsMock.mockReset();
    makeBookMock.mockReset();
    vi.restoreAllMocks();
  });

  it("renders cover image for EPUB with a declared cover and placeholder for PDF/TXT", async () => {
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

    // Both continue reading and library grid render the EPUB cover with the shared URL
    await waitFor(() => {
      const coverImgs = container.querySelectorAll("img.cover-img");
      expect(coverImgs.length).toBe(2);
      expect(coverImgs[0].getAttribute("src")).toBe(coverImgs[1].getAttribute("src"));
    });

    // PDF book still displays the format text placeholder
    expect(screen.getByText("PDF")).toBeInTheDocument();

    // Completed Read badge and progress remain intact in both places
    expect(screen.getAllByText("Read 1x").length).toBe(2);
    expect(screen.getAllByText("142%").length).toBe(2);
  });
});
