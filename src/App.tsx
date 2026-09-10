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
import { loadAndApplyMotionPreference, loadDefaultImportMode, loadUpdateCheckOnStartupPreference } from "./appSettings";
import { checkForUpdate, CURRENT_VERSION, REPO_NAME, REPO_OWNER, type UpdateCheckResult } from "./updateAwareness";
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

// Mirrors `commands::BookHours`.
interface BookHoursDTO {
  base_hours: number;
  cumulative_hours: number;
  cumulative_reading_percent: number;
}

// Mirrors `ebookreader_domain::book_hours::WorkloadConfigRevision`.
interface WorkloadConfigRevisionDTO {
  quantity: number;
  baseline_speed: number;
  difficulty_coefficient: number;
  recorded_at: string;
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
  // FC-A01 (`PRODUCT_SPEC.md` SS4.3/4.4): Collections are a user-controlled
  // grouping of Books; a Book may belong to several. `collectionFilter` is
  // the Library's optional "show only this Collection" view; `null` means
  // "All". `organizeBookId` is which Book's inline Collections/Tags editor
  // is expanded, loaded lazily since most Books are never opened.
  const [collections, setCollections] = useState<CollectionDTO[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [collectionFilterBookIds, setCollectionFilterBookIds] = useState<Set<string> | null>(null);
  const [organizeBookId, setOrganizeBookId] = useState<string | null>(null);
  const [organizeBookCollections, setOrganizeBookCollections] = useState<CollectionDTO[]>([]);
  const [organizeBookTags, setOrganizeBookTags] = useState<string[]>([]);
  // FC-A05 (`PRODUCT_SPEC.md` SS9): Book Hours estimate + its editable
  // inputs, plus the durable revision history (SS9.3
  // "versioned/explainable"), loaded lazily alongside Collections/Tags
  // when the Organize panel opens.
  const [organizeBookHours, setOrganizeBookHours] = useState<BookHoursDTO | null>(null);
  const [organizeWorkloadRevisions, setOrganizeWorkloadRevisions] = useState<WorkloadConfigRevisionDTO[]>([]);
  const [workloadQuantity, setWorkloadQuantity] = useState("");
  const [workloadBaselineSpeed, setWorkloadBaselineSpeed] = useState("");
  const [workloadDifficultyCoefficient, setWorkloadDifficultyCoefficient] = useState("1");
  const [addToCollectionChoice, setAddToCollectionChoice] = useState("");
  const [newTagName, setNewTagName] = useState("");
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

  async function applyCollectionFilter(collectionId: string | null) {
    setCollectionFilter(collectionId);
    if (collectionId === null) {
      setCollectionFilterBookIds(null);
      return;
    }
    const bookIds = await invoke<string[]>("list_book_ids_in_collection_command", { collectionId });
    setCollectionFilterBookIds(new Set(bookIds));
  }

  async function deleteCollection(collectionId: string) {
    const confirmed = window.confirm("Delete this Collection? Its Books are not affected -- only the grouping is removed.");
    if (!confirmed) return;
    await invoke("delete_collection_command", { collectionId });
    if (collectionFilter === collectionId) {
      setCollectionFilter(null);
      setCollectionFilterBookIds(null);
    }
    await refreshCollections();
  }

  async function toggleOrganizePanel(bookId: string) {
    if (organizeBookId === bookId) {
      setOrganizeBookId(null);
      return;
    }
    setOrganizeBookId(bookId);
    setAddToCollectionChoice("");
    setNewTagName("");
    const [bookCollections, bookTags, bookHours, revisions] = await Promise.all([
      invoke<CollectionDTO[]>("list_collections_for_book_command", { bookId }),
      invoke<string[]>("list_tags_for_book_command", { bookId }),
      invoke<BookHoursDTO | null>("get_book_hours_command", { bookId }),
      invoke<WorkloadConfigRevisionDTO[]>("list_workload_config_revisions_command", { bookId }),
    ]);
    setOrganizeBookCollections(bookCollections);
    setOrganizeBookTags(bookTags);
    setOrganizeBookHours(bookHours);
    setOrganizeWorkloadRevisions(revisions);
    const latest = revisions[0];
    setWorkloadQuantity(latest ? String(latest.quantity) : "");
    setWorkloadBaselineSpeed(latest ? String(latest.baseline_speed) : "");
    setWorkloadDifficultyCoefficient(latest ? String(latest.difficulty_coefficient) : "1");
  }

  async function saveWorkloadConfig(bookId: string) {
    const quantity = Number.parseFloat(workloadQuantity);
    const baselineSpeed = Number.parseFloat(workloadBaselineSpeed);
    const difficultyCoefficient = Number.parseFloat(workloadDifficultyCoefficient);
    if (!Number.isFinite(quantity) || !Number.isFinite(baselineSpeed) || !Number.isFinite(difficultyCoefficient)) return;

    await invoke("save_workload_config_command", {
      bookId,
      quantity,
      baselineSpeed,
      difficultyCoefficient,
      recordedAt: new Date().toISOString(),
    });
    const [bookHours, revisions] = await Promise.all([
      invoke<BookHoursDTO | null>("get_book_hours_command", { bookId }),
      invoke<WorkloadConfigRevisionDTO[]>("list_workload_config_revisions_command", { bookId }),
    ]);
    setOrganizeBookHours(bookHours);
    setOrganizeWorkloadRevisions(revisions);
  }

  async function addBookToCollection(bookId: string, collectionId: string) {
    if (!collectionId) return;
    await invoke("add_book_to_collection_command", { bookId, collectionId });
    setOrganizeBookCollections(await invoke<CollectionDTO[]>("list_collections_for_book_command", { bookId }));
    setAddToCollectionChoice("");
    if (collectionFilter) await applyCollectionFilter(collectionFilter);
  }

  async function removeBookFromCollection(bookId: string, collectionId: string) {
    await invoke("remove_book_from_collection_command", { bookId, collectionId });
    setOrganizeBookCollections(await invoke<CollectionDTO[]>("list_collections_for_book_command", { bookId }));
    if (collectionFilter) await applyCollectionFilter(collectionFilter);
  }

  async function addTagToBook(bookId: string) {
    const tagName = newTagName.trim();
    if (!tagName) return;
    await invoke("add_tag_to_book_command", { bookId, tagName });
    setNewTagName("");
    setOrganizeBookTags(await invoke<string[]>("list_tags_for_book_command", { bookId }));
  }

  async function removeTagFromBook(bookId: string, tagName: string) {
    await invoke("remove_tag_from_book_command", { bookId, tagName });
    setOrganizeBookTags(await invoke<string[]>("list_tags_for_book_command", { bookId }));
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

  if (detailsBook) {
    return (
      <BookDetails
        book={detailsBook}
        onClose={() => setDetailsBook(null)}
        onRead={() => {
          openBookAtLocation(detailsBook.book_id, null);
          setDetailsBook(null);
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

          {continueReading.length > 0 && (
            <section aria-label="Continue Reading">
              <h2>Continue Reading</h2>
              <ul className="continue-reading-list">
                {continueReading.map(({ book, percent }) => (
                  <li key={book.book_id}>
                    <button type="button" onClick={() => setOpenBook(book)}>
                      {book.title}
                    </button>
                    <span className="meta"> — {percent.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Collections">
            <label>
              New Collection
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
              />
            </label>
            <button type="button" onClick={createCollection}>
              Create Collection
            </button>
            <ul className="collection-filter-list">
              <li>
                <button
                  type="button"
                  aria-current={collectionFilter === null ? "true" : undefined}
                  onClick={() => applyCollectionFilter(null)}
                >
                  All
                </button>
              </li>
              {collections.map((collection) => (
                <li key={collection.id}>
                  <button
                    type="button"
                    aria-current={collectionFilter === collection.id ? "true" : undefined}
                    onClick={() => applyCollectionFilter(collection.id)}
                  >
                    {collection.name}
                  </button>
                  <button type="button" onClick={() => deleteCollection(collection.id)}>
                    Delete Collection
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {books === null ? null : books.length === 0 ? (
            <p>Library is empty. Import a book to get started.</p>
          ) : (() => {
            const visibleBooks =
              collectionFilterBookIds === null
                ? books
                : books.filter((book) => collectionFilterBookIds.has(book.book_id));
            return visibleBooks.length === 0 ? (
              <p>No Books in this Collection.</p>
            ) : (
              <ul className="library-book-list">
                {visibleBooks.map((book) => {
                  const canOpen = book.available && READABLE_FORMATS.has(book.format);
                  return (
                    <li key={book.book_id}>
                      {renamingBookId === book.book_id ? (
                        <span className="rename-book-form">
                          <label>
                            Title
                            <input
                              type="text"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                            />
                          </label>
                          <button type="button" onClick={() => saveRenamedBook(book.book_id)}>
                            Save Title
                          </button>
                          <button type="button" onClick={cancelRenamingBook}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <>
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
                          <button type="button" onClick={() => startRenamingBook(book)}>
                            Edit Title
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => setDetailsBook(book)}>
                        Details
                      </button>
                      <button type="button" onClick={() => toggleOrganizePanel(book.book_id)}>
                        Organize
                      </button>
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
                      {organizeBookId === book.book_id && (
                        <div className="organize-panel" role="region" aria-label={`Organize ${book.title}`}>
                          <div>
                            <span>Collections: </span>
                            {organizeBookCollections.length === 0 ? (
                              <span>None</span>
                            ) : (
                              organizeBookCollections.map((collection) => (
                                <span key={collection.id} className="collection-chip">
                                  {collection.name}
                                  <button
                                    type="button"
                                    onClick={() => removeBookFromCollection(book.book_id, collection.id)}
                                  >
                                    Remove
                                  </button>
                                </span>
                              ))
                            )}
                            <label>
                              Add to Collection
                              <select
                                value={addToCollectionChoice}
                                onChange={(e) => {
                                  setAddToCollectionChoice(e.target.value);
                                  addBookToCollection(book.book_id, e.target.value);
                                }}
                              >
                                <option value="">Choose a Collection…</option>
                                {collections.map((collection) => (
                                  <option key={collection.id} value={collection.id}>
                                    {collection.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div>
                            <span>Tags: </span>
                            {organizeBookTags.length === 0 ? (
                              <span>None</span>
                            ) : (
                              organizeBookTags.map((tag) => (
                                <span key={tag} className="tag-chip">
                                  {tag}
                                  <button type="button" onClick={() => removeTagFromBook(book.book_id, tag)}>
                                    Remove
                                  </button>
                                </span>
                              ))
                            )}
                            <label>
                              New Tag
                              <input
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                              />
                            </label>
                            <button type="button" onClick={() => addTagToBook(book.book_id)}>
                              Add Tag
                            </button>
                          </div>
                          <div role="region" aria-label={`Book Hours for ${book.title}`}>
                            <span>Book Hours: </span>
                            {organizeBookHours ? (
                              <span>
                                Base {organizeBookHours.base_hours.toFixed(1)}h, Cumulative{" "}
                                {organizeBookHours.cumulative_hours.toFixed(1)}h (
                                {organizeBookHours.cumulative_reading_percent.toFixed(0)}% cumulative reading)
                              </span>
                            ) : (
                              <span>Not configured yet.</span>
                            )}
                            <label>
                              Quantity
                              <input
                                type="number"
                                value={workloadQuantity}
                                onChange={(e) => setWorkloadQuantity(e.target.value)}
                              />
                            </label>
                            <label>
                              Baseline Speed
                              <input
                                type="number"
                                value={workloadBaselineSpeed}
                                onChange={(e) => setWorkloadBaselineSpeed(e.target.value)}
                              />
                            </label>
                            <label>
                              Difficulty Coefficient
                              <input
                                type="number"
                                value={workloadDifficultyCoefficient}
                                onChange={(e) => setWorkloadDifficultyCoefficient(e.target.value)}
                              />
                            </label>
                            <button type="button" onClick={() => saveWorkloadConfig(book.book_id)}>
                              Save Book Hours Config
                            </button>
                            {organizeWorkloadRevisions.length > 0 && (
                              <ul className="workload-revision-history">
                                {organizeWorkloadRevisions.map((revision, index) => (
                                  <li key={index}>
                                    {revision.recorded_at}: Quantity {revision.quantity}, Speed{" "}
                                    {revision.baseline_speed}, Difficulty {revision.difficulty_coefficient}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </section>
      )}
    </main>
  );
}

export default App;
