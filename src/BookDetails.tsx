import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NotebookPanel } from "./NotebookPanel";
import type { BookHoursItemDTO } from "./BookHoursPlanning";

interface BookDetailsBook {
  book_id: string;
  title: string;
  path: string;
  format: string;
  ownership_mode: string;
  available: boolean;
}

// Mirrors `ebookreader_domain::completion::ReadingProgress`'s serialized fields.
interface ReadingProgressDTO {
  completed_read_count: number;
  active_read_in_progress: boolean;
  active_pass_progress: number;
}

function cumulativePercent(progress: ReadingProgressDTO): number {
  return (
    progress.completed_read_count * 100 +
    (progress.active_read_in_progress ? progress.active_pass_progress : 0)
  );
}

// serde's `Duration` impl serializes as `{ secs, nanos }`.
interface ActualReadingTimeDTO {
  total: { secs: number; nanos: number };
}

function formatDuration(total: ActualReadingTimeDTO["total"]): string {
  const totalMinutes = Math.round(total.secs / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

interface CollectionDTO {
  id: string;
  name: string;
}

// Backward-compat fallback DTO
interface LegacyBookHoursDTO {
  base_hours: number;
  cumulative_hours: number;
  cumulative_reading_percent: number;
}

interface BookDetailsProps {
  book: BookDetailsBook;
  onClose: () => void;
  onRead: () => void;
  onOpenBilingual?: () => void;
  initialFocusSection?: "organization" | "details";
  onManageBookHours?: (bookId: string) => void;
}

/// `DESIGN.md` `ER-BOOK-001` "Book Details" + BH-3C: "Reading/file/OCR summary
/// without admin-dashboard feel" -- reuses the v0.5/v0.6 prototype's
/// composition (Reading / Organization / Book Hours / Library & File cards + Quick
/// actions aside). Collections membership is managed here.
export function BookDetails({
  book,
  onClose,
  onRead,
  onOpenBilingual,
  initialFocusSection = "details",
  onManageBookHours,
}: BookDetailsProps) {
  const [progress, setProgress] = useState<ReadingProgressDTO | null>(null);
  const [actualTime, setActualTime] = useState<ActualReadingTimeDTO | null>(null);
  const [bookHoursItem, setBookHoursItem] = useState<BookHoursItemDTO | null>(null);
  const [legacyBookHours, setLegacyBookHours] = useState<LegacyBookHoursDTO | null>(null);
  const [allCollections, setAllCollections] = useState<CollectionDTO[]>([]);
  const [bookCollections, setBookCollections] = useState<CollectionDTO[]>([]);
  const [addToCollectionChoice, setAddToCollectionChoice] = useState("");
  const [notebookOpen, setNotebookOpen] = useState(false);

  const orgSectionRef = useRef<HTMLElement>(null);

  const loadCollections = async () => {
    try {
      const [allColls, bookColls] = await Promise.all([
        invoke<CollectionDTO[]>("list_collections_command").catch(() => []),
        invoke<CollectionDTO[]>("list_collections_for_book_command", { bookId: book.book_id }).catch(
          () => [],
        ),
      ]);
      setAllCollections(allColls || []);
      setBookCollections(bookColls || []);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<ReadingProgressDTO>("get_reading_progress_command", { bookId: book.book_id }).catch(
        () => null,
      ),
      invoke<ActualReadingTimeDTO>("get_actual_reading_time_command", { bookId: book.book_id }).catch(
        () => null,
      ),
      invoke<BookHoursItemDTO | null>("get_book_hours_item_command", { bookId: book.book_id }).catch(
        () => null,
      ),
      invoke<LegacyBookHoursDTO | null>("get_book_hours_command", { bookId: book.book_id }).catch(
        () => null,
      ),
    ]).then(([p, t, item, legacy]) => {
      if (cancelled) return;
      setProgress(p);
      setActualTime(t);
      setBookHoursItem(item);
      setLegacyBookHours(legacy);
    });

    loadCollections();

    return () => {
      cancelled = true;
    };
  }, [book.book_id]);

  useEffect(() => {
    if (initialFocusSection === "organization" && orgSectionRef.current) {
      orgSectionRef.current.scrollIntoView?.({ behavior: "smooth" });
      orgSectionRef.current.focus?.();
    }
  }, [initialFocusSection]);

  const handleAddToCollection = async (collectionId: string) => {
    if (!collectionId) return;
    try {
      await invoke("add_book_to_collection_command", {
        bookId: book.book_id,
        collectionId,
      });
      setAddToCollectionChoice("");
      await loadCollections();
    } catch (err) {
      console.error("Failed to add book to collection:", err);
    }
  };

  const handleRemoveFromCollection = async (collectionId: string) => {
    try {
      await invoke("remove_book_from_collection_command", {
        bookId: book.book_id,
        collectionId,
      });
      await loadCollections();
    } catch (err) {
      console.error("Failed to remove book from collection:", err);
    }
  };

  // Planned & Current calculations
  const plannedHours = bookHoursItem?.calculation
    ? `${bookHoursItem.calculation.planned_book_hours.toFixed(1)}h`
    : legacyBookHours
      ? `${legacyBookHours.base_hours.toFixed(1)}h`
      : null;

  const currentHours = bookHoursItem?.calculation
    ? `${bookHoursItem.calculation.current_book_hours.toFixed(1)}h`
    : legacyBookHours
      ? `${legacyBookHours.cumulative_hours.toFixed(1)}h`
      : null;

  const cumProgress = bookHoursItem
    ? `${Math.round(bookHoursItem.cumulative_percent)}%`
    : progress
      ? `${cumulativePercent(progress).toFixed(0)}%`
      : legacyBookHours
        ? `${legacyBookHours.cumulative_reading_percent.toFixed(0)}%`
        : "0%";

  return (
    <section
      className="screen active book-details-screen"
      id="details"
      role="dialog"
      aria-label="Book Details"
    >
      <div className="top">
        <button type="button" className="icon" onClick={onClose} aria-label="Back">
          ← Back
        </button>
        <div className="title">Book Details</div>
        <div className="grow" />
        <button type="button" className="primary" onClick={onRead}>
          Read
        </button>
      </div>

      <div className="content">
        <div className="detailsGrid">
          <div className="idcol">
            <div className="bigCover">{book.title}</div>
            <h1>{book.title}</h1>
            <div className="meta">{book.format.toUpperCase()} Publication</div>
            <div style={{ marginTop: "11px" }}>
              <span className="pill">{book.available ? "Text available" : "Needs Relink"}</span>
              {bookHoursItem?.profile_name && (
                <span className="pill" style={{ color: "var(--accent)" }}>
                  {bookHoursItem.profile_name}
                </span>
              )}
            </div>
          </div>

          <div>
            <section className="detailCard" aria-label="Reading">
              <h3>Reading</h3>
              {progress && (
                <div className="stats">
                  <div className="stat">
                    <span className="meta">Progress</span>
                    <b>{`${cumulativePercent(progress).toFixed(0)}%`}</b>
                  </div>
                  <div className="stat">
                    <span className="meta">Completed reads</span>
                    <b>{progress.completed_read_count}</b>
                  </div>
                  <div className="stat">
                    <span className="meta">Actual time</span>
                    <b>{actualTime ? formatDuration(actualTime.total) : "0m"}</b>
                  </div>
                </div>
              )}
            </section>

            <section
              ref={orgSectionRef}
              className="detailCard"
              id="organization"
              aria-label="Organization"
              tabIndex={-1}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0 }}>Organization</h3>
                <div className="grow" />
                <span className="hint">Collections &amp; Profile</span>
              </div>
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "6px" }}>
                  Collections (a Book may belong to several)
                </div>
                <div className="collectionManageList">
                  {bookCollections.length === 0 ? (
                    <span className="hint" style={{ fontSize: "11px" }}>
                      No Collections assigned.
                    </span>
                  ) : (
                    bookCollections.map((col) => (
                      <span key={col.id} className="collectionChipRemovable">
                        {col.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCollection(col.id)}
                          aria-label={`Remove from ${col.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <label htmlFor="detailsAddCollection" className="sr-only">
                    Add to Collection
                  </label>
                  <select
                    id="detailsAddCollection"
                    aria-label="Add to Collection"
                    value={addToCollectionChoice}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAddToCollectionChoice(val);
                      handleAddToCollection(val);
                    }}
                    style={{ height: "32px", fontSize: "11px" }}
                  >
                    <option value="">Add to Collection…</option>
                    {allCollections
                      .filter((c) => !bookCollections.some((bc) => bc.id === c.id))
                      .map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="sep" style={{ margin: "12px 0" }} />

                <div className="kv">
                  <div>Reading Profile</div>
                  <div>
                    <span className="bhBadge profile">
                      {bookHoursItem?.profile_name ?? "Default"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="detailCard" aria-label="Book Hours">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0 }}>Book Hours</h3>
                <div className="grow" />
                {onManageBookHours && (
                  <button
                    type="button"
                    className="btn"
                    id="manageBookHoursFromDetails"
                    style={{ height: "31px", fontSize: "11px" }}
                    onClick={() => onManageBookHours(book.book_id)}
                  >
                    Manage in Data
                  </button>
                )}
              </div>
              {plannedHours ? (
                <div className="kv" style={{ marginTop: "12px" }}>
                  <div>Planned Book Hours</div>
                  <div id="dBase">{plannedHours}</div>
                  <div>Cumulative progress</div>
                  <div id="dCum">{cumProgress}</div>
                  <div>Current Book Hours</div>
                  <div id="dHours">{currentHours ?? "—"}</div>
                </div>
              ) : (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ margin: 0 }}>Not configured yet.</p>
                  <span className="hint" style={{ fontSize: "11px" }}>
                    Configure quantity and unit under Data → Book Hours Planning.
                  </span>
                </div>
              )}
            </section>

            <section className="detailCard" aria-label="Library & File">
              <h3>Library &amp; File</h3>
              <div className="kv">
                <div>Ownership</div>
                <div>{book.ownership_mode === "managed_copy" ? "Managed Copy" : "Reference"}</div>
                <div>Format</div>
                <div>{book.format.toUpperCase()}</div>
                <div>Location</div>
                <div>{book.path}</div>
                <div>Status</div>
                <div>{book.available ? "Available" : "Needs Relink"}</div>
              </div>
            </section>
          </div>

          <aside className="quickCard" aria-label="Quick actions">
            <h3>Quick actions</h3>
            <button type="button" className="btn" onClick={onRead}>
              ▶ Read / Resume
            </button>
            {onOpenBilingual && (
              <button type="button" className="btn" onClick={onOpenBilingual}>
                ⇄ Open Bilingual Reading
              </button>
            )}
            <button type="button" className="btn" onClick={() => setNotebookOpen(true)}>
              ✎ Open Notebook
            </button>
          </aside>
        </div>
      </div>

      {notebookOpen && (
        <NotebookPanel
          bookId={book.book_id}
          bookTitle={book.title}
          onClose={() => setNotebookOpen(false)}
        />
      )}
    </section>
  );
}
