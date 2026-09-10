import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NotebookPanel } from "./NotebookPanel";

interface BookDetailsBook {
  book_id: string;
  title: string;
  path: string;
  format: string;
  ownership_mode: string;
  available: boolean;
}

// Mirrors `ebookreader_domain::completion::ReadingProgress`'s serialized
// fields. `cumulative_percent()` is a computed method, not a field, so
// it is recomputed here from the same SS8.3 formula rather than
// duplicating a second source of truth on the Rust side.
interface ReadingProgressDTO {
  completed_read_count: number;
  active_read_in_progress: boolean;
  active_pass_progress: number;
}

function cumulativePercent(progress: ReadingProgressDTO): number {
  return progress.completed_read_count * 100 + (progress.active_read_in_progress ? progress.active_pass_progress : 0);
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

interface BookHoursDTO {
  base_hours: number;
  cumulative_hours: number;
  cumulative_reading_percent: number;
}

interface BookDetailsProps {
  book: BookDetailsBook;
  onClose: () => void;
  onRead: () => void;
}

/// `DESIGN.md` `ER-BOOK-001` "Book Details": "Reading/file/OCR summary
/// without admin-dashboard feel" -- reuses the v0.5 prototype's
/// composition (Reading / Book Hours / Library & File cards + a Quick
/// actions aside) rather than inventing a new layout. FC-A11: this is
/// the first place Book Hours and Actual Reading Time are actually
/// presented to the user (both commands already existed; nothing called
/// them from the UI).
export function BookDetails({ book, onClose, onRead }: BookDetailsProps) {
  const [progress, setProgress] = useState<ReadingProgressDTO | null>(null);
  const [actualTime, setActualTime] = useState<ActualReadingTimeDTO | null>(null);
  const [bookHours, setBookHours] = useState<BookHoursDTO | null>(null);
  const [notebookOpen, setNotebookOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<ReadingProgressDTO>("get_reading_progress_command", { bookId: book.book_id }),
      invoke<ActualReadingTimeDTO>("get_actual_reading_time_command", { bookId: book.book_id }),
      invoke<BookHoursDTO | null>("get_book_hours_command", { bookId: book.book_id }),
    ]).then(([p, t, h]) => {
      if (cancelled) return;
      setProgress(p);
      setActualTime(t);
      setBookHours(h);
    });
    return () => {
      cancelled = true;
    };
  }, [book.book_id]);

  return (
    <div className="book-details" role="dialog" aria-label="Book Details">
      <div className="book-details-top">
        <button type="button" onClick={onClose}>
          ← Back
        </button>
        <h1>{book.title}</h1>
        <button type="button" onClick={onRead}>
          Read
        </button>
      </div>

      <div className="book-details-grid">
        <div>
          <section className="detail-card" aria-label="Reading">
            <h3>Reading</h3>
            {progress && (
              <div className="stats">
                <div>
                  <span>Progress</span>
                  <b>{`${cumulativePercent(progress).toFixed(0)}%`}</b>
                </div>
                <div>
                  <span>Completed reads</span>
                  <b>{progress.completed_read_count}</b>
                </div>
                <div>
                  <span>Actual time</span>
                  <b>{actualTime ? formatDuration(actualTime.total) : "0m"}</b>
                </div>
              </div>
            )}
          </section>

          <section className="detail-card" aria-label="Book Hours">
            <h3>Book Hours</h3>
            {bookHours ? (
              <div className="kv">
                <div>Base estimate</div>
                <div>{`${bookHours.base_hours.toFixed(1)}h`}</div>
                <div>Cumulative progress</div>
                <div>{`${bookHours.cumulative_reading_percent.toFixed(0)}%`}</div>
                <div>Current Book Hours</div>
                <div>{`${bookHours.cumulative_hours.toFixed(1)}h`}</div>
              </div>
            ) : (
              <p>Not configured yet.</p>
            )}
          </section>

          <section className="detail-card" aria-label="Library & File">
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

        <aside className="book-details-quick-actions" aria-label="Quick actions">
          <h3>Quick actions</h3>
          <button type="button" onClick={onRead}>
            ▶ Read / Resume
          </button>
          <button type="button" onClick={() => setNotebookOpen(true)}>
            ✎ Open Notebook
          </button>
        </aside>
      </div>

      {notebookOpen && (
        <NotebookPanel bookId={book.book_id} bookTitle={book.title} onClose={() => setNotebookOpen(false)} />
      )}
    </div>
  );
}
