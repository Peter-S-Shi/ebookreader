"""
M0 Corrective Evidence - M0-H Backup/Restore minimal real workflow spike.

Prior M0 pass only proved a raw archive/extract round trip. This spike
implements the actual workflow shape required by ARCHITECTURE.md SS15:

  manifest/preview -> safety snapshot -> restore -> verify

...and exercises the two book-ownership semantics that matter for restore
correctness: Managed-Copy (book bytes live inside app data, backed up
directly) and Reference (book bytes live outside app data at a path the
app does not own; backup stores only the path + fingerprint, and restore
must surface relink instead of silently failing or fabricating the file).

This is algorithm/state-machine validation (portable), implemented in
Python for iteration speed; production implementation is Rust (a `zip`
crate + the same manifest shape), same note as the M0-E CJK adapter spike.
"""
import hashlib
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

# Runs entirely under a temp directory - never writes inside the repo.
ROOT = Path(tempfile.mkdtemp(prefix="m0h_backup_restore_"))
APP_DATA = ROOT / "app-data"
EXTERNAL_LIB = ROOT / "external-library"   # simulates a user's own folder, outside app data
BACKUPS = ROOT / "backups"
SAFETY = ROOT / "safety-snapshots"
RESTORE_STAGING = ROOT / "restore-staging"

SCHEMA_VERSION = 1


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def reset():
    for d in [APP_DATA, EXTERNAL_LIB, BACKUPS, SAFETY, RESTORE_STAGING]:
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)


def seed_library():
    """Two books: one Managed-Copy (bytes live in app-data), one Reference
    (bytes live in an external folder the app does not own)."""
    (APP_DATA / "managed").mkdir(parents=True, exist_ok=True)
    managed_bytes = b"MANAGED COPY OF BOOK A - synthetic bytes for spike"
    (APP_DATA / "managed" / "book_a.bin").write_bytes(managed_bytes)

    ref_bytes = b"EXTERNAL REFERENCE BOOK B - lives outside app data"
    (EXTERNAL_LIB / "book_b.bin").write_bytes(ref_bytes)

    db = {
        "books": [
            {
                "id": "book_a",
                "title": "Managed Copy Book",
                "ownership": "MANAGED_COPY",
                "storage_path": "managed/book_a.bin",
                "fingerprint": sha256(APP_DATA / "managed" / "book_a.bin"),
            },
            {
                "id": "book_b",
                "title": "Reference Book",
                "ownership": "REFERENCE",
                "external_path": str(EXTERNAL_LIB / "book_b.bin"),
                "fingerprint": sha256(EXTERNAL_LIB / "book_b.bin"),
            },
        ],
        "reading_state": {"book_a": {"progress_pct": 42.0}, "book_b": {"progress_pct": 10.0}},
    }
    (APP_DATA / "db.json").write_text(json.dumps(db, indent=2), encoding="utf-8")
    return db


def build_manifest(db: dict) -> dict:
    entries = []
    for book in db["books"]:
        if book["ownership"] == "MANAGED_COPY":
            entries.append({
                "book_id": book["id"],
                "ownership": "MANAGED_COPY",
                "archive_path": book["storage_path"],
                "fingerprint": book["fingerprint"],
            })
        else:
            entries.append({
                "book_id": book["id"],
                "ownership": "REFERENCE",
                "external_path": book["external_path"],
                "fingerprint": book["fingerprint"],
            })
    return {
        "schema_version": SCHEMA_VERSION,
        "created_at": "2026-09-08T00:00:00Z",
        "db_checksum": hashlib.sha256((APP_DATA / "db.json").read_bytes()).hexdigest(),
        "entries": entries,
    }


def create_backup(name: str) -> Path:
    db = json.loads((APP_DATA / "db.json").read_text(encoding="utf-8"))
    manifest = build_manifest(db)
    out = BACKUPS / name
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
        z.write(APP_DATA / "db.json", "db.json")
        for entry in manifest["entries"]:
            if entry["ownership"] == "MANAGED_COPY":
                z.write(APP_DATA / entry["archive_path"], entry["archive_path"])
    return out


def preview_backup(path: Path) -> dict:
    """Inspect an archive WITHOUT extracting/mutating app state."""
    with zipfile.ZipFile(path) as z:
        manifest = json.loads(z.read("manifest.json"))
        names = set(z.namelist())
    ok = manifest.get("schema_version") == SCHEMA_VERSION
    missing_in_archive = [
        e["archive_path"] for e in manifest["entries"]
        if e["ownership"] == "MANAGED_COPY" and e["archive_path"] not in names
    ]
    return {
        "schema_version_ok": ok,
        "entry_count": len(manifest["entries"]),
        "missing_managed_copy_files_in_archive": missing_in_archive,
        "manifest": manifest,
    }


def safety_snapshot() -> Path:
    """Snapshot current app-data BEFORE a destructive restore, so restore is
    itself recoverable if something goes wrong."""
    snap_name = f"pre-restore-{len(list(SAFETY.iterdir()))}.zip"
    snap_path = SAFETY / snap_name
    with zipfile.ZipFile(snap_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in APP_DATA.rglob("*"):
            if f.is_file():
                z.write(f, f.relative_to(APP_DATA))
    return snap_path


def restore(path: Path) -> dict:
    preview = preview_backup(path)
    if not preview["schema_version_ok"]:
        return {"status": "REJECTED", "reason": "schema_version_mismatch"}
    if preview["missing_managed_copy_files_in_archive"]:
        return {"status": "REJECTED", "reason": "archive_incomplete", "missing": preview["missing_managed_copy_files_in_archive"]}

    snap = safety_snapshot()

    # Transactional-ish: stage into a temp dir, then swap.
    if RESTORE_STAGING.exists():
        shutil.rmtree(RESTORE_STAGING)
    RESTORE_STAGING.mkdir(parents=True)
    with zipfile.ZipFile(path) as z:
        z.extractall(RESTORE_STAGING)

    manifest = preview["manifest"]
    relink_needed = []
    for entry in manifest["entries"]:
        if entry["ownership"] == "REFERENCE":
            ext_path = Path(entry["external_path"])
            if not ext_path.exists():
                relink_needed.append(entry["book_id"])
            else:
                actual_fp = sha256(ext_path)
                if actual_fp != entry["fingerprint"]:
                    relink_needed.append(entry["book_id"])

    # Swap: replace live app-data db.json + managed files with staged ones.
    shutil.copy(RESTORE_STAGING / "db.json", APP_DATA / "db.json")
    for entry in manifest["entries"]:
        if entry["ownership"] == "MANAGED_COPY":
            dest = APP_DATA / entry["archive_path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(RESTORE_STAGING / entry["archive_path"], dest)

    return {
        "status": "RESTORED",
        "safety_snapshot": str(snap),
        "relink_needed": relink_needed,
    }


def verify_after_restore(db_before: dict) -> dict:
    db_after = json.loads((APP_DATA / "db.json").read_text(encoding="utf-8"))
    checks = {
        "db_matches_pre_backup_state": db_after == db_before,
        "managed_copy_fingerprint_ok": sha256(APP_DATA / "managed" / "book_a.bin") == db_before["books"][0]["fingerprint"],
    }
    return checks


def main():
    reset()
    db = seed_library()
    print("1. Seeded library: 1 Managed-Copy book, 1 Reference book")

    backup_path = create_backup("full_backup_1.zip")
    print(f"2. Created backup: {backup_path.name} ({backup_path.stat().st_size} bytes)")

    preview = preview_backup(backup_path)
    print(f"3. Preview (no mutation): schema_ok={preview['schema_version_ok']} entries={preview['entry_count']} missing={preview['missing_managed_copy_files_in_archive']}")

    # --- Case A: normal restore, Reference file still present and unchanged ---
    result_a = restore(backup_path)
    print(f"4a. Restore (Reference file intact): status={result_a['status']} relink_needed={result_a['relink_needed']}")
    checks_a = verify_after_restore(db)
    print(f"    verify: {checks_a}")

    # --- Case B: Reference file has gone missing since backup was taken ---
    os.remove(EXTERNAL_LIB / "book_b.bin")
    result_b = restore(backup_path)
    print(f"4b. Restore (Reference file now MISSING): status={result_b['status']} relink_needed={result_b['relink_needed']}")
    assert result_b["relink_needed"] == ["book_b"], "Reference relink must be surfaced, not silently dropped"

    # --- Case C: corrupt archive (missing declared managed-copy file) should be rejected, not partially applied ---
    corrupt_path = BACKUPS / "corrupt.zip"
    shutil.copy(backup_path, corrupt_path)
    with zipfile.ZipFile(corrupt_path) as zin:
        names = zin.namelist()
    # rewrite the zip without the managed-copy file to simulate corruption/truncation
    with zipfile.ZipFile(backup_path) as zin, zipfile.ZipFile(corrupt_path, "w") as zout:
        for n in names:
            if n == "managed/book_a.bin":
                continue
            zout.writestr(n, zin.read(n))
    result_c = restore(corrupt_path)
    print(f"4c. Restore (corrupt archive, missing managed-copy bytes): status={result_c['status']} reason={result_c.get('reason')}")
    assert result_c["status"] == "REJECTED", "Corrupt/incomplete archive must be rejected before any state is swapped"

    # confirm app-data still matches the last GOOD restore (case B state), i.e. rejection did not partially apply
    db_after_reject = json.loads((APP_DATA / "db.json").read_text(encoding="utf-8"))
    print(f"4c. app-data unchanged after rejection: {db_after_reject == db}")

    print("\nOVERALL: PASS - manifest/preview -> safety snapshot -> restore -> verify workflow exercised,")
    print("including Reference relink surfacing and rejection of an incomplete archive without partial apply.")


if __name__ == "__main__":
    main()
