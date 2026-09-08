# EbookReader V1 Format Capability Matrix

Status: **Frozen Capability Contract / M0 Implementation Evidence Pending**


## Authority Boundary

This file owns the V1 **format capability contract**.

Implementation verification state belongs in milestone evidence and `PROJECT_STATUS.md`; this matrix must not become a second project-status dashboard.

If implementation evidence contradicts a frozen capability promise, stop and escalate through the architecture/product conflict path rather than silently weakening this matrix.

---

Legend:

- ✅ Required in V1
- ⚠️ Degraded / conditional
- — Not applicable / intentionally unavailable
- 🧪 M0 evidence required before implementation lock

| Capability | Reflowable EPUB | Fixed-layout EPUB | Text PDF | Scanned PDF pre-OCR | Scanned PDF post-OCR | TXT |
|---|---:|---:|---:|---:|---:|---:|
| Import / Library | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Normal visual reading | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Continuous scroll | ✅ | ⚠️ engine-dependent | ✅ | ✅ | ✅ | ✅ |
| Single-page / paged | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Double-page | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TOC / document structure | ✅ where publication provides | ✅ where provided | ⚠️ outline-dependent | ⚠️ outline-dependent | ⚠️ outline-dependent | ⚠️ derived/simple |
| Stable progress restore | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 |
| Publisher embedded fonts | ✅ | ✅ | — | — | — | — |
| User font-family override | ✅ | — | — | — | — | ✅ |
| Font size / line height / page width | ✅ | — | — | — | — | ✅ |
| CJK font override | ✅ | — | — | — | — | ✅ |
| Text selection | ✅ | ⚠️ publication-dependent | ✅ | — | ✅ 🧪 | ✅ |
| In-book text search | ✅ | ⚠️ text-dependent | ✅ | — | ✅ 🧪 | ✅ |
| Library-wide text indexing | ✅ | ⚠️ text-dependent | ✅ | — | ✅ 🧪 | ✅ |
| Annotation / highlight | ✅ | ⚠️ location model | ✅ | ⚠️ page-level only if implemented; no text promise | ✅ 🧪 | ✅ |
| Excerpt | ✅ | ⚠️ text-dependent | ✅ | — | ✅ 🧪 | ✅ |
| Note | ✅ | ✅ | ✅ | ✅ as Book/page note if supported by final adapter | ✅ | ✅ |
| Source jump-back | ✅ 🧪 | ✅ 🧪 | ✅ 🧪 | ✅ page-level | ✅ 🧪 | ✅ 🧪 |
| Bookmark | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Book Hours quantity | ✅ text/metadata | ⚠️ page/metadata | ✅ text or page | ⚠️ page-based before OCR | ✅ OCR text or page | ✅ text |
| Actual Reading Time | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Completion / rereads | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OCR | — | — | — for normal text PDF | ✅ required for text features | already applied | — |
| OCR correction | — | — | — | — | ✅ | — |
| Bilingual Alignment Package | ✅ 🧪 | ⚠️ anchor support | ✅ 🧪 | ⚠️ page-level/degraded | ✅ 🧪 | ✅ 🧪 |
| Backup / Restore user state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Managed-Copy file backup | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reference relink | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Notes

### Reflowable EPUB

The richest typography surface.

Changing font/size/window must not invalidate durable reading anchors.

### Fixed-layout EPUB

Treat like fixed pages. Do not expose reflow typography that cannot work.

### Text PDF

Text layer, selection, search, and geometry must be validated with the chosen PDF engine.

### Scanned PDF before OCR

The product must not pretend that text exists.

Normal page viewing is still required.

Text-bound features remain unavailable or explicitly degraded until OCR.

### Scanned PDF after OCR

Text-dependent features become available only if M0 proves acceptable:

- recognition;
- reading order;
- bounding boxes;
- correction mapping;
- jump-back.

### TXT

Use normalized text/paragraph anchors.

### Annotation distinction

`Annotation`, `Excerpt`, and `Note` are separate entities.

A free-standing Note may exist even where text selection is not available, but the matrix does not promise a rich text-bound annotation workflow before OCR.

### View modes

Exact renderer support and UX details are finalized during M0. If a selected engine cannot reliably support a required mode for a specific format, the mismatch must be surfaced before architecture lock rather than silently removed from V1.
