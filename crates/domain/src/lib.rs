//! Library domain logic: file identity and duplicate-import detection.
//!
//! Per `PRODUCT_SPEC.md` SS3.5/SS "Duplicate import" and `ARCHITECTURE.md`
//! "Same fingerprint" / "Changed fingerprint": a cryptographic fingerprint,
//! not path or filename, is the durable signal for file identity.

use sha2::{Digest, Sha256};
use std::io::{self, Read};
use std::path::Path;

pub mod document_location;
pub mod fonts;
pub mod store;

/// A minimal view of a Library entry sufficient for duplicate-import detection.
pub struct LibraryEntry {
    pub book_id: String,
    pub title: String,
    pub fingerprint: String,
}

/// Compute the cryptographic (SHA-256) fingerprint of a file's byte content.
///
/// This is the durable file-identity signal: it does not depend on path or
/// filename, so a moved/renamed file with unchanged bytes still fingerprints
/// identically (`ARCHITECTURE.md` "Same fingerprint").
pub fn compute_fingerprint(path: &Path) -> io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Find an existing Library entry whose fingerprint matches `fingerprint`.
///
/// Per `PRODUCT_SPEC.md` "Duplicate import": a duplicate is identified by
/// fingerprint alone. Title/author similarity is not a signal here — a
/// same-title book with a different fingerprint remains eligible to become
/// a separate Book.
pub fn find_duplicate<'a>(
    existing: &'a [LibraryEntry],
    fingerprint: &str,
) -> Option<&'a LibraryEntry> {
    existing.iter().find(|entry| entry.fingerprint == fingerprint)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp_file(dir: &std::path::Path, name: &str, contents: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(contents).unwrap();
        path
    }

    #[test]
    fn identical_bytes_produce_identical_fingerprint() {
        let dir = std::env::temp_dir().join(format!("ebookreader-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let a = write_temp_file(&dir, "a.epub", b"same book contents");
        let b = write_temp_file(&dir, "b.epub", b"same book contents");

        let fp_a = compute_fingerprint(&a).unwrap();
        let fp_b = compute_fingerprint(&b).unwrap();

        assert_eq!(fp_a, fp_b, "identical byte content must yield the same fingerprint regardless of path/filename");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn different_bytes_produce_different_fingerprint() {
        let dir = std::env::temp_dir().join(format!("ebookreader-test-diff-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let a = write_temp_file(&dir, "a.epub", b"book one contents");
        let b = write_temp_file(&dir, "b.epub", b"book two contents, different");

        let fp_a = compute_fingerprint(&a).unwrap();
        let fp_b = compute_fingerprint(&b).unwrap();

        assert_ne!(fp_a, fp_b);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn duplicate_import_is_detected_by_fingerprint_not_by_title_or_path() {
        let existing = vec![
            LibraryEntry {
                book_id: "book-1".into(),
                title: "Alice's Adventures in Wonderland".into(),
                fingerprint: "abc123".into(),
            },
            LibraryEntry {
                book_id: "book-2".into(),
                title: "Some Other Book".into(),
                fingerprint: "def456".into(),
            },
        ];

        // Same fingerprint as book-1, but a different title/path (e.g. a re-downloaded copy).
        let found = find_duplicate(&existing, "abc123");
        assert_eq!(found.map(|b| b.book_id.as_str()), Some("book-1"));
    }

    #[test]
    fn same_title_with_different_fingerprint_is_not_a_duplicate() {
        // Per PRODUCT_SPEC.md SS3.5: "Same title/author with different fingerprint
        // remains eligible to become a separate Book."
        let existing = vec![LibraryEntry {
            book_id: "book-1".into(),
            title: "Alice's Adventures in Wonderland".into(),
            fingerprint: "abc123".into(),
        }];

        let found = find_duplicate(&existing, "zzz999");
        assert!(found.is_none());
    }
}
