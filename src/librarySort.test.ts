import { describe, it, expect } from "vitest";
import {
  sortLibraryBooks,
  type SortableBook,
} from "./librarySort";

describe("librarySort", () => {
  const sampleBooks: SortableBook[] = [
    {
      book_id: "id-1",
      title: "Apple Guide",
      last_opened_at: "2026-03-01T10:00:00Z",
      importIndex: 0, // newest imported
    },
    {
      book_id: "id-2",
      title: "Banana Story",
      last_opened_at: "2026-03-05T10:00:00Z",
      importIndex: 1,
    },
    {
      book_id: "id-3",
      title: "apple 10 pro",
      last_opened_at: null,
      importIndex: 2,
    },
    {
      book_id: "id-4",
      title: "Apple 2 pro",
      last_opened_at: "2026-02-20T10:00:00Z",
      importIndex: 3, // oldest imported
    },
    {
      book_id: "id-5",
      title: "中文书",
      last_opened_at: null,
      importIndex: 4,
    },
  ];

  it("sorts by Recently Imported — Newest First (default)", () => {
    const result = sortLibraryBooks(sampleBooks, "recent-import-desc");
    expect(result.map((b) => b.book_id)).toEqual(["id-1", "id-2", "id-3", "id-4", "id-5"]);
  });

  it("sorts by Recently Imported — Oldest First", () => {
    const result = sortLibraryBooks(sampleBooks, "recent-import-asc");
    expect(result.map((b) => b.book_id)).toEqual(["id-5", "id-4", "id-3", "id-2", "id-1"]);
  });

  it("sorts by Title — A → Z using natural/numeric collation", () => {
    const books: SortableBook[] = [
      { book_id: "b", title: "Chapter 10", importIndex: 0 },
      { book_id: "a", title: "Chapter 2", importIndex: 1 },
      { book_id: "c", title: "chapter 1", importIndex: 2 },
      { book_id: "d", title: "Book Alpha", importIndex: 3 },
    ];
    const result = sortLibraryBooks(books, "title-asc");
    expect(result.map((b) => b.title)).toEqual([
      "Book Alpha",
      "chapter 1",
      "Chapter 2",
      "Chapter 10",
    ]);
  });

  it("sorts by Title — Z → A using natural/numeric collation", () => {
    const books: SortableBook[] = [
      { book_id: "b", title: "Chapter 10", importIndex: 0 },
      { book_id: "a", title: "Chapter 2", importIndex: 1 },
      { book_id: "c", title: "chapter 1", importIndex: 2 },
      { book_id: "d", title: "Book Alpha", importIndex: 3 },
    ];
    const result = sortLibraryBooks(books, "title-desc");
    expect(result.map((b) => b.title)).toEqual([
      "Chapter 10",
      "Chapter 2",
      "chapter 1",
      "Book Alpha",
    ]);
  });

  it("sorts by Recently Opened — Newest First with never-opened books placed AFTER opened books", () => {
    const result = sortLibraryBooks(sampleBooks, "recent-open-desc");
    // Opened: id-2 (March 5), id-1 (March 1), id-4 (Feb 20)
    // Never opened: id-3, id-5 (retaining relative import order)
    expect(result.map((b) => b.book_id)).toEqual(["id-2", "id-1", "id-4", "id-3", "id-5"]);
  });

  it("sorts by Recently Opened — Oldest First with never-opened books placed AFTER opened books", () => {
    const result = sortLibraryBooks(sampleBooks, "recent-open-asc");
    // Opened oldest first: id-4 (Feb 20), id-1 (March 1), id-2 (March 5)
    // Never opened: id-3, id-5 (retaining relative import order)
    expect(result.map((b) => b.book_id)).toEqual(["id-4", "id-1", "id-2", "id-3", "id-5"]);
  });

  it("uses deterministic tie-breaker when titles or timestamps are identical", () => {
    const identicalTitles: SortableBook[] = [
      { book_id: "id-b", title: "Same Title", importIndex: 0 },
      { book_id: "id-a", title: "Same Title", importIndex: 1 },
    ];
    expect(sortLibraryBooks(identicalTitles, "title-asc").map((b) => b.book_id)).toEqual(["id-b", "id-a"]);
    expect(sortLibraryBooks(identicalTitles, "title-desc").map((b) => b.book_id)).toEqual(["id-b", "id-a"]);

    const identicalOpened: SortableBook[] = [
      { book_id: "id-b", title: "Book B", last_opened_at: "2026-03-01T00:00:00Z", importIndex: 0 },
      { book_id: "id-a", title: "Book A", last_opened_at: "2026-03-01T00:00:00Z", importIndex: 1 },
    ];
    expect(sortLibraryBooks(identicalOpened, "recent-open-desc").map((b) => b.book_id)).toEqual(["id-b", "id-a"]);
    expect(sortLibraryBooks(identicalOpened, "recent-open-asc").map((b) => b.book_id)).toEqual(["id-b", "id-a"]);
  });

  it("does not mutate the input array", () => {
    const original = [...sampleBooks];
    sortLibraryBooks(sampleBooks, "title-asc");
    expect(sampleBooks).toEqual(original);
  });
});
