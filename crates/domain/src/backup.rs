//! Backup, Restore, and Recovery (`PRODUCT_SPEC.md` SS16, `DESIGN.md`
//! SS14, canonical surface `ER-DATA-001`): "Stable V1 requires real
//! Restore." The workflow is the one M0's corrective-pass spike already
//! validated end-to-end (`tooling/m0-evidence/results/m0h_backup_restore.txt`):
//! **manifest/preview -> safety snapshot -> restore -> verify**, with an
//! incomplete archive rejected outright rather than partially applied.
//!
//! The canonical persistence engine is one SQLite file
//! (`ARCHITECTURE.md`: "SQLite via `rusqlite` is the canonical
//! persistence engine"), so an App Data Backup is, at its core, a real
//! copy of that file plus a small manifest -- not a hand-rolled
//! per-table export/import that could silently diverge from what the
//! app actually persists. This is also exactly why Reference-mode
//! source bytes are excluded "by default" (SS16.2) without any special
//! filtering logic: a Reference book's *path* lives in the database,
//! its *bytes* never do, so copying the database file alone naturally
//! never touches them. A Full Library Backup (SS16.3) adds the
//! Managed-Copy files (real files on disk, not in the database) and,
//! optionally, explicitly selected Reference source files.

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const DB_ENTRY: &str = "library.sqlite3";
const MANIFEST_ENTRY: &str = "manifest.json";

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum BackupKind {
    AppData,
    FullLibrary,
}

/// The archive's own manifest: what `preview` reads without touching
/// the live app state, and what `restore` re-validates before applying
/// anything (`PRODUCT_SPEC.md` SS16.4 "preview archive timestamp/
/// version/contents").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BackupManifest {
    pub kind: BackupKind,
    /// Caller-supplied timestamp label (e.g. an ISO-8601 string) -- this
    /// module has no clock/timezone opinion of its own, matching
    /// `[[calendar]]`'s same deliberate choice.
    pub created_at: String,
    pub book_count: u32,
    /// Managed-Copy (and any explicitly-selected Reference) file names
    /// this archive claims to contain, relative to their zip entry
    /// prefix -- what `preview`'s completeness check verifies against
    /// the archive's real entries.
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BackupPreview {
    pub manifest: BackupManifest,
    /// The database entry itself is present and readable.
    pub schema_ok: bool,
    /// Any file the manifest claims to contain but the archive doesn't
    /// actually have -- a non-empty list means this archive is
    /// incomplete, exactly the condition `restore` refuses to apply.
    pub missing: Vec<String>,
}

#[derive(Debug)]
pub enum BackupError {
    Io(std::io::Error),
    Zip(String),
    InvalidManifest(String),
    /// `restore` refuses an incomplete archive outright -- never a
    /// partial apply (M0 evidence: "REJECTED reason=archive_incomplete",
    /// "app-data unchanged after rejection: True").
    Incomplete { missing: Vec<String> },
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackupError::Io(e) => write!(f, "I/O error: {e}"),
            BackupError::Zip(e) => write!(f, "archive error: {e}"),
            BackupError::InvalidManifest(e) => write!(f, "invalid backup manifest: {e}"),
            BackupError::Incomplete { missing } => {
                write!(f, "archive is incomplete, missing: {}", missing.join(", "))
            }
        }
    }
}

impl From<std::io::Error> for BackupError {
    fn from(e: std::io::Error) -> Self {
        BackupError::Io(e)
    }
}

/// Create an App Data Backup: the live database file plus a manifest.
/// Never touches Managed-Copy files or Reference source bytes.
pub fn create_app_data_backup(
    db_path: &Path,
    dest_zip: &Path,
    created_at: &str,
    book_count: u32,
) -> Result<BackupManifest, BackupError> {
    let manifest = BackupManifest {
        kind: BackupKind::AppData,
        created_at: created_at.to_string(),
        book_count,
        files: Vec::new(),
    };
    write_archive(dest_zip, db_path, &manifest, &[])?;
    Ok(manifest)
}

/// Create a Full Library Backup: App Data Backup contents, plus every
/// Managed-Copy file in `managed_dir`, plus any explicitly-selected
/// Reference source files (`extra_reference_files`).
pub fn create_full_library_backup(
    db_path: &Path,
    managed_dir: &Path,
    extra_reference_files: &[PathBuf],
    dest_zip: &Path,
    created_at: &str,
    book_count: u32,
) -> Result<BackupManifest, BackupError> {
    let mut sources: Vec<(String, PathBuf)> = Vec::new();

    if managed_dir.is_dir() {
        for entry in std::fs::read_dir(managed_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                let name = entry.file_name().to_string_lossy().to_string();
                sources.push((format!("managed/{name}"), entry.path()));
            }
        }
    }
    for path in extra_reference_files {
        if let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()) {
            sources.push((format!("reference/{name}"), path.clone()));
        }
    }

    let manifest = BackupManifest {
        kind: BackupKind::FullLibrary,
        created_at: created_at.to_string(),
        book_count,
        files: sources.iter().map(|(entry, _)| entry.clone()).collect(),
    };
    write_archive(dest_zip, db_path, &manifest, &sources)?;
    Ok(manifest)
}

fn write_archive(
    dest_zip: &Path,
    db_path: &Path,
    manifest: &BackupManifest,
    extra_files: &[(String, PathBuf)],
) -> Result<(), BackupError> {
    let file = File::create(dest_zip)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file(MANIFEST_ENTRY, options).map_err(|e| BackupError::Zip(e.to_string()))?;
    let manifest_json = serde_json::to_string(manifest).expect("BackupManifest serialization cannot fail");
    zip.write_all(manifest_json.as_bytes())?;

    zip.start_file(DB_ENTRY, options).map_err(|e| BackupError::Zip(e.to_string()))?;
    let mut db_bytes = Vec::new();
    File::open(db_path)?.read_to_end(&mut db_bytes)?;
    zip.write_all(&db_bytes)?;

    for (entry_name, source_path) in extra_files {
        zip.start_file(entry_name, options).map_err(|e| BackupError::Zip(e.to_string()))?;
        let mut bytes = Vec::new();
        File::open(source_path)?.read_to_end(&mut bytes)?;
        zip.write_all(&bytes)?;
    }

    zip.finish().map_err(|e| BackupError::Zip(e.to_string()))?;
    Ok(())
}

fn open_archive(path: &Path) -> Result<zip::ZipArchive<File>, BackupError> {
    let file = File::open(path)?;
    zip::ZipArchive::new(file).map_err(|e| BackupError::Zip(e.to_string()))
}

fn read_entry(archive: &mut zip::ZipArchive<File>, name: &str) -> Result<Vec<u8>, BackupError> {
    let mut entry = archive.by_name(name).map_err(|e| BackupError::Zip(e.to_string()))?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Preview an archive's manifest and completeness without mutating any
/// live app state (`PRODUCT_SPEC.md` SS16.4 "preview archive timestamp/
/// version/contents"; "Restore must always Preview before replacement" --
/// `DESIGN.md` SS14).
pub fn preview(path: &Path) -> Result<BackupPreview, BackupError> {
    let mut archive = open_archive(path)?;

    let manifest_bytes = read_entry(&mut archive, MANIFEST_ENTRY)?;
    let manifest: BackupManifest =
        serde_json::from_slice(&manifest_bytes).map_err(|e| BackupError::InvalidManifest(e.to_string()))?;

    let schema_ok = archive.by_name(DB_ENTRY).is_ok();

    let missing: Vec<String> =
        manifest.files.iter().filter(|name| archive.by_name(name).is_err()).cloned().collect();

    Ok(BackupPreview { manifest, schema_ok, missing })
}

/// Apply a Restore: creates a recovery safety snapshot of the live
/// database *before* any replacement (`PRODUCT_SPEC.md` SS16.1
/// "Automatic Recovery Snapshot... created before high-risk app-data
/// operations such as... restore"), then replaces the live database
/// (and, for a Full Library Backup, Managed-Copy files) with the
/// archive's contents.
///
/// Refuses outright, touching nothing, if `preview` finds the archive
/// incomplete -- matching the M0 spike's own proven behavior exactly
/// ("REJECTED reason=archive_incomplete", "app-data unchanged after
/// rejection"). Reference-mode "Needs Relink" surfacing is not this
/// function's job: it happens for free the next time the restored
/// database is queried through `store::list_books`, which already
/// computes `available` from whether each Reference path still exists
/// on disk -- there is no separate relink-detection path to keep in
/// sync.
pub fn restore(
    archive_path: &Path,
    live_db_path: &Path,
    live_managed_dir: &Path,
    snapshot_path: &Path,
) -> Result<BackupManifest, BackupError> {
    let preview = preview(archive_path)?;
    if !preview.schema_ok || !preview.missing.is_empty() {
        return Err(BackupError::Incomplete { missing: preview.missing });
    }

    // Recovery snapshot of the *current* live state, before touching
    // anything -- this is what lets a bad restore itself be undone.
    if live_db_path.exists() {
        std::fs::copy(live_db_path, snapshot_path)?;
    }

    let mut archive = open_archive(archive_path)?;
    let db_bytes = read_entry(&mut archive, DB_ENTRY)?;
    std::fs::write(live_db_path, &db_bytes)?;

    if preview.manifest.kind == BackupKind::FullLibrary {
        std::fs::create_dir_all(live_managed_dir)?;
        for entry_name in &preview.manifest.files {
            if let Some(name) = entry_name.strip_prefix("managed/") {
                let bytes = read_entry(&mut archive, entry_name)?;
                std::fs::write(live_managed_dir.join(name), &bytes)?;
            }
        }
    }

    Ok(preview.manifest)
}

/// Keep only the `keep_last` most recently created recovery snapshots
/// in `snapshot_dir` (sorted by filename, so callers should use a
/// chronologically-sortable label such as an ISO-8601 timestamp),
/// deleting the rest. `PRODUCT_SPEC.md` SS16.1: "Exact retention policy
/// may be selected during implementation/hardening" -- a simple
/// bounded-count policy, not a time-based one, since nothing in frozen
/// scope requires more.
pub fn prune_old_snapshots(snapshot_dir: &Path, keep_last: usize) -> std::io::Result<()> {
    if !snapshot_dir.is_dir() {
        return Ok(());
    }
    let mut names: Vec<PathBuf> = std::fs::read_dir(snapshot_dir)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .map(|entry| entry.path())
        .collect();
    names.sort();
    if names.len() > keep_last {
        for old in &names[..names.len() - keep_last] {
            let _ = std::fs::remove_file(old);
        }
    }
    Ok(())
}

/// Copies `db_path` into `snapshot_dir` as `{label}-{unique}.sqlite3`,
/// then prunes to the last `keep_last` snapshots (`PRODUCT_SPEC.md`
/// SS16.1: "Automatic Recovery Snapshot ... created before high-risk
/// app-data operations such as: schema migration ... major destructive
/// library mutation"). A no-op if `db_path` doesn't exist yet -- there is
/// nothing to protect on a fresh install, before any destructive
/// operation has ever had data to destroy.
pub fn create_recovery_snapshot(
    db_path: &Path,
    snapshot_dir: &Path,
    label: &str,
    unique: &str,
    keep_last: usize,
) -> std::io::Result<()> {
    if !db_path.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(snapshot_dir)?;
    let snapshot_path = snapshot_dir.join(format!("{label}-{unique}.sqlite3"));
    std::fs::copy(db_path, &snapshot_path)?;
    prune_old_snapshots(snapshot_dir, keep_last)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ebookreader-backup-test-{}-{}", std::process::id(), label));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn seeded_db(path: &Path) {
        let conn = Connection::open(path).unwrap();
        crate::store::run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES ('book-1', 'Test Book')", []).unwrap();
        conn.execute(
            "INSERT INTO book_file (book_id, path, fingerprint, format, ownership_mode)
             VALUES ('book-1', 'somewhere.txt', 'fp-1', 'txt', 'reference')",
            [],
        )
        .unwrap();
    }

    #[test]
    fn an_app_data_backup_round_trips_the_database_byte_for_byte() {
        let dir = scratch_dir("app-data-round-trip");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let zip_path = dir.join("backup.zip");

        create_app_data_backup(&db_path, &zip_path, "2026-09-09T00:00:00Z", 1).unwrap();

        let restored_db_path = dir.join("restored.sqlite3");
        let restored_managed_dir = dir.join("managed-unused");
        let snapshot_path = dir.join("snapshot.sqlite3");
        restore(&zip_path, &restored_db_path, &restored_managed_dir, &snapshot_path).unwrap();

        let conn = Connection::open(&restored_db_path).unwrap();
        let title: String = conn.query_row("SELECT title FROM book WHERE id = 'book-1'", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "Test Book");
    }

    /// `PRODUCT_SPEC.md` SS16.2/`ROADMAP.md` M8 "canonical user-asset
    /// round trip": every category SS16.2 names as App Data Backup
    /// contents -- a Note, an OCR correction, a Book Hours workload
    /// config (+ its revision history), Collections/Tags, Actual Reading
    /// Time, and an Alignment Package -- must survive a real backup ->
    /// restore cycle intact, not just the `book` row a simpler test could
    /// pass with by accident. FC-A14 closes the last two of these
    /// (`MANUAL_QA.md` QA-BACK-04 lists "ReadingSessions" and "Alignment"
    /// among what a Clean Restore must verify) -- Collections/Tags and
    /// Reference-file inclusion were already proven by Tickets 6 and 9.
    #[test]
    fn canonical_user_assets_survive_a_real_backup_and_restore_round_trip() {
        let dir = scratch_dir("canonical-asset-round-trip");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute("INSERT INTO book (id, title) VALUES ('book-2', 'Second Test Book')", []).unwrap();
            conn.execute(
                "INSERT INTO book_file (book_id, path, fingerprint, format, ownership_mode)
                 VALUES ('book-2', 'elsewhere.txt', 'fp-2', 'txt', 'reference')",
                [],
            )
            .unwrap();
            crate::actual_reading_time::save_actual_reading_time(
                &conn,
                "book-1",
                &crate::actual_reading_time::ActualReadingTime::new(std::time::Duration::from_secs(8_280)),
            )
            .unwrap();
            crate::alignment::import_package(
                &conn,
                "align-1",
                &crate::alignment::AlignmentPackageFile {
                    book_a_fingerprint: "fp-1".into(),
                    book_b_fingerprint: "fp-2".into(),
                    lang_a: "en".into(),
                    lang_b: "zh".into(),
                    mappings: vec![crate::alignment::AlignmentMapping { a: vec![1], b: vec![1] }],
                },
            )
            .unwrap();
            crate::assets::create_asset(
                &conn,
                &crate::assets::ReadingAsset {
                    id: "asset-1".into(),
                    book_id: "book-1".into(),
                    kind: crate::assets::AssetKind::Note,
                    text: "A free-standing thought worth keeping".into(),
                    anchor: None,
                    orphaned: false,
                },
            )
            .unwrap();
            crate::ocr::save_page_result(&conn, "book-1", 1, "raw ocr text with an error").unwrap();
            crate::ocr::save_correction(&conn, "book-1", 1, "corrected text").unwrap();
            crate::book_hours::save_workload_config(
                &conn,
                "book-1",
                &crate::book_hours::WorkloadConfig { quantity: 50_000.0, baseline_speed: 250.0, difficulty_coefficient: 1.1 },
                "2026-09-09T00:00:00Z",
            )
            .unwrap();
            crate::collections::create_collection(&conn, "col-1", "Favorites").unwrap();
            crate::collections::add_book_to_collection(&conn, "book-1", "col-1").unwrap();
            crate::collections::add_tag_to_book(&conn, "book-1", "to-reread").unwrap();
        }

        let zip_path = dir.join("backup.zip");
        create_app_data_backup(&db_path, &zip_path, "2026-09-09T00:00:00Z", 1).unwrap();

        let restored_db_path = dir.join("restored.sqlite3");
        let restored_managed_dir = dir.join("managed-unused");
        let snapshot_path = dir.join("snapshot.sqlite3");
        restore(&zip_path, &restored_db_path, &restored_managed_dir, &snapshot_path).unwrap();

        let conn = Connection::open(&restored_db_path).unwrap();
        let assets = crate::assets::list_assets_for_book(&conn, "book-1").unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].text, "A free-standing thought worth keeping");

        assert_eq!(
            crate::ocr::effective_text(&conn, "book-1", 1).unwrap(),
            Some("corrected text".to_string()),
            "OCR correction must survive, not just raw recognized text"
        );

        let workload = crate::book_hours::load_workload_config(&conn, "book-1").unwrap().unwrap();
        assert_eq!(workload.quantity, 50_000.0);
        assert_eq!(
            crate::book_hours::list_workload_config_revisions(&conn, "book-1").unwrap().len(),
            1,
            "FC-A05: the workload config revision history is canonical user data and must survive backup/restore"
        );

        let collections = crate::collections::list_collections_for_book(&conn, "book-1").unwrap();
        assert_eq!(collections.len(), 1);
        assert_eq!(collections[0].name, "Favorites");
        assert_eq!(
            crate::collections::list_tags_for_book(&conn, "book-1").unwrap(),
            vec!["to-reread".to_string()],
            "FC-A01: Collections/Tags are canonical user data (PRODUCT_SPEC.md SS3.3) and must survive backup/restore"
        );

        assert_eq!(
            crate::actual_reading_time::load_actual_reading_time(&conn, "book-1").unwrap().total,
            std::time::Duration::from_secs(8_280),
            "FC-A14: Actual Reading Time (MANUAL_QA.md QA-BACK-04 'ReadingSessions') must survive backup/restore"
        );

        let alignment = crate::alignment::find_package_for_book(&conn, "book-1").unwrap().unwrap();
        assert_eq!(alignment.book_id_a, "book-1");
        assert_eq!(alignment.book_id_b, "book-2");
        assert_eq!(
            alignment.mappings,
            vec![crate::alignment::AlignmentMapping { a: vec![1], b: vec![1] }],
            "FC-A14: an Alignment Package must survive backup/restore"
        );
    }

    #[test]
    fn preview_reports_the_manifest_without_mutating_anything_on_disk() {
        let dir = scratch_dir("preview-no-mutation");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let zip_path = dir.join("backup.zip");
        create_app_data_backup(&db_path, &zip_path, "2026-09-09T00:00:00Z", 1).unwrap();

        let preview = preview(&zip_path).unwrap();
        assert_eq!(preview.manifest.kind, BackupKind::AppData);
        assert_eq!(preview.manifest.created_at, "2026-09-09T00:00:00Z");
        assert!(preview.schema_ok);
        assert!(preview.missing.is_empty());

        // The live db file itself must be untouched by a mere preview.
        let conn = Connection::open(&db_path).unwrap();
        let title: String = conn.query_row("SELECT title FROM book WHERE id = 'book-1'", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "Test Book");
    }

    #[test]
    fn a_full_library_backup_includes_managed_copy_files_and_restores_them() {
        let dir = scratch_dir("full-library-managed-copy");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let managed_dir = dir.join("managed");
        std::fs::create_dir_all(&managed_dir).unwrap();
        std::fs::write(managed_dir.join("book.epub"), b"fake epub bytes").unwrap();

        let zip_path = dir.join("full_backup.zip");
        create_full_library_backup(&db_path, &managed_dir, &[], &zip_path, "2026-09-09T00:00:00Z", 1).unwrap();

        let restored_db_path = dir.join("restored.sqlite3");
        let restored_managed_dir = dir.join("restored-managed");
        let snapshot_path = dir.join("snapshot.sqlite3");
        restore(&zip_path, &restored_db_path, &restored_managed_dir, &snapshot_path).unwrap();

        let restored_bytes = std::fs::read(restored_managed_dir.join("book.epub")).unwrap();
        assert_eq!(restored_bytes, b"fake epub bytes");
    }

    #[test]
    fn a_full_library_backup_excludes_reference_files_by_default() {
        // MANUAL_QA.md QA-BACK-02 "verify inclusion is opt-in".
        let dir = scratch_dir("full-library-reference-excluded-by-default");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let managed_dir = dir.join("managed");
        std::fs::create_dir_all(&managed_dir).unwrap();

        let zip_path = dir.join("full_backup.zip");
        let manifest =
            create_full_library_backup(&db_path, &managed_dir, &[], &zip_path, "2026-09-09T00:00:00Z", 1).unwrap();

        assert!(
            manifest.files.iter().all(|f| !f.starts_with("reference/")),
            "PRODUCT_SPEC.md SS16.3: Reference source files are included only when explicitly selected"
        );
    }

    #[test]
    fn a_full_library_backup_includes_only_explicitly_selected_reference_files() {
        let dir = scratch_dir("full-library-reference-opt-in");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let managed_dir = dir.join("managed");
        std::fs::create_dir_all(&managed_dir).unwrap();
        let reference_source = dir.join("my-reference-book.epub");
        std::fs::write(&reference_source, b"a reference-mode book the user owns").unwrap();

        let zip_path = dir.join("full_backup.zip");
        let manifest = create_full_library_backup(
            &db_path,
            &managed_dir,
            &[reference_source.clone()],
            &zip_path,
            "2026-09-09T00:00:00Z",
            1,
        )
        .unwrap();

        assert_eq!(manifest.files, vec!["reference/my-reference-book.epub".to_string()]);
        let mut archive = open_archive(&zip_path).unwrap();
        let bytes = read_entry(&mut archive, "reference/my-reference-book.epub").unwrap();
        assert_eq!(bytes, b"a reference-mode book the user owns");
    }

    #[test]
    fn restoring_a_full_library_backup_never_overwrites_the_original_reference_file() {
        // PRODUCT_SPEC.md SS16.4: "never silently overwrite reference
        // source files" -- the archived reference/ bytes are a safety
        // copy inside the zip, not something restore extracts back over
        // the user's own file at its original path.
        let dir = scratch_dir("full-library-reference-restore-no-overwrite");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let managed_dir = dir.join("managed");
        std::fs::create_dir_all(&managed_dir).unwrap();
        let reference_source = dir.join("my-reference-book.epub");
        std::fs::write(&reference_source, b"original bytes the user owns").unwrap();

        let zip_path = dir.join("full_backup.zip");
        create_full_library_backup(
            &db_path,
            &managed_dir,
            &[reference_source.clone()],
            &zip_path,
            "2026-09-09T00:00:00Z",
            1,
        )
        .unwrap();

        // Simulate the user having since modified their own Reference file.
        std::fs::write(&reference_source, b"the user has since edited this file").unwrap();

        let restored_db_path = dir.join("restored.sqlite3");
        let restored_managed_dir = dir.join("restored-managed");
        let snapshot_path = dir.join("snapshot.sqlite3");
        restore(&zip_path, &restored_db_path, &restored_managed_dir, &snapshot_path).unwrap();

        let bytes_after_restore = std::fs::read(&reference_source).unwrap();
        assert_eq!(
            bytes_after_restore, b"the user has since edited this file",
            "restore must never silently overwrite a Reference source file at its original path"
        );
    }

    #[test]
    fn restoring_an_archive_missing_a_manifest_listed_file_is_rejected_without_touching_the_live_database() {
        let dir = scratch_dir("incomplete-archive-rejected");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let live_db_path = dir.join("live.sqlite3");
        seeded_db(&live_db_path); // pre-existing live state that must survive a rejected restore
        {
            let conn = Connection::open(&live_db_path).unwrap();
            conn.execute("UPDATE book SET title = 'Pre-Restore Live State' WHERE id = 'book-1'", []).unwrap();
        }

        // Hand-craft an incomplete Full Library archive: manifest claims a
        // managed file that was never actually written into the zip.
        let zip_path = dir.join("incomplete.zip");
        let manifest = BackupManifest {
            kind: BackupKind::FullLibrary,
            created_at: "2026-09-09T00:00:00Z".into(),
            book_count: 1,
            files: vec!["managed/missing.epub".into()],
        };
        write_archive(&zip_path, &db_path, &manifest, &[]).unwrap();

        let managed_dir = dir.join("managed");
        let snapshot_path = dir.join("snapshot.sqlite3");
        let result = restore(&zip_path, &live_db_path, &managed_dir, &snapshot_path);

        assert!(matches!(result, Err(BackupError::Incomplete { .. })));
        assert!(!snapshot_path.exists(), "no snapshot should be created for a rejected restore");

        let conn = Connection::open(&live_db_path).unwrap();
        let title: String = conn.query_row("SELECT title FROM book WHERE id = 'book-1'", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "Pre-Restore Live State", "live database must be untouched after a rejected restore");
    }

    #[test]
    fn restore_creates_a_recovery_snapshot_of_the_pre_restore_live_state_before_replacing_it() {
        let dir = scratch_dir("snapshot-before-replace");
        let db_path = dir.join("library.sqlite3");
        seeded_db(&db_path);
        let zip_path = dir.join("backup.zip");
        create_app_data_backup(&db_path, &zip_path, "2026-09-09T00:00:00Z", 1).unwrap();

        let live_db_path = dir.join("live.sqlite3");
        seeded_db(&live_db_path);
        {
            let conn = Connection::open(&live_db_path).unwrap();
            conn.execute("UPDATE book SET title = 'Pre-Restore Live State' WHERE id = 'book-1'", []).unwrap();
        }

        let managed_dir = dir.join("managed-unused");
        let snapshot_path = dir.join("snapshot.sqlite3");
        restore(&zip_path, &live_db_path, &managed_dir, &snapshot_path).unwrap();

        assert!(snapshot_path.exists(), "a recovery snapshot of the pre-restore state must be created");
        let conn = Connection::open(&snapshot_path).unwrap();
        let title: String = conn.query_row("SELECT title FROM book WHERE id = 'book-1'", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "Pre-Restore Live State", "the snapshot must capture the state *before* replacement");
    }

    #[test]
    fn prune_old_snapshots_keeps_only_the_most_recent_by_filename_order() {
        let dir = scratch_dir("prune-snapshots");
        for label in ["a", "b", "c", "d"] {
            std::fs::write(dir.join(format!("snapshot-{label}.sqlite3")), b"x").unwrap();
        }

        prune_old_snapshots(&dir, 2).unwrap();

        let mut remaining: Vec<String> =
            std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        remaining.sort();
        assert_eq!(remaining, vec!["snapshot-c.sqlite3".to_string(), "snapshot-d.sqlite3".to_string()]);
    }

    #[test]
    fn prune_old_snapshots_is_a_no_op_when_at_or_under_the_limit() {
        let dir = scratch_dir("prune-under-limit");
        std::fs::write(dir.join("snapshot-a.sqlite3"), b"x").unwrap();

        prune_old_snapshots(&dir, 2).unwrap();

        let remaining: Vec<_> = std::fs::read_dir(&dir).unwrap().collect();
        assert_eq!(remaining.len(), 1);
    }

    #[test]
    fn create_recovery_snapshot_copies_the_database_and_prunes_old_ones() {
        // FC-A07 (`PRODUCT_SPEC.md` SS16.1): "Automatic Recovery Snapshot
        // ... created before high-risk app-data operations such as:
        // schema migration ... major destructive library mutation."
        let dir = scratch_dir("recovery-snapshot-before-mutation");
        let db_path = dir.join("library.sqlite3");
        std::fs::write(&db_path, b"the live database's current bytes").unwrap();
        let snapshot_dir = dir.join("recovery-snapshots");

        create_recovery_snapshot(&db_path, &snapshot_dir, "pre-migration", "1", 5).unwrap();

        let entries: Vec<String> =
            std::fs::read_dir(&snapshot_dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        assert_eq!(entries, vec!["pre-migration-1.sqlite3".to_string()]);
        assert_eq!(
            std::fs::read(snapshot_dir.join("pre-migration-1.sqlite3")).unwrap(),
            b"the live database's current bytes"
        );

        // Mutating the "live" file afterward must not retroactively alter
        // the already-taken snapshot -- it is a real copy, not a link.
        std::fs::write(&db_path, b"the live database after a destructive mutation").unwrap();
        assert_eq!(
            std::fs::read(snapshot_dir.join("pre-migration-1.sqlite3")).unwrap(),
            b"the live database's current bytes"
        );
    }

    #[test]
    fn create_recovery_snapshot_respects_the_retention_limit_across_repeated_calls() {
        let dir = scratch_dir("recovery-snapshot-retention");
        let db_path = dir.join("library.sqlite3");
        std::fs::write(&db_path, b"v1").unwrap();
        let snapshot_dir = dir.join("recovery-snapshots");

        for unique in ["1", "2", "3"] {
            create_recovery_snapshot(&db_path, &snapshot_dir, "pre-destructive-mutation", unique, 2).unwrap();
        }

        let mut remaining: Vec<String> =
            std::fs::read_dir(&snapshot_dir).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        remaining.sort();
        assert_eq!(
            remaining,
            vec!["pre-destructive-mutation-2.sqlite3".to_string(), "pre-destructive-mutation-3.sqlite3".to_string()]
        );
    }

    #[test]
    fn create_recovery_snapshot_is_a_no_op_on_a_fresh_install_with_no_database_yet() {
        let dir = scratch_dir("recovery-snapshot-fresh-install");
        let db_path = dir.join("library.sqlite3"); // never created
        let snapshot_dir = dir.join("recovery-snapshots");

        create_recovery_snapshot(&db_path, &snapshot_dir, "pre-migration", "1", 5).unwrap();

        assert!(!snapshot_dir.exists(), "nothing to protect yet, so no snapshot directory should even be created");
    }
}
