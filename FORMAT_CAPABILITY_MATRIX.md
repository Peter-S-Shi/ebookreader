# EbookReader Format Capability Matrix

Status: **V1 Baseline + V2 Frozen Capability Contract**


## Authority Boundary

This file owns the **format capability contract** for EbookReader.

Implementation verification state belongs in milestone evidence and `PROJECT_STATUS.md`; this matrix must not become a second project-status dashboard.

If implementation evidence contradicts a frozen capability promise, stop and escalate through the architecture/product conflict path rather than silently weakening this matrix.

---

Legend:

- ✅ Supported / verified
- ⚠️ Degraded / conditional / format-dependent
- — Not applicable / intentionally unavailable

| Capability | Reflowable EPUB | Fixed-layout EPUB | Text PDF | Scanned PDF pre-OCR | Scanned PDF post-OCR | Hybrid PDF | TXT |
|---|---:|---:|---:|---:|---:|---:|---:|
| Import / Library | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Library Cover Art | ✅ embedded | ✅ embedded | ✅ Page 1 thumb | ✅ Page 1 thumb | ✅ Page 1 thumb | ✅ Page 1 thumb | ⚠️ format icon |
| Normal visual reading | ✅ | ✅ | ✅ | ✅ (WASM JBIG2) | ✅ | ✅ | ✅ |
| Continuous scroll | — (deferred V3) | — (deferred V3) | — (deferred V3) | — (deferred V3) | — (deferred V3) | — (deferred V3) | ✅ native |
| Single-page / paged | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Double-page | ✅ paginated | ⚠️ engine-dependent | — | — | — | — | — |
| TOC / outline navigation | ✅ publication-provided | ✅ publication-provided | ⚠️ outline-dependent | ⚠️ outline-dependent | ⚠️ outline-dependent | ⚠️ outline-dependent | ⚠️ derived |
| Direct page jump (`1..N`) | — | — | ✅ | ✅ | ✅ | ✅ | — |
| Internal document hyperlinks | ✅ | ✅ | ✅ | ⚠️ link-annotated | ⚠️ link-annotated | ✅ | — |
| External HTTP/HTTPS links | ✅ | ✅ | ✅ (confirm prompt) | ✅ (confirm prompt) | ✅ (confirm prompt) | ✅ (confirm prompt) | — |
| Page Appearance modes | — (uses theme) | — | ✅ (5 modes + mask) | ✅ (Night un-inverted) | ✅ | ✅ | — (uses theme) |
| Stable progress restore | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Publisher embedded fonts | ✅ | ✅ | — | — | — | — | — |
| User font-family override | ✅ | — | — | — | — | — | ✅ |
| Typography overrides (size/margin) | ✅ (!important) | — | — | — | — | — | ✅ |
| Free numeric typography inputs | ✅ | — | — | — | — | — | ✅ |
| Position indicator (`K/N`) | ✅ reflowed | — | — | — | — | — | ✅ reflowed |
| Text selection | ✅ | ⚠️ publication-dependent | ✅ (healthy Unicode) | — | ✅ | ⚠️ page-dependent | ✅ |
| In-book text search | ✅ | ⚠️ text-dependent | ✅ (healthy Unicode) | — | ✅ | ⚠️ page-dependent | ✅ |
| Library-wide text indexing | ✅ | ⚠️ text-dependent | ✅ (healthy Unicode) | — | ✅ | ⚠️ page-dependent | ✅ |
| Annotation / highlight | ✅ | ⚠️ location model | ✅ (healthy Unicode) | — | ✅ | ⚠️ page-dependent | ✅ |
| Excerpt | ✅ | ⚠️ text-dependent | ✅ (healthy Unicode) | — | ✅ | ⚠️ page-dependent | ✅ |
| Note | ✅ | ✅ | ✅ | ✅ Book/page note | ✅ | ✅ | ✅ |
| Source jump-back | ✅ | ✅ | ✅ | ✅ page-level | ✅ | ✅ | ✅ |
| Bookmark | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Book Hours quantity | ✅ text/metadata | ⚠️ page/metadata | ✅ text or page | ⚠️ page-based | ✅ OCR text or page | ✅ text or page | ✅ text |
| Actual Reading Time | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Completion / rereads | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OCR Workspace | — | — | — | ✅ | already applied | ✅ conditional | — |
| OCR manual correction | — | — | — | — | ✅ | ✅ | — |
| Bilingual Alignment Package | ✅ | ⚠️ anchor support | ✅ | ⚠️ page-level/degraded | ✅ | ⚠️ page-dependent | ✅ |
| Backup / Restore user state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Managed-Copy file backup | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reference relink | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Notes

### Reflowable EPUB
- The richest typography surface.
- Reader typography overrides (`font-size`, `line-height`, `page-width`, `margins`, `font-family`) reliably override conflicting publisher CSS using root-relative `rem` styling and `!important` declarations.
- Dynamic `K/N` reflowed position indicators reflect real-time pagination.

### Fixed-layout EPUB
- Treated like fixed pages. Reflowable typography controls that cannot work are disabled.

### Text PDF
- Text layer, selection, search, and highlight geometry operate against the native PDF text layer.
- Embedded outline/bookmarks are parsed and presented in hierarchical Contents.
- Internal links navigate inside the reader; external links trigger a confirmation modal before opening the system browser.

### Scanned PDF & WASM Decoders
- Scanned documents render accurately via local pdf.js WASM decoders (e.g. JBIG2).
- Visual reading is fully available without OCR.
- Page Appearance modes tint paper surfaces while preserving scanned rasters in Night mode without destructive pixel inversion.
- Text-bound features remain unavailable or truthfully degraded until OCR is executed.

### Hybrid PDF & Document-Level OCR Classification
- PDF documents are evaluated at the document level (`TEXT`, `SCAN`, `HYBRID`).
- Hybrid documents containing both extractable text and scanned image pages retain full access to the OCR Workspace, preventing incidental watermarks or headers from suppressing OCR affordance.

### Source Unicode Integrity Limitation
- Some visually correct PDFs contain broken, non-standard, or missing `ToUnicode` mapping tables. In that class of documents, PDF renderers (including pdf.js and external mature viewers) render visual glyphs accurately while copied or extracted Unicode text contains garbled characters. EbookReader V2 does not attempt heuristic character reconstruction of missing source Unicode.

### Annotation Distinction
- `Annotation`, `Excerpt`, and `Note` are separate entities. A free-standing Note may exist even where text selection is unavailable, but rich text-bound annotations require reliable source text or OCR.
