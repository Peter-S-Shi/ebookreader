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

// Mirrors `document_location::DocumentLocation` (see also each Reader's
// own local copy of this same shape).
interface DocumentLocationDTO {
  book_id: string;
  format: string;
  progression_hint: number;
  primary_anchor: string;
  fallback_anchors: string[];
  context_selector: string | null;
}

interface SearchHit {
  book_id: string;
  kind: string;
  content: string;
  // FC-C01: the real source location this hit's text was captured at, if
  // one was recorded. `null` for a hit with no finer anchor than "the
  // Book itself" (e.g. a free-standing Note) -- opening the Book plain is
  // the truthful behavior for those, not a degraded jump.
  anchor: DocumentLocationDTO | null;
}

interface ReadingAssetDTO {
  id: string;
  book_id: string;
  kind: "annotation" | "excerpt" | "note";
  text: string;
  anchor: DocumentLocationDTO | null;
  orphaned: boolean;
}

// Mirrors `commands::ImportBookResult`.
type ImportBookResult =
  | { kind: "imported"; book_id: string }
  | { kind: "duplicate"; book_id: string; title: string };

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
  // FC-C01/FC-C02: the exact source location to seek to once `openBook`'s
  // Reader mounts, threaded from whichever Search hit or Notebook asset
  // was clicked. `null` when opening a Book normally (resumes its last
  // reading position instead).
  const [pendingAnchor, setPendingAnchor] = useState<DocumentLocationDTO | null>(null);
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
  // FC-A03: `import_book_command` refuses to silently resolve a fingerprint
  // that already belongs to an active Library entry (`PRODUCT_SPEC.md`
  // "Duplicate import") -- it reports the duplicate instead, and this state
  // holds what the 3-choice dialog needs to act on the user's decision.
  const [duplicateImport, setDuplicateImport] = useState<{ bookId: string; title: string; path: string } | null>(
    null,
  );

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
    const result = await invoke<ImportBookResult>("import_book_command", { path, ownershipMode: "reference" });
    if (result.kind === "duplicate") {
      setDuplicateImport({ bookId: result.book_id, title: result.title, path });
      return;
    }
    await refreshLibrary();
  }

  // FC-A03 / `PRODUCT_SPEC.md` "Duplicate import": open the already-in-Library
  // Book as-is; the just-picked file is not imported.
  function openExistingDuplicate() {
    if (!duplicateImport) return;
    openBookAtLocation(duplicateImport.bookId, null);
    setDuplicateImport(null);
  }

  // Relink the existing Book to the just-picked file's path. Their
  // fingerprints already match (that is why this dialog exists), so this
  // always succeeds via the same relink path `list_library_command`'s
  // "Needs Relink" repair uses.
  async function relinkExistingDuplicate() {
    if (!duplicateImport) return;
    await invoke("relink_book_command", { bookId: duplicateImport.bookId, candidatePath: duplicateImport.path });
    setDuplicateImport(null);
    await refreshLibrary();
  }

  function cancelDuplicateImport() {
    setDuplicateImport(null);
  }

  async function removeBook(bookId: string) {
    const confirmed = window.confirm(
      "Remove this Book from the Library? Reading data is kept, and no source file will be deleted.",
    );
    if (!confirmed) return;
    await invoke("remove_book_command", { bookId });
    await refreshLibrary();
  }

  async function deleteReadingData(bookId: string) {
    const confirmed = window.confirm(
      "Delete this Book's reading data? Notes, progress, OCR corrections, Book Hours, and alignment data for this Book will be removed. The Book file stays in place.",
    );
    if (!confirmed) return;
    await invoke("delete_reading_data_command", { bookId });
    await refreshLibrary();
  }

  async function deleteManagedCopyFile(bookId: string) {
    const confirmed = window.confirm(
      "Delete this app-managed book file? The Book will remain in the Library and may need relink/import repair. Reference source files are never deleted by this action.",
    );
    if (!confirmed) return;
    await invoke("delete_managed_copy_file_command", { bookId });
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
  async function runSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const hits = await invoke<SearchHit[]>("search_library_command", { query });
    setSearchResults(hits);
  }

  // FC-C01/FC-C02: opens the Book and, when the hit/asset carries a real
  // source anchor, tells the Reader to seek to it on mount. `anchor` is
  // `null` for a hit/asset with no finer location than "the Book itself"
  // (e.g. a free-standing Note) -- opening plain is the truthful behavior
  // there, not a degraded jump. An anchor that *is* present but fails to
  // resolve at runtime (a stale/unrecoverable location) is reported by
  // the Reader itself, which is the only place that can actually attempt
  // the seek.
  function openBookAtLocation(bookId: string, anchor: DocumentLocationDTO | null) {
    const book = books?.find((b) => b.book_id === bookId);
    if (!book || !book.available || !READABLE_FORMATS.has(book.format)) return;
    setPendingAnchor(anchor);
    setOpenBook(book);
  }

  // Global Notes (PRODUCT_SPEC.md SS11: "cross-book search; filter by
  // asset type; open source Book at the relevant location").
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
    const onBack = () => {
      setOpenBook(null);
      setPendingAnchor(null);
    };
    const props = {
      bookId: openBook.book_id,
      title: openBook.title,
      onBack,
      initialAnchor: pendingAnchor ?? undefined,
    };
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
                    <button type="button" onClick={() => openBookAtLocation(hit.book_id, hit.anchor)}>
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
                    <button type="button" onClick={() => openBookAtLocation(asset.book_id, asset.anchor)}>
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

          {duplicateImport && (
            <div className="duplicate-import-dialog" role="dialog" aria-label="Duplicate Book">
              <p>This book already exists.</p>
              <p>{duplicateImport.title}</p>
              <button type="button" onClick={openExistingDuplicate}>
                Open Existing
              </button>
              <button type="button" onClick={relinkExistingDuplicate}>
                Relink Existing Book
              </button>
              <button type="button" onClick={cancelDuplicateImport}>
                Cancel
              </button>
            </div>
          )}

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
                      Remove from Library
                    </button>
                    <button type="button" onClick={() => deleteReadingData(book.book_id)}>
                      Delete Reading Data
                    </button>
                    {book.ownership_mode === "managed_copy" && (
                      <button type="button" onClick={() => deleteManagedCopyFile(book.book_id)}>
                        Delete Managed-Copy File
                      </button>
                    )}
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
