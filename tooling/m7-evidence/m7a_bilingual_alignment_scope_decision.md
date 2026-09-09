# M7a — Bilingual Alignment Package: closing the FORMAT_CAPABILITY_MATRIX 🧪 markers

## Question

`FORMAT_CAPABILITY_MATRIX.md` marks "Bilingual Alignment Package" `🧪`
(M0-evidence-required before implementation lock) for Reflowable EPUB,
Text PDF, Scanned-PDF-post-OCR, and TXT. No M0 spike, and no later
Milestone's evidence, ever covered this feature specifically. Before
building M7 past that marker, the question this note answers: **what
evidence licenses closing the 🧪 marker for these four formats, and
what should the accepted V1 design actually be?**

## Evidence

Bilingual Reading's own frozen scope (`PRODUCT_SPEC.md` SS14) already
excludes the hard part: "V1 does not provide alignment authoring,
mapping drag/drop, or sentence re-segmentation tools." The Alignment
Package is externally authored; EbookReader only *consumes* one. Given
that, what "supports Bilingual Alignment Package" for a format actually
requires, per `ROADMAP.md` M7's own Success Evidence list (source/
fingerprint validation, independent vertical scroll, sync on/off, side
swap -- notably *not* per-paragraph click-to-align highlighting), is:
can this format's real text be extracted and displayed in an
independent reading pane?

That question already has real, tested evidence, reused rather than
re-derived:

- **TXT**: `TxtReader.tsx` already decodes the whole file as UTF-8 text
  directly (`src/TxtReader.tsx`); this is the plainest possible case.
- **Reflowable EPUB**: `Reader.tsx`'s own Library-wide Search indexing
  loop already opens the Book via foliate-js and extracts each
  section's `doc.body.textContent` (`src/Reader.tsx` lines ~133-149) --
  real per-format text extraction, already exercised on every EPUB this
  app opens, not a new untested path.
- **Text PDF**: `PdfReader.tsx`'s own Search-indexing loop already calls
  `pdfjs-dist`'s `page.getTextContent()` per page (`src/PdfReader.tsx`
  lines ~114-129) -- same story.
- **Scanned PDF post-OCR**: M5 built `get_ocr_effective_text_command`,
  which returns exactly the recognized/corrected text per page --
  already the same kind of plain-text string the other three formats
  produce.

None of these are new pipelines; each is the exact extraction path
already shipped, tested, and running in production for Library-wide
Search (M4) or OCR (M5).

## Finding

A dual independently-scrolled plain-text pane, synchronized by
**scroll-position ratio** (not per-paragraph anchor jump), is both
sufficient for M7's actual Success Evidence and consistent with the
accepted `docs/design/EbookReader_UI_Prototype_v0_5.html#bilingual`
prototype's own reference implementation, which uses exactly this
mechanism (`syncScroll`, a ratio of `scrollTop` over
`scrollHeight - clientHeight`, not a `data-align` anchor lookup) for its
"sync on/off" behavior. Per-paragraph `data-align` click-to-highlight
*is* present in the prototype's markup, but ROADMAP.md M7's Success
Evidence list does not name it, and building real cross-format
paragraph-boundary alignment (matching arbitrary externally-authored
paragraph indices to arbitrary EPUB/PDF/TXT internal structure) would be
a materially larger, unvalidated architecture commitment -- exactly the
kind of thing a 🧪 marker exists to gate, not something to build
speculatively past what the Milestone actually requires.

## Architecture Implication

`crates/domain/src/alignment.rs`'s `AlignmentMapping` is deliberately
read-only and display-only: it records a structural "ok" (1:1) vs.
"review" (many-to-one/one-to-many) status per mapping row for the
Alignment panel's "alignment status inspection" bullet, and is never
consulted by the scroll-sync logic. `BilingualReader.tsx` extracts full
plain text per side (reusing the paths above) into two independent
`<div>` panes with native browser scrolling, and syncs them by the same
ratio formula as the prototype.

## ACCEPT / MODIFY / REJECT

**ACCEPT** scroll-ratio synchronization as the V1 Bilingual Reading
mechanism for all four 🧪-marked formats (Reflowable EPUB, Text PDF,
Scanned-PDF-post-OCR, TXT), closing the `FORMAT_CAPABILITY_MATRIX.md`
🧪 markers on the evidence above.

**Residual, explicitly carried forward, not silently dropped**:
per-paragraph click-to-highlight alignment (the prototype's `data-align`
interaction) is not built. If a future Milestone needs it, it requires
its own real architecture decision (how to map an externally-authored
package's paragraph indices onto each renderer's actual internal
structure per format) -- not a natural extension of this scroll-ratio
mechanism.
