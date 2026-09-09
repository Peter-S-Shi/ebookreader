# Local Workspace Footprint Audit

Written: 2026-09-09
Scope: read-only forensic audit of the local `Ebookreader/` workspace ahead of the Feature Complete Corrective Pass. No deletions performed as part of this audit.

## Total size

- Workspace total: **~17 GB** (measured via `du -sh .`; earlier informal estimate of ~20 GB was in the right neighborhood — same root cause, no discrepancy worth chasing).
- GitHub-reported repository content: ~2.1 MB, consistent with `git count-objects -vH` below. The gap between 17 GB on disk and ~2 MB in the actual Git object store confirms the bloat is entirely local, git-ignored, rebuildable material — not tracked source, not undisclosed history.

## Top-level breakdown (descending)

| Path | Size | Classification |
|---|---|---|
| `target/` | 15 GB | Build artifact / safely rebuildable |
| `src-tauri/target/` | 1.7 GB | Build artifact / safely rebuildable |
| `node_modules/` | 196 MB | Local runtime dependency / needed now but reproducible |
| `ocr-assets/` | 101 MB | Local runtime dependency / needed now but reproducible (re-downloadable OCR models, per `.gitignore` comment) |
| `dist/` | 3.0 MB | Build artifact / safely rebuildable |
| `.git/` | 2.3 MB | Canonical — Git object store itself |
| `tooling/` | 1.6 MB | Canonical source / must keep (Loop Engineering evidence, m5/m7 evidence dirs) |
| `src/` | 274 KB | Canonical source / must keep |
| `crates/` | 257 KB | Canonical source / must keep |
| `docs/` | 80 KB | Canonical source / must keep |
| `prompt-drafts/` | 40 KB | Local-only, already `.gitignore`-excluded (`/prompt-drafts/`) |
| `public/`, `.github/`, `.vscode/` | <10 KB each | Canonical source / must keep |

## `target/` breakdown (15 GB — the dominant contributor)

- `target/debug/deps/` — **11 GB**
- `target/debug/incremental/` — **2.5 GB**
- `target/debug/build/` — **1.6 GB**
- `target/release/` — 532 MB
- `target/debug/.fingerprint/` — 5.4 MB

`target/debug/deps/` alone holds **14 distinct hashed `.exe` binaries** (each 110–400 MB) and **721 distinct hashed `.rlib`/`.a` files** — one full copy of nearly every dependency's compiled artifact per hash-suffixed rebuild. This is the standard `cargo build`/`cargo test` incremental-cache pattern: every time source or a dependency version changes, `cargo` writes new hash-suffixed artifacts alongside old ones rather than overwriting them, and nothing in this project's workflow ever ran `cargo clean`. Across M1–M8 (roughly 20 milestone-closing commits, each with multiple `cargo build`/`cargo test` invocations for validation), this accumulated into the current 15 GB. There is no duplicate GNU/MSVC target-triple split visible — `target/debug` and `target/release` under one toolchain (`rustc 1.98.1`, `cargo 1.98.1`) account for all of it.

## `src-tauri/target/` breakdown (1.7 GB)

Same pattern, smaller scale — this is the Tauri shell's own separate Cargo workspace target directory (expected under this project's dual-workspace architecture: `crates/domain` builds under root `target/`, the Tauri app under `src-tauri/target/`). All debug-profile artifacts (e.g. `libwindows-*.rlib` at 111 MB, duplicated appearing in both root and `src-tauri` targets because `windows-rs` is a dependency of both workspaces). No release-profile bloat here.

## Git object store

```
count: 32
size: 159.91 KiB
in-pack: 743
packs: 2
size-pack: 1.86 MiB
prune-packable: 0
garbage: 0
```

Matches GitHub's ~2.1 MB report. No local Git bloat, no dangling/garbage objects, no history rewrite artifacts.

## `git status --ignored` classification

All 7 ignored top-level entries (`target/`, `src-tauri/target/`, `node_modules/`, `dist/`, `ocr-assets/`, `prompt-drafts/`, plus local editor/OS metadata) are covered by existing `.gitignore` rules — nothing tracked is misclassified, and nothing ignored is silently large in a way `.gitignore` doesn't already anticipate.

## Large individual files (>100 MB)

All 29 files found over 100 MB live under `target/debug/` or `src-tauri/target/debug/` — hashed rebuild artifacts (`.exe`, `.a`, `.rlib`). None are tracked, none are canonical evidence, none are user/test data. No untracked file over 100 MB exists outside these two build-artifact trees.

## No unknowns found

No accidentally-copied external project tree, no duplicate stale scaffold layout beyond the expected root/`src-tauri` dual-workspace split, no generated fixture/corpus directory of unexpected size, no ignored directory over 500 MB other than the two `target/` trees already classified above.

## Answers to the required questions

1. **Why did the workspace reach ~17–20 GB?** Pure Rust incremental-build accumulation across ~20 milestone-closing `cargo build test` cycles with no `cargo clean` ever run, split across two Cargo workspaces (root `crates/` and `src-tauri/`). No leak, no tracked bloat, no undisclosed data.
2. **How much is genuinely necessary for active development?** Realistically only the *most recent* debug build (one `.exe`, one set of current `.rlib`/`.a` files) plus `node_modules/` (196 MB) and `ocr-assets/` (101 MB) — well under 1 GB combined. `cargo` will regenerate a fresh, much smaller `target/` on next build.
3. **How much is safely reclaimable?** Effectively all of `target/` (15 GB) and `src-tauri/target/` (1.7 GB) — **~16.7 GB**, over 95% of the workspace.
4. **What exact cleanup commands would be safe?**
   ```bash
   cargo clean                      # from Ebookreader/, cleans root target/
   cd src-tauri && cargo clean && cd ..   # cleans src-tauri/target/
   ```
   Both directories are 100% `.gitignore`-covered and contain zero tracked files; `git status` before and after would be unaffected.
5. **What would be regenerated and at what cost?** The next `cargo build` / `cargo test` / `cargo tauri dev` will fully re-populate `target/` from scratch. Cost is one full clean-build cycle (CPU/wall-clock time only, no data cost) — no source, config, or evidence is regenerated-from-loss because none of it lived in `target/` to begin with.
6. **Would any cleanup invalidate current OCR/native evidence?** No. All OCR/native evidence referenced by `FEATURE_COMPLETE_CANDIDATE_REPORT.md`, `tooling/m5-evidence/`, `tooling/m7-evidence/`, and `ROADMAP.md` lives in tracked source, tracked docs, or `ocr-assets/` (kept, not a cleanup target) — none of it lives inside `target/` or `src-tauri/target/`.

## Recommendation

Cleanup is safe but **not performed as part of this audit** (per this document's own read-only-first mandate). `cargo clean` in both workspaces is available on request but is not a Human Gate — it does not touch tracked source, canonical evidence, or user data. Proceeding with the Feature Complete Corrective Pass now; disk cleanup can run independently at any point without blocking or being blocked by the corrective work.
