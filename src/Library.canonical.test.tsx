import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
  save: vi.fn(),
  confirm: vi.fn(),
}));

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "list_library_command") {
      return [
        {
          book_id: "book-1",
          title: "The Great Gatsby",
          path: "C:/books/gatsby.epub",
          format: "epub",
          ownership_mode: "reference",
          available: true,
          last_opened_at: new Date().toISOString(),
        },
      ];
    }
    if (cmd === "list_collections_command") return [];
    if (cmd === "get_reading_progress_command") return { active_pass_progress: 45, completed_read_count: 0 };
    return [];
  });
});

describe("Library Canonical Surface (ER-LIB-001; C2 Batch 5)", () => {
  it("renders canonical library grid and action toolbar", async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole("button", { name: "The Great Gatsby" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Library" })).toBeInTheDocument();

    const libraryList = container.querySelector(".library-book-list");
    expect(libraryList).toBeInTheDocument();
    expect(libraryList).toHaveClass("grid");
  });
});
