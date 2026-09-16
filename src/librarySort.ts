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

const enCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

const zhCollator = new Intl.Collator("zh-CN-u-co-pinyin", {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

const fallbackCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

/**
 * Normalizes a title for comparison by ignoring leading/trailing whitespace
 * and common decorative/book-title punctuation (e.g. 《》, “”, "", brackets).
 */
export function normalizeTitle(title: string): string {
  if (!title) return "";
  const stripped = title
    .replace(/^[\s\u3000\p{P}\p{S}]+/u, "")
    .replace(/[\s\u3000\p{P}\p{S}]+$/u, "");
  return stripped.length > 0 ? stripped : title.trim();
}

/**
 * Categorizes a normalized title by its first meaningful character:
 * Group 0: Numeric
 * Group 1: Latin letters
 * Group 2: CJK / Chinese
 * Group 3: Other scripts / Fallback
 */
export function getTitleGroup(normalizedTitle: string): number {
  if (!normalizedTitle) return 3;
  const firstChar = normalizedTitle.codePointAt(0);
  if (firstChar === undefined) return 3;
  const charStr = String.fromCodePoint(firstChar);

  if (/^[0-9]$/.test(charStr)) return 0;
  if (/^[a-zA-Z]$/.test(charStr)) return 1;
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Bopomofo}/u.test(charStr)) {
    return 2;
  }
  return 3;
}

/**
 * Compares two titles using group ordering (numeric -> Latin -> CJK -> fallback)
 * and locale-specific natural/pinyin collation.
 */
function compareTitles(titleA: string, titleB: string): number {
  const normA = normalizeTitle(titleA);
  const normB = normalizeTitle(titleB);

  const groupA = getTitleGroup(normA);
  const groupB = getTitleGroup(normB);

  if (groupA !== groupB) {
    return groupA - groupB;
  }

  let cmp = 0;
  if (groupA === 0 || groupA === 1) {
    cmp = enCollator.compare(normA, normB);
  } else if (groupA === 2) {
    cmp = zhCollator.compare(normA, normB);
  } else {
    cmp = fallbackCollator.compare(normA, normB);
  }

  if (cmp !== 0) return cmp;
  return fallbackCollator.compare(titleA, titleB);
}

export function sortLibraryBooks<T extends SortableBook>(
  books: readonly T[],
  option: LibrarySortOption,
): T[] {
  // Attach stable import index if not already present
  const indexed = books.map((book, idx) => ({
    book,
    importIndex: book.importIndex !== undefined ? book.importIndex : idx,
  }));

  if (option === "title-desc") {
    const ascSorted = sortLibraryBooks(books, "title-asc");
    return [...ascSorted].reverse();
  }

  indexed.sort((a, b) => {
    switch (option) {
      case "recent-import-desc":
        return a.importIndex - b.importIndex;

      case "recent-import-asc":
        return b.importIndex - a.importIndex;

      case "title-asc": {
        const cmp = compareTitles(a.book.title, b.book.title);
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
