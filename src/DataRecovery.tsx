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


/// `DESIGN.md` SS14 "Data / Recovery" (canonical `ER-DATA-001`): a safety
/// center. `PRODUCT_SPEC.md` SS16 "Stable V1 requires real Restore" --
/// Restore always Previews before replacement, and an incomplete
/// archive is refused rather than partially applied
/// (`crates/domain/src/backup.rs`). SS17 "Update Awareness" is a
/// read-only stable-release check against GitHub Releases
/// (`[[updateAwareness]]`), never a silent auto-install.
export function DataRecovery() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; data: BackupPreviewDTO } | null>(null);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [bookDataBooks, setBookDataBooks] = useState<BookSummaryDTO[] | null>(null);
  const [completedReadInputs, setCompletedReadInputs] = useState<Record<string, string>>({});
  // FC-C07 (`PRODUCT_SPEC.md` SS16.3: Full Library Backup may "optionally"
  // include "explicitly selected Reference source files"): the Reference-
  // mode Books available to opt in, and which paths the user has checked.
  // `null` means not loaded yet -- shown only once the user opens Full
  // Library Backup, not fetched unconditionally on mount.
  const [referenceBooks, setReferenceBooks] = useState<BookSummaryDTO[] | null>(null);
  const [selectedReferenceFiles, setSelectedReferenceFiles] = useState<Set<string>>(new Set());

  async function createAppDataBackup() {
    const dest = await save({
      defaultPath: `ebookreader-app-data-backup.zip`,
      filters: [{ name: "EbookReader Backup", extensions: ["zip"] }],
    });
    if (!dest) return;
    try {
      const manifest = await invoke<BackupManifestDTO>("create_app_data_backup_command", {
        destPath: dest,
        createdAt: new Date().toISOString(),
      });
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
      const manifest = await invoke<BackupManifestDTO>("create_full_library_backup_command", {
        destPath: dest,
        createdAt: new Date().toISOString(),
        extraReferenceFiles: Array.from(selectedReferenceFiles),
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
      await invoke("restore_backup_command", { archivePath: preview.path });
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

    const progress = await invoke<ReadingProgressDTO>("override_completed_reads_command", {
      bookId: book.book_id,
      completedReadCount: safeCount,
    });
    setStatusMessage(`${book.title} completed reads set to ${progress.completed_read_count}.`);
  }

  return (
    <section className="data-recovery" aria-label="Data and Recovery">
      <div className="data-recovery-group">
        <h3>Backup &amp; Restore</h3>
        <p className="ocr-workspace-hint">
          App Data Backup: Library metadata, Notes, Excerpts, Annotations, reading history, Book Hours history, OCR
          corrections, Alignment Packages, and settings. Reference book files are not copied.
        </p>
        <div className="data-recovery-actions">
          <button type="button" onClick={createAppDataBackup}>
            Create App Data Backup
          </button>
          <button type="button" onClick={createFullLibraryBackup}>
            Create Full Library Backup
          </button>
          <button type="button" onClick={loadReferenceBooks}>
            Choose Reference Files to Include…
          </button>
          <button type="button" onClick={chooseArchiveToPreview}>
            Choose Backup to Restore…
          </button>
        </div>

        {referenceBooks && (
          <div role="region" aria-label="Reference Files to Include">
            <p className="ocr-workspace-hint">
              Full Library Backup always includes Managed-Copy book files. Reference source files are excluded
              unless explicitly selected here (opt-in).
            </p>
            {referenceBooks.length === 0 ? (
              <p>No Reference-mode books in the Library.</p>
            ) : (
              <ul>
                {referenceBooks.map((book) => (
                  <li key={book.book_id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedReferenceFiles.has(book.path!)}
                        onChange={() => toggleReferenceFile(book.path!)}
                      />
                      {book.title}
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
              onClick={confirmRestore}
              disabled={!preview.data.schema_ok || preview.data.missing.length > 0}
            >
              Restore This Backup
            </button>
          </div>
        )}

        {statusMessage && <p role="status">{statusMessage}</p>}
      </div>

      <div className="data-recovery-group">
        <h3>Book Data</h3>
        <button type="button" onClick={loadBookData}>
          Load Book Data
        </button>
        {bookDataBooks && (
          bookDataBooks.length === 0 ? (
            <p>No Books in Library.</p>
          ) : (
            <ul>
              {bookDataBooks.map((book) => (
                <li key={book.book_id}>
                  <label>
                    Completed reads for {book.title}
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
                  <button type="button" onClick={() => overrideCompletedReads(book)}>
                    Set completed reads for {book.title}
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <div className="data-recovery-group">
        <h3>Update Awareness</h3>
        <p>Current version: {CURRENT_VERSION}</p>
        <button type="button" onClick={runUpdateCheck} disabled={checkingUpdate}>
          {checkingUpdate ? "Checking…" : "Check Now"}
        </button>
        {updateResult && (
          <p role="status">
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
    </section>
  );
}
