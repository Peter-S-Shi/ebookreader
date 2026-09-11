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
import { BookDetails } from "./BookDetails";
import { BookHoursPlanning } from "./BookHoursPlanning";
import { loadAndApplyMotionPreference, loadDefaultImportMode, loadUpdateCheckOnStartupPreference } from "./appSettings";
import { checkForUpdate, CURRENT_VERSION, REPO_NAME, REPO_OWNER, type UpdateCheckResult } from "./updateAwareness";
import { formatSearchSnippet } from "./searchUtils";
import "./App.css";

interface BookSummary {
  book_id: string;
  title: string;
  path: string;
  format: string;
  ownership_mode: string;
  available: boolean;
  last_opened_at: string | null;
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

// Mirrors `ebookreader_domain::collections::Collection`.
interface CollectionDTO {
  id: string;
  name: string;
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
  // FC-A11 (`DESIGN.md` `ER-BOOK-001` "Book Details"): a contextual
  // overlay, not a top-level destination -- reached from a Book's own
  // "Details" action, not the nav.
  const [detailsBook, setDetailsBook] = useState<BookSummary | null>(null);
  const [detailsFocusSection, setDetailsFocusSection] = useState<"organization" | "details">("details");
  const [bookHoursInitialTab, setBookHoursInitialTab] = useState<
    "overview" | "byProfile" | "byCollection" | "books" | "profiles" | "formula"
  >("overview");
  const [bookHoursInitialBookId, setBookHoursInitialBookId] = useState<string | undefined>(undefined);
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
  const [destination, setDestination] = useState<"library" | "notes" | "calendar" | "data" | "settings" | "bookHours">("library");
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
  // FC-A01 (`PRODUCT_SPEC.md` §4.3/4.4): Collections are a user-controlled
  // grouping of Books; a Book may belong to several. `collectionFilter` is
  // the Library's optional "show only this Collection" view; `null` means
  // "All".
  const [collections, setCollections] = useState<CollectionDTO[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [collectionFilterBookIds, setCollectionFilterBookIds] = useState<Set<string> | null>(null);
  const [manageCollectionsOpen, setManageCollectionsOpen] = useState(false);
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [renameCollectionDraft, setRenameCollectionDraft] = useState("");
  const [collectionToDelete, setCollectionToDelete] = useState<CollectionDTO | null>(null);

  // Library Multi-Select Mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [bulkAddToCollectionOpen, setBulkAddToCollectionOpen] = useState(false);
  const [bulkTargetCollectionId, setBulkTargetCollectionId] = useState("");
  const [bulkRemoveConfirmOpen, setBulkRemoveConfirmOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // FC-A02 (`PRODUCT_SPEC.md` SS3.4 "user-corrected metadata wins"): which
  // Book's title is currently being edited inline, and the draft value.
  const [renamingBookId, setRenamingBookId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // FC-C08 (`PRODUCT_SPEC.md` SS17: "optional automatic startup check" +
  // "check must not block the main UI"): fired once on mount, gated by
  // the user's Settings preference; the app renders immediately either
  // way, and this banner appears only if/when the check later resolves
  // to an available update (never for up-to-date/failed, to avoid
  // startup noise for the common case).
  const [startupUpdateResult, setStartupUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [startupUpdateBannerDismissed, setStartupUpdateBannerDismissed] = useState(false);

  // FC-A11 (`DESIGN.md` SS4 "Continue Reading (small, 1-3 items)"): the
  // most recently opened Books that still have an active read in
  // progress, ranked by real recorded recency (`last_opened_at`), not
  // import order. Recomputed whenever the Library list changes.
  const [continueReading, setContinueReading] = useState<{ book: BookSummary; percent: number }[]>([]);

  const refreshLibrary = useCallback(async () => {
    const result = await invoke<BookSummary[]>("list_library_command");
    setBooks(result);
  }, []);

  useEffect(() => {
    if (!books) return;
    let cancelled = false;
    const candidates = [...books]
      .filter((b) => b.last_opened_at)
      .sort((a, b) => (a.last_opened_at! < b.last_opened_at! ? 1 : a.last_opened_at! > b.last_opened_at! ? -1 : 0))
      .slice(0, 10);

    Promise.all(
      candidates.map((book) =>
        invoke<{ completed_read_count: number; active_read_in_progress: boolean; active_pass_progress: number }>(
          "get_reading_progress_command",
          { bookId: book.book_id },
        ).then((progress) => ({ book, progress })),
      ),
    ).then((results) => {
      if (cancelled) return;
      setContinueReading(
        results
          .filter((r) => r.progress.active_read_in_progress)
          .slice(0, 3)
          .map((r) => ({
            book: r.book,
            percent: r.progress.completed_read_count * 100 + r.progress.active_pass_progress,
          })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [books]);

  const refreshCollections = useCallback(async () => {
    const result = await invoke<CollectionDTO[]>("list_collections_command");
    setCollections(result);
  }, []);

  useEffect(() => {
    refreshLibrary();
    refreshCollections();
  }, [refreshLibrary, refreshCollections]);

  // FC-A09 (`DESIGN.md` SS17 "Reduced Motion"): applied here, not only
  // when Settings happens to be visited, so a persisted "Reduced" choice
  // is actually reachable/effective from the moment the app opens.
  useEffect(() => {
    loadAndApplyMotionPreference();
  }, []);

  useEffect(() => {
    loadUpdateCheckOnStartupPreference().then((enabled) => {
      if (!enabled) return;
      checkForUpdate(CURRENT_VERSION, REPO_OWNER, REPO_NAME).then((result) => {
        if (result.status === "update_available") {
          setStartupUpdateResult(result);
        }
      });
    });
  }, []);

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    await invoke("create_collection_command", { name });
    setNewCollectionName("");
    await refreshCollections();
  }

  function startRenamingCollection(col: CollectionDTO) {
    setRenamingCollectionId(col.id);
    setRenameCollectionDraft(col.name);
  }

  function cancelRenamingCollection() {
    setRenamingCollectionId(null);
    setRenameCollectionDraft("");
  }

  async function saveRenamedCollection(collectionId: string) {
    const name = renameCollectionDraft.trim();
    if (!name) return;
    await invoke("rename_collection_command", { collectionId, name });
    setRenamingCollectionId(null);
    setRenameCollectionDraft("");
    await refreshCollections();
  }

  async function applyCollectionFilter(collectionId: string | null) {
    setCollectionFilter(collectionId);
    if (collectionId === null) {
      setCollectionFilterBookIds(null);
      return;
    }
    const bookIds = await invoke<string[]>("list_book_ids_in_collection_command", { collectionId });
    setCollectionFilterBookIds(new Set(bookIds));
  }

  async function confirmDeleteCollection(collectionId: string) {
    await invoke("delete_collection_command", { collectionId });
    if (collectionFilter === collectionId) {
      setCollectionFilter(null);
      setCollectionFilterBookIds(null);
    }
    setCollectionToDelete(null);
    await refreshCollections();
  }

  // Multi-Select Helpers
  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) {
        setSelectedBookIds(new Set());
      }
      return !prev;
    });
  }

  function toggleBookSelection(bookId: string) {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }

  function selectAllBooks(visibleList: BookSummary[]) {
    setSelectedBookIds(new Set(visibleList.map((b) => b.book_id)));
  }

  function clearBookSelection() {
    setSelectedBookIds(new Set());
  }

  async function handleBulkAddToCollection() {
    if (!bulkTargetCollectionId || selectedBookIds.size === 0) return;
    setBulkError(null);
    try {
      for (const bookId of selectedBookIds) {
        await invoke("add_book_to_collection_command", {
          bookId,
          collectionId: bulkTargetCollectionId,
        });
      }
      setBulkAddToCollectionOpen(false);
      setBulkTargetCollectionId("");
      setSelectedBookIds(new Set());
      setSelectMode(false);
      await refreshLibrary();
    } catch (e) {
      setBulkError(String(e));
    }
  }

  async function handleBulkRemoveFromLibrary() {
    if (selectedBookIds.size === 0) return;
    setBulkError(null);
    try {
      for (const bookId of selectedBookIds) {
        await invoke("remove_book_command", { bookId });
      }
      setBulkRemoveConfirmOpen(false);
      setSelectedBookIds(new Set());
      setSelectMode(false);
      await refreshLibrary();
    } catch (e) {
      setBulkError(String(e));
    }
  }

  async function importBook() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Books", extensions: ["epub", "pdf", "txt"] }],
    });
    if (!path || Array.isArray(path)) {
      return;
    }
    const ownershipMode = await loadDefaultImportMode();
    const result = await invoke<ImportBookResult>("import_book_command", { path, ownershipMode });
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

  function startRenamingBook(book: BookSummary) {
    setRenamingBookId(book.book_id);
    setRenameDraft(book.title);
  }

  function cancelRenamingBook() {
    setRenamingBookId(null);
  }

  async function saveRenamedBook(bookId: string) {
    const title = renameDraft.trim();
    if (!title) return;
    await invoke("update_book_title_command", { bookId, title });
    setRenamingBookId(null);
    await refreshLibrary();
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
    try {
      const pkgs = await invoke<AlignmentPackageDTO[]>("list_alignment_packages_for_book_command", {
        bookId: book.book_id,
      });
      if (!pkgs || pkgs.length === 0) {
        setBilingualError("This Book has no imported Alignment Package pairing it with another Book yet.");
        return;
      }
      if (pkgs.length > 1) {
        setBilingualError(
          `This Book is associated with ${pkgs.length} different Alignment Packages. Please select the specific pairing in Data → Bilingual Alignments.`,
        );
        return;
      }
      const pkg = pkgs[0];
      const otherId = pkg.book_id_a === book.book_id ? pkg.book_id_b : pkg.book_id_a;
      const other = books?.find((b) => b.book_id === otherId);
      if (!other) {
        setBilingualError("The paired Book from this Alignment Package is no longer in the Library.");
        return;
      }
      setOpenBilingual({ package: pkg, bookA: book, bookB: other });
    } catch (e) {
      setBilingualError(String(e));
    }
  }

  async function openBilingualPackageDirectly(packageId: string, bookIdA: string, bookIdB: string) {
    setBilingualError(null);
    try {
      const bookA = books?.find((b) => b.book_id === bookIdA);
      const bookB = books?.find((b) => b.book_id === bookIdB);
      if (!bookA || !bookB) {
        setBilingualError("One or both paired Books from this Alignment Package are no longer in the Library.");
        return;
      }
      const pkg = await invoke<AlignmentPackageDTO | null>("get_alignment_package_by_id_command", { packageId });
      if (!pkg) {
        setBilingualError("Alignment Package could not be found.");
        return;
      }
      setOpenBilingual({ package: pkg, bookA, bookB });
    } catch (e) {
      setBilingualError(String(e));
    }
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

  if (detailsBook) {
    return (
      <BookDetails
        book={detailsBook}
        initialFocusSection={detailsFocusSection}
        onClose={() => setDetailsBook(null)}
        onRead={() => {
          openBookAtLocation(detailsBook.book_id, null);
          setDetailsBook(null);
        }}
        onOpenBilingual={() => {
          const b = books?.find((item) => item.book_id === detailsBook.book_id);
          if (b) openBilingualForBook(b);
        }}
        onManageBookHours={(bookId) => {
          setDetailsBook(null);
          setDestination("bookHours");
          setBookHoursInitialTab("books");
          setBookHoursInitialBookId(bookId);
        }}
      />
    );
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
  const destinations: { id: typeof destination; label: string; icon: string; onSelect: () => void }[] = [
    { id: "library", label: "Library", icon: "▦", onSelect: () => setDestination("library") },
    { id: "notes", label: "Notes", icon: "✎", onSelect: goToNotes },
    { id: "calendar", label: "Calendar", icon: "◫", onSelect: () => setDestination("calendar") },
    { id: "data", label: "Data", icon: "◈", onSelect: () => setDestination("data") },
    { id: "settings", label: "Settings", icon: "⚙", onSelect: () => setDestination("settings") },
  ];

  const destinationTitles: Record<typeof destination, string> = {
    library: "Library",
    notes: "Notes",
    calendar: "Calendar",
    data: "Data",
    settings: "Settings",
    bookHours: "Book Hours Planning",
  };

  return (
    <div className="app">
      <aside className="rail" aria-label="Main navigation">
        <div className="brand" aria-label="EbookReader">
          <span>ER</span>
          <h1 className="visually-hidden">EbookReader</h1>
        </div>
        <nav aria-label="Main" className="nav-group">
          {destinations.slice(0, 3).map((d) => {
            const isCurrent = destination === d.id || (d.id === "data" && destination === "bookHours");
            return (
              <button
                key={d.id}
                type="button"
                className={`nav ${isCurrent ? "active" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
                onClick={d.onSelect}
              >
                <span className="nav-icon" aria-hidden="true">{d.icon}</span>
                {d.label}
              </button>
            );
          })}
          <div className="spacer" />
          {destinations.slice(3).map((d) => {
            const isCurrent = destination === d.id || (d.id === "data" && destination === "bookHours");
            return (
              <button
                key={d.id}
                type="button"
                className={`nav ${isCurrent ? "active" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
                onClick={d.onSelect}
              >
                <span className="nav-icon" aria-hidden="true">{d.icon}</span>
                {d.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        {destination === "bookHours" ? (
          <BookHoursPlanning
            onBack={() => {
              setBookHoursInitialBookId(undefined);
              setDestination("data");
            }}
            initialTab={bookHoursInitialTab}
            initialBookId={bookHoursInitialBookId}
            onConsumeInitialBookId={() => setBookHoursInitialBookId(undefined)}
          />
        ) : (
          <>
            <header className="top">
              <div className="title">{destinationTitles[destination]}</div>
              <div className="grow" />

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
              <button type="submit" className="btn">
                Search
              </button>
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
                        <button
                          type="button"
                          onClick={() => {
                            openBookAtLocation(hit.book_id, hit.anchor);
                            setSearchResults(null);
                            setSearchQuery("");
                          }}
                        >
                          {book?.title ?? hit.book_id}
                        </button>
                        <span className="search-hit-kind"> ({hit.kind})</span>
                        <p>{formatSearchSnippet(hit.content, searchQuery)}</p>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </section>
        </header>

        <div className="content">
          {startupUpdateResult && !startupUpdateBannerDismissed && (
            <p role="status" className="startup-update-banner">
              Update Available: {startupUpdateResult.latestVersion}.{" "}
              {startupUpdateResult.releaseUrl && (
                <a href={startupUpdateResult.releaseUrl} target="_blank" rel="noreferrer">
                  Release notes
                </a>
              )}
              <button type="button" onClick={() => setStartupUpdateBannerDismissed(true)}>
                Dismiss
              </button>
            </p>
          )}

          {destination === "notes" && (
            <section aria-label="Notes" className="notes-wrap">
              <div className="section">
                <h2>Global Notes Library</h2>
                <span className="hint">Notes · Excerpts · Annotations</span>
              </div>
              <div className="notes-toolbar">
                <label className="filter-label">
                  <span>Filter</span>
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
              </div>
              <ul className="global-notes-list">
                {globalNotes.length === 0 ? (
                  <li className="empty-notes-item">No Notebook assets yet.</li>
                ) : (
                  globalNotes.map((asset) => {
                    const book = books?.find((b) => b.book_id === asset.book_id);
                    return (
                      <li key={asset.id} className="global-note-card">
                        <div className="note-card-head">
                          <button
                            type="button"
                            className="note-source-btn"
                            onClick={() => openBookAtLocation(asset.book_id, asset.anchor)}
                          >
                            {book?.title ?? asset.book_id}
                          </button>
                          <span className="search-hit-kind"> ({asset.kind})</span>
                          {asset.orphaned && <span className="notebook-asset-orphaned">Detached</span>}
                        </div>
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
          <DataRecovery
            onOpenBookHours={() => {
              setBookHoursInitialTab("overview");
              setBookHoursInitialBookId(undefined);
              setDestination("bookHours");
            }}
            onOpenBilingual={(packageId, bookIdA, bookIdB) => {
              openBilingualPackageDirectly(packageId, bookIdA, bookIdB);
            }}
          />
        </section>
      )}

      {destination === "settings" && (
        <section aria-label="Settings">
          <Settings />
        </section>
      )}

      {destination === "library" && (
        <section aria-label="Library" className="library-surface">
          <div className="library-toolbar">
            <button type="button" className="btn primary" onClick={importBook}>
              Import Book
            </button>
            <button type="button" className="btn" onClick={importAlignmentPackage}>
              Import Alignment Package
            </button>
            <button
              type="button"
              className={`btn ${selectMode ? "active" : ""}`}
              onClick={toggleSelectMode}
            >
              {selectMode ? "Exit Selection" : "Select Books"}
            </button>
          </div>

          {bilingualError && <p role="alert" className="notice warn">{bilingualError}</p>}

          {duplicateImport && (
            <div className="duplicate-import-dialog overlay open" role="dialog" aria-label="Duplicate Book">
              <div className="modal">
                <div className="modalHead">
                  <h2>This book already exists.</h2>
                </div>
                <p>{duplicateImport.title}</p>
                <div className="modalActions">
                  <button type="button" className="btn primary" onClick={openExistingDuplicate}>
                    Open Existing
                  </button>
                  <button type="button" className="btn" onClick={relinkExistingDuplicate}>
                    Relink Existing Book
                  </button>
                  <button type="button" className="btn" onClick={cancelDuplicateImport}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {continueReading.length > 0 && (
            <section aria-label="Continue Reading" className="continue-reading-section">
              <div className="section">
                <h2>Continue Reading</h2>
                <span className="hint">Pick up where you left off.</span>
              </div>
              <ul className="continue-reading-list resume-grid">
                {continueReading.map(({ book, percent }) => (
                  <li key={book.book_id} className="resume" onClick={() => setOpenBook(book)}>
                    <div className="cover" aria-hidden="true">
                      <span className="cover-format">{book.format.toUpperCase()}</span>
                    </div>
                    <div className="resume-body">
                      <h3>
                        <button
                          type="button"
                          className="resume-title-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenBook(book);
                          }}
                        >
                          {book.title}
                        </button>
                      </h3>
                      <div className="meta">
                        {book.format.toUpperCase()} · {book.ownership_mode}
                      </div>
                      <div className="bar">
                        <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                      </div>
                      <div className="meta">{percent.toFixed(0)}%</div>
                    </div>
                    <div className="resume-action" style={{ color: "var(--accent)", fontWeight: 650 }}>
                      Continue →
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Collections" className="collections-section">
            <div className="section" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0 }}>Collections</h2>
              <div className="grow" />
              <button
                type="button"
                className="btn-sm"
                onClick={() => setManageCollectionsOpen(true)}
              >
                Manage Collections
              </button>
            </div>
            <div className="tools">
              <button
                type="button"
                className={`chip ${collectionFilter === null ? "active" : ""}`}
                aria-current={collectionFilter === null ? "true" : undefined}
                onClick={() => applyCollectionFilter(null)}
              >
                All
              </button>
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className={`chip ${collectionFilter === collection.id ? "active" : ""}`}
                  aria-current={collectionFilter === collection.id ? "true" : undefined}
                  onClick={() => applyCollectionFilter(collection.id)}
                >
                  {collection.name}
                </button>
              ))}
            </div>
          </section>

          {books === null ? null : books.length === 0 ? (
            <p className="empty-state">Library is empty. Import a book to get started.</p>
          ) : (() => {
            const visibleBooks =
              collectionFilterBookIds === null
                ? books
                : books.filter((book) => collectionFilterBookIds.has(book.book_id));
            return visibleBooks.length === 0 ? (
              <p className="empty-state">No Books in this Collection.</p>
            ) : (
              <>
                <ul className="grid library-book-list">
                  {visibleBooks.map((book) => {
                    const canOpen = book.available && READABLE_FORMATS.has(book.format);
                    const isSelected = selectedBookIds.has(book.book_id);
                    return (
                      <li
                        key={book.book_id}
                        className={`book ${selectMode ? "in-select-mode" : ""} ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          if (selectMode) {
                            toggleBookSelection(book.book_id);
                          }
                        }}
                      >
                        {selectMode && (
                          <input
                            type="checkbox"
                            className="book-card-checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleBookSelection(book.book_id)}
                            aria-label={`Select ${book.title}`}
                          />
                        )}
                        <div
                          className="cover"
                          aria-hidden="true"
                          onClick={() => {
                            if (!selectMode && canOpen) {
                              setOpenBook(book);
                            }
                          }}
                        >
                          <span className="cover-format">{book.format.toUpperCase()}</span>
                        </div>
                        <div className="book-card-body">
                          {renamingBookId === book.book_id ? (
                            <span className="rename-book-form" onClick={(e) => e.stopPropagation()}>
                              <label>
                                Title
                                <input
                                  type="text"
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                />
                              </label>
                              <button type="button" className="btn-sm primary" onClick={() => saveRenamedBook(book.book_id)}>
                                Save Title
                              </button>
                              <button type="button" className="btn-sm" onClick={cancelRenamingBook}>
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <>
                              <h4 className="book-title">
                                {!selectMode && canOpen ? (
                                  <button type="button" className="book-open-link" onClick={() => setOpenBook(book)}>
                                    {book.title}
                                  </button>
                                ) : (
                                  book.title
                                )}
                              </h4>
                              <div className="small">
                                {book.format.toUpperCase()} · {book.ownership_mode}
                                {!book.available && <span className="needs-relink"> — Needs Relink</span>}
                              </div>
                              {!selectMode && (
                                <div className="book-actions">
                                  {canOpen && (
                                    <button type="button" className="btn-sm" onClick={() => openBilingualForBook(book)}>
                                      Bilingual
                                    </button>
                                  )}
                                  <button type="button" className="btn-sm" onClick={() => startRenamingBook(book)}>
                                    Edit Title
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-sm"
                                    onClick={() => {
                                      setDetailsFocusSection("details");
                                      setDetailsBook(book);
                                    }}
                                  >
                                    Details
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-sm"
                                    onClick={() => {
                                      setDetailsFocusSection("organization");
                                      setDetailsBook(book);
                                    }}
                                  >
                                    Organize
                                  </button>
                                  <button type="button" className="btn-sm danger" onClick={() => removeBook(book.book_id)}>
                                    Remove from Library
                                  </button>
                                  <button type="button" className="btn-sm danger" onClick={() => deleteReadingData(book.book_id)}>
                                    Delete Reading Data
                                  </button>
                                  {book.ownership_mode === "managed_copy" && (
                                    <button type="button" className="btn-sm danger" onClick={() => deleteManagedCopyFile(book.book_id)}>
                                      Delete Managed-Copy File
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {selectMode && (
                  <div className="bulk-action-bar" role="toolbar" aria-label="Bulk actions">
                    <span className="bulk-count">{selectedBookIds.size} selected</span>
                    <button type="button" className="btn-sm" onClick={() => selectAllBooks(visibleBooks)}>
                      Select All
                    </button>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={clearBookSelection}
                      disabled={selectedBookIds.size === 0}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn-sm primary"
                      onClick={() => setBulkAddToCollectionOpen(true)}
                      disabled={selectedBookIds.size === 0}
                    >
                      Add to Collection
                    </button>
                    <button
                      type="button"
                      className="btn-sm danger"
                      onClick={() => setBulkRemoveConfirmOpen(true)}
                      disabled={selectedBookIds.size === 0}
                    >
                      Remove from Library
                    </button>
                    <button type="button" className="btn-sm" onClick={toggleSelectMode}>
                      Exit Selection
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </section>
      )}

      {manageCollectionsOpen && (
        <div className="overlay open" role="dialog" aria-label="Manage Collections">
          <div className="modal" style={{ maxWidth: "540px" }}>
            <div className="modalHead">
              <h2>Manage Collections</h2>
              <button
                type="button"
                className="icon"
                onClick={() => {
                  setManageCollectionsOpen(false);
                  setRenamingCollectionId(null);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="hint" style={{ fontSize: "12px", margin: "0 0 14px" }}>
              Collections organize your books. Deleting a Collection only removes the grouping; Books, files, reading progress, and Book Hours are unaffected.
            </p>
            <div className="new-collection-form" style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="New collection name…"
                aria-label="New Collection"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn primary" aria-label="Create Collection" onClick={createCollection}>
                Create
              </button>
            </div>

            <div className="collections-manage-list" style={{ maxHeight: "300px", overflowY: "auto" }}>
              {collections.length === 0 ? (
                <p className="empty-state" style={{ padding: "12px" }}>No Collections created yet.</p>
              ) : (
                collections.map((col) => (
                  <div key={col.id} className="collections-manage-item">
                    {renamingCollectionId === col.id ? (
                      <div style={{ display: "flex", gap: "6px", flex: 1, alignItems: "center" }}>
                        <input
                          type="text"
                          value={renameCollectionDraft}
                          onChange={(e) => setRenameCollectionDraft(e.target.value)}
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <button type="button" className="btn-sm primary" onClick={() => saveRenamedCollection(col.id)}>
                          Save
                        </button>
                        <button type="button" className="btn-sm" onClick={cancelRenamingCollection}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontWeight: 550, fontSize: "13px" }}>{col.name}</span>
                        <button type="button" className="btn-sm" onClick={() => startRenamingCollection(col)}>
                          Rename
                        </button>
                        <button type="button" className="btn-sm danger" onClick={() => setCollectionToDelete(col)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="modalActions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setManageCollectionsOpen(false);
                  setRenamingCollectionId(null);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {collectionToDelete && (
        <div className="overlay open" role="dialog" aria-label="Delete Collection Confirmation">
          <div className="modal" style={{ maxWidth: "460px" }}>
            <div className="modalHead">
              <h2>Delete Collection</h2>
            </div>
            <p>
              Are you sure you want to delete the collection <strong>{collectionToDelete.name}</strong>?
            </p>
            <p className="hint" style={{ fontSize: "12px" }}>
              Books in this collection are not deleted. Their files, reading data, Book Hours, notes, and alignment packages remain completely untouched.
            </p>
            <div className="modalActions">
              <button type="button" className="btn danger" onClick={() => confirmDeleteCollection(collectionToDelete.id)}>
                Delete Collection
              </button>
              <button type="button" className="btn" onClick={() => setCollectionToDelete(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkAddToCollectionOpen && (
        <div className="overlay open" role="dialog" aria-label="Add Selected Books to Collection">
          <div className="modal" style={{ maxWidth: "460px" }}>
            <div className="modalHead">
              <h2>Add to Collection</h2>
            </div>
            <p>Add <strong>{selectedBookIds.size}</strong> selected Book(s) to:</p>
            <select
              value={bulkTargetCollectionId}
              onChange={(e) => setBulkTargetCollectionId(e.target.value)}
              style={{ width: "100%", padding: "8px", margin: "12px 0" }}
            >
              <option value="">Select a Collection…</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {bulkError && <p role="alert" className="notice warn">{bulkError}</p>}
            <div className="modalActions">
              <button
                type="button"
                className="btn primary"
                disabled={!bulkTargetCollectionId}
                onClick={handleBulkAddToCollection}
              >
                Add to Collection
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setBulkAddToCollectionOpen(false);
                  setBulkTargetCollectionId("");
                  setBulkError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkRemoveConfirmOpen && (
        <div className="overlay open" role="dialog" aria-label="Remove Selected Books from Library">
          <div className="modal" style={{ maxWidth: "460px" }}>
            <div className="modalHead">
              <h2>Remove from Library</h2>
            </div>
            <p>
              Remove <strong>{selectedBookIds.size}</strong> selected Book(s) from the Library?
            </p>
            <p className="hint" style={{ fontSize: "12px" }}>
              Reading data and notes are preserved, and no source files will be deleted from your disk.
            </p>
            {bulkError && <p role="alert" className="notice warn">{bulkError}</p>}
            <div className="modalActions">
              <button type="button" className="btn danger" onClick={handleBulkRemoveFromLibrary}>
                Remove from Library
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setBulkRemoveConfirmOpen(false);
                  setBulkError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {bilingualError && (
        <div className="bilingual-error-overlay" role="dialog" aria-labelledby="bilingual-error-title">
          <div className="bilingual-error-card">
            <h3 id="bilingual-error-title">Bilingual Reading Alignment Notice</h3>
            <p>{bilingualError}</p>
            <div className="bilingual-error-actions">
              <button type="button" className="btn-primary" onClick={() => setBilingualError(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        </>
      )}
    </main>
  </div>
);
}

export default App;
