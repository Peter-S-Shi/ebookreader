export type LibrarySortOption =
  | "recent-import-desc"
  | "recent-import-asc"
  | "title-asc"
  | "title-desc"
  | "recent-open-desc"
  | "recent-open-asc";

export interface SortableBook {
  book_id: string;
  title: string;
  last_opened_at?: string | null;
  importIndex?: number;
}

export const LIBRARY_SORT_OPTIONS: { value: LibrarySortOption; label: string }[] = [
  { value: "recent-import-desc", label: "Recently Imported — Newest First" },
  { value: "recent-import-asc", label: "Recently Imported — Oldest First" },
  { value: "title-asc", label: "Title — A → Z" },
  { value: "title-desc", label: "Title — Z → A" },
  { value: "recent-open-desc", label: "Recently Opened — Newest First" },
  { value: "recent-open-asc", label: "Recently Opened — Oldest First" },
];

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function sortLibraryBooks<T extends SortableBook>(
  books: readonly T[],
  option: LibrarySortOption,
): T[] {
  // Attach stable import index if not already present
  const indexed = books.map((book, idx) => ({
    book,
    importIndex: book.importIndex !== undefined ? book.importIndex : idx,
  }));

  indexed.sort((a, b) => {
    switch (option) {
      case "recent-import-desc":
        return a.importIndex - b.importIndex;

      case "recent-import-asc":
        return b.importIndex - a.importIndex;

      case "title-asc": {
        const cmp = collator.compare(a.book.title, b.book.title);
        if (cmp !== 0) return cmp;
        return a.importIndex - b.importIndex;
      }

      case "title-desc": {
        const cmp = collator.compare(b.book.title, a.book.title);
        if (cmp !== 0) return cmp;
        return a.importIndex - b.importIndex;
      }

      case "recent-open-desc": {
        const aOpen = a.book.last_opened_at && a.book.last_opened_at.trim().length > 0;
        const bOpen = b.book.last_opened_at && b.book.last_opened_at.trim().length > 0;

        if (aOpen && !bOpen) return -1;
        if (!aOpen && bOpen) return 1;
        if (!aOpen && !bOpen) return a.importIndex - b.importIndex;

        // Both opened: latest first (descending timestamp)
        const cmp = (b.book.last_opened_at || "").localeCompare(a.book.last_opened_at || "");
        if (cmp !== 0) return cmp;
        return a.importIndex - b.importIndex;
      }

      case "recent-open-asc": {
        const aOpen = a.book.last_opened_at && a.book.last_opened_at.trim().length > 0;
        const bOpen = b.book.last_opened_at && b.book.last_opened_at.trim().length > 0;

        if (aOpen && !bOpen) return -1;
        if (!aOpen && bOpen) return 1;
        if (!aOpen && !bOpen) return a.importIndex - b.importIndex;

        // Both opened: earliest first (ascending timestamp)
        const cmp = (a.book.last_opened_at || "").localeCompare(b.book.last_opened_at || "");
        if (cmp !== 0) return cmp;
        return a.importIndex - b.importIndex;
      }

      default:
        return a.importIndex - b.importIndex;
    }
  });

  return indexed.map((item) => item.book);
}
