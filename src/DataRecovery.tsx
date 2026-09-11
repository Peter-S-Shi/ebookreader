import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open, confirm } from "@tauri-apps/plugin-dialog";
import { checkForUpdate, CURRENT_VERSION, REPO_NAME, REPO_OWNER, type UpdateCheckResult } from "./updateAwareness";

interface BackupManifestDTO {
  kind: "AppData" | "FullLibrary";
  created_at: string;
  book_count: number;
  files: string[];
}

interface BackupPreviewDTO {
  manifest: BackupManifestDTO;
  schema_ok: boolean;
  missing: string[];
}

interface BookSummaryDTO {
  book_id: string;
  title: string;
  path?: string;
  ownership_mode?: string;
}

interface ReadingProgressDTO {
  completed_read_count: number;
}

interface SnapshotRecord {
  timestamp: string;
  reason: string;
}

interface DataRecoveryProps {
  onOpenBookHours?: () => void;
}

/// `DESIGN.md` §14 "Data / Recovery" (canonical `ER-DATA-001`): a safety center.
/// Restore always Previews before replacement, and an incomplete archive is refused
/// rather than partially applied.
export function DataRecovery({ onOpenBookHours }: DataRecoveryProps = {}) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; data: BackupPreviewDTO } | null>(null);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [bookDataBooks, setBookDataBooks] = useState<BookSummaryDTO[] | null>(null);
  const [completedReadInputs, setCompletedReadInputs] = useState<Record<string, string>>({});
  const [referenceBooks, setReferenceBooks] = useState<BookSummaryDTO[] | null>(null);
  const [selectedReferenceFiles, setSelectedReferenceFiles] = useState<Set<string>>(new Set());

  // Real session-level recovery status tracking
  const [lastAppDataBackup, setLastAppDataBackup] = useState<{ timestamp: string; bookCount: number } | null>(null);
  const [lastFullLibraryBackup, setLastFullLibraryBackup] = useState<{ timestamp: string; bookCount: number; fileCount: number } | null>(null);
  const [recentSnapshots, setRecentSnapshots] = useState<SnapshotRecord[]>([]);

  async function createAppDataBackup() {
    const dest = await save({
      defaultPath: `ebookreader-app-data-backup.zip`,
      filters: [{ name: "EbookReader Backup", extensions: ["zip"] }],
    });
    if (!dest) return;
    try {
      const timestamp = new Date().toISOString();
      const manifest = await invoke<BackupManifestDTO>("create_app_data_backup_command", {
        destPath: dest,
        createdAt: timestamp,
      });
      setLastAppDataBackup({ timestamp: manifest.created_at, bookCount: manifest.book_count });
      setStatusMessage(`App Data Backup created: ${manifest.book_count} book(s).`);
    } catch (e) {
      setStatusMessage(`Backup failed: ${e}`);
    }
  }

  async function loadReferenceBooks() {
    const books = await invoke<BookSummaryDTO[]>("list_library_command");
    setReferenceBooks(books.filter((book) => book.ownership_mode === "reference"));
  }

  function toggleReferenceFile(path: string) {
    setSelectedReferenceFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function createFullLibraryBackup() {
    const dest = await save({
      defaultPath: `ebookreader-full-library-backup.zip`,
      filters: [{ name: "EbookReader Backup", extensions: ["zip"] }],
    });
    if (!dest) return;
    try {
      const timestamp = new Date().toISOString();
      const manifest = await invoke<BackupManifestDTO>("create_full_library_backup_command", {
        destPath: dest,
        createdAt: timestamp,
        extraReferenceFiles: Array.from(selectedReferenceFiles),
      });
      setLastFullLibraryBackup({
        timestamp: manifest.created_at,
        bookCount: manifest.book_count,
        fileCount: manifest.files.length,
      });
      setStatusMessage(`Full Library Backup created: ${manifest.book_count} book(s), ${manifest.files.length} file(s).`);
    } catch (e) {
      setStatusMessage(`Backup failed: ${e}`);
    }
  }

  async function chooseArchiveToPreview() {
    const path = await open({ multiple: false, filters: [{ name: "EbookReader Backup", extensions: ["zip"] }] });
    if (!path || Array.isArray(path)) return;
    setStatusMessage(null);
    try {
      const data = await invoke<BackupPreviewDTO>("preview_backup_command", { archivePath: path });
      setPreview({ path, data });
    } catch (e) {
      setPreview(null);
      setStatusMessage(`Could not read this archive: ${e}`);
    }
  }

  async function confirmRestore() {
    if (!preview) return;
    const proceed = await confirm(
      "Restoring will replace your current Library data with this backup's contents. " +
        "A safety snapshot of your current data is created automatically first, so this can be undone. Continue?",
      { title: "Confirm Restore", kind: "warning" },
    );
    if (!proceed) return;

    try {
      const snapshotTime = new Date().toISOString();
      await invoke("restore_backup_command", { archivePath: preview.path });
      setRecentSnapshots((prev) => [
        { timestamp: snapshotTime, reason: "Automatic snapshot before restore" },
        ...prev,
      ]);
      setStatusMessage("Restore complete. Books whose Reference source files are missing will show Needs Relink.");
      setPreview(null);
    } catch (e) {
      setStatusMessage(`Restore failed: ${e}`);
    }
  }

  async function runUpdateCheck() {
    setCheckingUpdate(true);
    const result = await checkForUpdate(CURRENT_VERSION, REPO_OWNER, REPO_NAME);
    setUpdateResult(result);
    setCheckingUpdate(false);
  }

  async function loadBookData() {
    const books = await invoke<BookSummaryDTO[]>("list_library_command");
    setBookDataBooks(books);
    setCompletedReadInputs(Object.fromEntries(books.map((book) => [book.book_id, "0"])));
  }

  async function overrideCompletedReads(book: BookSummaryDTO) {
    const completedReadCount = Number.parseInt(completedReadInputs[book.book_id] ?? "0", 10);
    const safeCount = Number.isFinite(completedReadCount) && completedReadCount >= 0 ? completedReadCount : 0;
    const proceed = await confirm(
      "Manual completed-read override clears active progress. Actual Reading Time stays unchanged. ReadingSession history stays unchanged. Continue?",
      { title: "Confirm Completed-Read Override", kind: "warning" },
    );
    if (!proceed) return;

    const snapshotTime = new Date().toISOString();
    const progress = await invoke<ReadingProgressDTO>("override_completed_reads_command", {
      bookId: book.book_id,
      completedReadCount: safeCount,
    });
    setRecentSnapshots((prev) => [
      { timestamp: snapshotTime, reason: `Before completed-read override for ${book.title}` },
      ...prev,
    ]);
    setStatusMessage(`${book.title} completed reads set to ${progress.completed_read_count}.`);
  }

  return (
    <section className="data-recovery dataWrap" aria-label="Data and Recovery">
      <div className="dataMain">
        <div className="healthHero">
          <div className="healthIcon">◈</div>
          <div>
            <h2>Data &amp; Recovery Center</h2>
            <p>Full Library safety snapshots, database backups, metadata exports, and integrity verification.</p>
          </div>
        </div>

        <div className="dataCard data-recovery-group">
          <h3>Backup &amp; Restore</h3>
          <p className="hint">
            App Data Backup: Library metadata, Notes, Excerpts, Annotations, reading history, Book Hours history, OCR
            corrections, Alignment Packages, and settings. Reference book files are not copied.
          </p>
          <div className="data-recovery-actions">
            <button type="button" className="btn" onClick={createAppDataBackup}>
              Create App Data Backup
            </button>
            <button type="button" className="btn" onClick={createFullLibraryBackup}>
              Create Full Library Backup
            </button>
            <button type="button" className="btn" onClick={loadReferenceBooks}>
              Choose Reference Files to Include…
            </button>
            <button type="button" className="btn" onClick={chooseArchiveToPreview}>
              Choose Backup to Restore…
            </button>
          </div>

          {referenceBooks && (
            <div role="region" aria-label="Reference Files to Include" className="reference-files-region">
              <p className="hint">
                Full Library Backup always includes Managed-Copy book files. Reference source files are excluded
                unless explicitly selected here (opt-in).
              </p>
              {referenceBooks.length === 0 ? (
                <p>No Reference-mode books in the Library.</p>
              ) : (
                <ul className="reference-files-list">
                  {referenceBooks.map((book) => (
                    <li key={book.book_id}>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedReferenceFiles.has(book.path!)}
                          onChange={() => toggleReferenceFile(book.path!)}
                        />
                        <span>{book.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {preview && (
            <div className="data-recovery-preview" role="region" aria-label="Backup preview">
              <b>{preview.data.manifest.kind === "AppData" ? "App Data Backup" : "Full Library Backup"}</b>
              <p>Created: {preview.data.manifest.created_at}</p>
              <p>Books: {preview.data.manifest.book_count}</p>
              {preview.data.schema_ok && preview.data.missing.length === 0 ? (
                <p className="data-recovery-ok">This archive is complete and can be restored.</p>
              ) : (
                <p className="data-recovery-warn" role="alert">
                  This archive is incomplete{preview.data.missing.length > 0 ? ` (missing: ${preview.data.missing.join(", ")})` : ""} and cannot be restored.
                </p>
              )}
              <button
                type="button"
                className="btn primary"
                onClick={confirmRestore}
                disabled={!preview.data.schema_ok || preview.data.missing.length > 0}
              >
                Restore This Backup
              </button>
            </div>
          )}

          {statusMessage && <p role="status" className="notice">{statusMessage}</p>}
        </div>

        <section className="dataCard data-recovery-group" aria-label="Book Data">
          <h3>Book Data</h3>
          <div
            className="dataRow"
            style={{
              display: "grid",
              gridTemplateColumns: "44px minmax(0, 1fr) auto",
              gap: "12px",
              alignItems: "center",
              border: "1px solid var(--border)",
              background: "var(--surface2)",
              borderRadius: "13px",
              padding: "12px",
              marginBottom: "12px",
            }}
          >
            <div
              className="rowIcon"
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                background: "var(--accentSoft)",
                color: "var(--accent)",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              BH
            </div>
            <div>
              <b style={{ display: "block", fontSize: "13px", marginBottom: "2px" }}>
                Book Hours Planning
              </b>
              <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                Plan and understand reading workload across Books, Profiles, and Collections. Book Hours are system-calculated; Reading Progress remains an independent reading fact.
              </div>
            </div>
            <button
              type="button"
              className="btn primary"
              id="openBookHours"
              onClick={onOpenBookHours}
            >
              Open
            </button>
          </div>
          <button type="button" className="btn" onClick={loadBookData}>
            Load Book Data
          </button>
          {bookDataBooks && (
            bookDataBooks.length === 0 ? (
              <p>No Books in Library.</p>
            ) : (
              <ul className="book-data-list">
                {bookDataBooks.map((book) => (
                  <li key={book.book_id} className="book-data-item">
                    <label>
                      <span>Completed reads for {book.title}</span>
                      <input
                        aria-label={`Completed reads for ${book.title}`}
                        type="number"
                        min="0"
                        step="1"
                        value={completedReadInputs[book.book_id] ?? "0"}
                        onChange={(e) =>
                          setCompletedReadInputs((current) => ({
                            ...current,
                            [book.book_id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button type="button" className="btn" onClick={() => overrideCompletedReads(book)}>
                      Set completed reads for {book.title}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>

        <div className="dataCard data-recovery-group">
          <h3>Update Awareness</h3>
          <p>Current version: {CURRENT_VERSION}</p>
          <button type="button" className="btn" onClick={runUpdateCheck} disabled={checkingUpdate}>
            {checkingUpdate ? "Checking…" : "Check Now"}
          </button>
          {updateResult && (
            <p role="status" className="notice">
              {updateResult.status === "up_to_date" && "Up To Date."}
              {updateResult.status === "check_failed" && "Check Failed. You may be offline."}
              {updateResult.status === "update_available" && (
                <>
                  Update Available: {updateResult.latestVersion}.{" "}
                  {updateResult.releaseUrl && (
                    <a href={updateResult.releaseUrl} target="_blank" rel="noreferrer">
                      Release notes
                    </a>
                  )}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <aside className="dataAside" aria-label="Recovery status">
        <div className="backupStatus">
          <h3>Recovery status</h3>
          <div className="backupMini">
            <b>Last App Data Backup</b>
            <div className="meta">
              {lastAppDataBackup ? `${lastAppDataBackup.timestamp} (${lastAppDataBackup.bookCount} books)` : "Not created yet"}
            </div>
          </div>
          <div className="backupMini">
            <b>Last Full Library Backup</b>
            <div className="meta">
              {lastFullLibraryBackup ? `${lastFullLibraryBackup.timestamp} (${lastFullLibraryBackup.bookCount} books, ${lastFullLibraryBackup.fileCount} files)` : "Not created yet"}
            </div>
          </div>
          <div className="backupMini">
            <b>Automatic Recovery Snapshot</b>
            <div className="meta">Active (created automatically before restore or destructive mutation)</div>
          </div>

          <div className="sep" />

          <h3>Recent snapshots</h3>
          <div className="snapshotTimeline">
            {recentSnapshots.length === 0 ? (
              <div className="snapshot">
                <i aria-hidden="true" />
                <div>
                  <b>Safety Baseline</b>
                  <p>Active</p>
                </div>
              </div>
            ) : (
              recentSnapshots.map((item, idx) => (
                <div key={idx} className="snapshot">
                  <i aria-hidden="true" />
                  <div>
                    <b>{item.timestamp}</b>
                    <p>{item.reason}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sep" />

          <div className="safetyNote">
            Exports are not backups. Backups are not sync. Destructive actions and manual overrides always prompt with clear warnings. Reference files remain in their original folders.
          </div>
        </div>
      </aside>
    </section>
  );
}
