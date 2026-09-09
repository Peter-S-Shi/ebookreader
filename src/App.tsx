import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Reader } from "./Reader";
import { PdfReader } from "./PdfReader";
import { TxtReader } from "./TxtReader";
import { Calendar } from "./Calendar";
import { BilingualReader } from "./BilingualReader";
import { DataRecovery } from "./DataRecovery";
import { Settings } from "./Settings";
import "./App.css";

interface BookSummary {
  book_id: string;
  title: string;
  path: string;
  format: string;
  ownership_mode: string;
  available: boolean;
}

interface SearchHit {
  book_id: string;
  kind: string;
  content: string;
}

interface ReadingAssetDTO {
  id: string;
  book_id: string;
  kind: "annotation" | "excerpt" | "note";
  text: string;
  orphaned: boolean;
}

interface AlignmentPackageDTO {
  id: string;
  book_id_a: string;
  book_id_b: string;
  lang_a: string;
  lang_b: string;
  mappings: { a: number[]; b: number[] }[];
}

// Per FORMAT_CAPABILITY_MATRIX.md / ROADMAP.md M2 Exit Gate ("no active
// format exposes controls it cannot truthfully honor"): only offer to open
// a format a real renderer exists for.
const READABLE_FORMATS = new Set(["epub", "pdf", "txt"]);

function App() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [openBook, setOpenBook] = useState<BookSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  // Top-level management information architecture (`DESIGN.md`; FC-C06):
  // Library / Notes / Calendar / Data / Settings are real destinations,
  // not independently-toggled sections that can pile up on screen at
  // once. Reader/Bilingual stay contextual overlays (below), and Search
  // is a persistent topbar affordance rather than a sixth destination.
  const [destination, setDestination] = useState<"library" | "notes" | "calendar" | "data" | "settings">("library");
  const [globalNotes, setGlobalNotes] = useState<ReadingAssetDTO[]>([]);
  const [notesKindFilter, setNotesKindFilter] = useState<"" | "annotation" | "excerpt" | "note">("");
  const [openBilingual, setOpenBilingual] = useState<
    { package: AlignmentPackageDTO; bookA: BookSummary; bookB: BookSummary } | null
  >(null);
  const [bilingualError, setBilingualError] = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    const result = await invoke<BookSummary[]>("list_library_command");
    setBooks(result);
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  async function importBook() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Books", extensions: ["epub", "pdf", "txt"] }],
    });
    if (!path || Array.isArray(path)) {
      return;
    }
    await invoke("import_book_command", { path, ownershipMode: "reference" });
    await refreshLibrary();
  }

  async function removeBook(bookId: string) {
    await invoke("remove_book_command", { bookId });
    await refreshLibrary();
  }

  // Bilingual Reading (PRODUCT_SPEC.md SS14): import an externally-authored
  // Alignment Package file; the backend validates both referenced sources'
  // fingerprints against the real Library (`[[alignment]]`) rather than
  // trusting the package's own claims.
  async function importAlignmentPackage() {
    const path = await open({ multiple: false, filters: [{ name: "Alignment Package", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return;
    try {
      await invoke("import_alignment_package_command", { path });
      setBilingualError(null);
    } catch (e) {
      setBilingualError(String(e));
    }
  }

  async function openBilingualForBook(book: BookSummary) {
    setBilingualError(null);
    const pkg = await invoke<AlignmentPackageDTO | null>("get_alignment_package_command", {
      bookId: book.book_id,
    }).catch(() => null);
    if (!pkg) {
      setBilingualError("This Book has no imported Alignment Package pairing it with another Book yet.");
      return;
    }
    const otherId = pkg.book_id_a === book.book_id ? pkg.book_id_b : pkg.book_id_a;
    const other = books?.find((b) => b.book_id === otherId);
    if (!other) {
      setBilingualError("The paired Book from this Alignment Package is no longer in the Library.");
      return;
    }
    setOpenBilingual({ package: pkg, bookA: book, bookB: other });
  }

  // Library-wide Search (PRODUCT_SPEC.md SS12: "Library-wide Search").
  // Jump-to-result-location isn't available yet -- SearchHit only carries
  // (book_id, kind, content), not the asset's own anchor -- so a result
  // opens its Book rather than navigating to the exact passage; a
  // follow-up checkpoint would thread the anchor through.
  async function runSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const hits = await invoke<SearchHit[]>("search_library_command", { query });
    setSearchResults(hits);
  }

  function openSearchResultBook(bookId: string) {
    const book = books?.find((b) => b.book_id === bookId);
    if (book && book.available && READABLE_FORMATS.has(book.format)) setOpenBook(book);
  }

  // Global Notes (PRODUCT_SPEC.md SS11: "cross-book search; filter by
  // asset type; open source Book at the relevant location"). Opening at
  // the relevant location has the same anchor-plumbing gap as Search
  // above -- this opens the Book, not yet the exact passage.
  async function loadGlobalNotes(kind: "" | "annotation" | "excerpt" | "note") {
    setNotesKindFilter(kind);
    const assets = await invoke<ReadingAssetDTO[]>("list_all_reading_assets_command", {
      kind: kind || null,
    });
    setGlobalNotes(assets);
  }

  function goToNotes() {
    setDestination("notes");
    loadGlobalNotes(notesKindFilter);
  }

  if (openBilingual) {
    return (
      <BilingualReader
        package={openBilingual.package}
        bookA={{ bookId: openBilingual.bookA.book_id, title: openBilingual.bookA.title, format: openBilingual.bookA.format }}
        bookB={{ bookId: openBilingual.bookB.book_id, title: openBilingual.bookB.title, format: openBilingual.bookB.format }}
        onBack={() => setOpenBilingual(null)}
      />
    );
  }

  if (openBook) {
    const onBack = () => setOpenBook(null);
    const props = { bookId: openBook.book_id, title: openBook.title, onBack };
    switch (openBook.format) {
      case "pdf":
        return <PdfReader {...props} />;
      case "txt":
        return <TxtReader {...props} />;
      default:
        return <Reader {...props} />;
    }
  }

  // `DESIGN.md` top-level management IA (FC-C06): Library / Notes /
  // Calendar / Data / Settings are the five real destinations; each nav
  // button's own accessible name doubles as which panel is showing, so
  // there is no separate "current page" heading to keep in sync.
  const destinations: { id: typeof destination; label: string; onSelect: () => void }[] = [
    { id: "library", label: "Library", onSelect: () => setDestination("library") },
    { id: "notes", label: "Notes", onSelect: goToNotes },
    { id: "calendar", label: "Calendar", onSelect: () => setDestination("calendar") },
    { id: "data", label: "Data", onSelect: () => setDestination("data") },
    { id: "settings", label: "Settings", onSelect: () => setDestination("settings") },
  ];

  return (
    <main className="container">
      <h1>EbookReader</h1>

      {/* Search is topbar/context, not a top-level destination
          (`DESIGN.md`; FC-C06) -- it stays visible across every
          destination rather than competing with Library/Notes/etc. */}
      <section aria-label="Search" className="topbar-search">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(searchQuery);
          }}
        >
          <input
            aria-label="Search the library"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search books, Notes, Excerpts, Annotations…"
          />
          <button type="submit">Search</button>
        </form>
        {searchResults !== null && (
          <ul className="search-results">
            {searchResults.length === 0 ? (
              <li>No results.</li>
            ) : (
              searchResults.map((hit, i) => {
                const book = books?.find((b) => b.book_id === hit.book_id);
                return (
                  <li key={`${hit.book_id}-${hit.kind}-${i}`}>
                    <button type="button" onClick={() => openSearchResultBook(hit.book_id)}>
                      {book?.title ?? hit.book_id}
                    </button>
                    <span className="search-hit-kind"> ({hit.kind})</span>
                    <p>{hit.content}</p>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </section>

      <nav aria-label="Main">
        {destinations.map((d) => (
          <button
            key={d.id}
            type="button"
            aria-current={destination === d.id ? "page" : undefined}
            onClick={d.onSelect}
          >
            {d.label}
          </button>
        ))}
      </nav>

      {destination === "notes" && (
        <section aria-label="Notes">
          <label>
            Filter
            <select
              aria-label="Filter Notes by type"
              value={notesKindFilter}
              onChange={(e) => loadGlobalNotes(e.target.value as typeof notesKindFilter)}
            >
              <option value="">All</option>
              <option value="note">Note</option>
              <option value="excerpt">Excerpt</option>
              <option value="annotation">Annotation</option>
            </select>
          </label>
          <ul className="global-notes-list">
            {globalNotes.length === 0 ? (
              <li>No Notebook assets yet.</li>
            ) : (
              globalNotes.map((asset) => {
                const book = books?.find((b) => b.book_id === asset.book_id);
                return (
                  <li key={asset.id}>
                    <button type="button" onClick={() => openSearchResultBook(asset.book_id)}>
                      {book?.title ?? asset.book_id}
                    </button>
                    <span className="search-hit-kind"> ({asset.kind})</span>
                    {asset.orphaned && <span className="notebook-asset-orphaned">Detached</span>}
                    <p>{asset.text}</p>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      )}

      {destination === "calendar" && (
        <section aria-label="Calendar">
          <Calendar />
        </section>
      )}

      {destination === "data" && (
        <section aria-label="Data">
          <DataRecovery />
        </section>
      )}

      {destination === "settings" && (
        <section aria-label="Settings">
          <Settings />
        </section>
      )}

      {destination === "library" && (
        <section aria-label="Library">
          <button type="button" onClick={importBook}>
            Import Book
          </button>
          <button type="button" onClick={importAlignmentPackage}>
            Import Alignment Package
          </button>
          {bilingualError && <p role="alert">{bilingualError}</p>}

          {books === null ? null : books.length === 0 ? (
            <p>Library is empty. Import a book to get started.</p>
          ) : (
            <ul>
              {books.map((book) => {
                const canOpen = book.available && READABLE_FORMATS.has(book.format);
                return (
                  <li key={book.book_id}>
                    {canOpen ? (
                      <button type="button" onClick={() => setOpenBook(book)}>
                        {book.title}
                      </button>
                    ) : (
                      book.title
                    )}
                    {!book.available && <span> — Needs Relink</span>}
                    {canOpen && (
                      <button type="button" onClick={() => openBilingualForBook(book)}>
                        Bilingual
                      </button>
                    )}
                    <button type="button" onClick={() => removeBook(book.book_id)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
