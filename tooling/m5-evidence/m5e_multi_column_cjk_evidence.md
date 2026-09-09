# M5-E: real evidence for the M0-carried multi-column / vertical-CJK reading-order residual

M0's corrective evidence pass established (via manual inspection of real
pages) that OCR reading order breaks down on multi-column layouts and
vertical classical-Chinese text, and carried this forward as a residual
for M5 to own. This checkpoint runs the now-real, now-production
`OcrEngine` + `reading_order_text` against the exact fixture M0 used for
that finding (`fixtures/ocr_real/ia_200.jpg` -- see `SOURCE.md` in that
directory: a real, public-domain 1893 page with vertical classical-Chinese
columns, an English translation, and a two-column English commentary
block, genuinely degraded by 130+ years of print/scan artifacts) to
replace the earlier qualitative finding with concrete, reproducible text
output.

## Result

73 lines detected and recognized. Full output in the test itself
(`crates/domain/src/ocr_engine.rs`,
`processes_a_real_multi_column_cjk_page_and_surfaces_its_text`, run with
`--nocapture`). Three distinct findings, by region:

## Finding 1 — single-column English body text recognizes coherently

The English translation block (e.g. "5 In autumn, in the seventh month,
the duke arrived from Tsin.") recognizes as real, readable English
sentences. The only defect is the already-known, already-carried
word-boundary spacing loss (e.g. "the earl of Ts'in died" comes out as
`TheearlofTs'indied.`) -- not a new finding, just confirmed again on this
harder fixture.

## Finding 2 — the two-column English commentary genuinely splices, exactly as predicted

The commentary block below the translation is laid out as two side-by-side
columns. `reading_order_text`'s row-bucket-then-left-to-right heuristic
buckets both columns' lines at the same height into one row and emits them
left column first, then right column, which is only correct if the
intended read order actually is "left line N, right line N, left line
N+1, right line N+1, ..." -- it is not; the two columns are two
independent paragraphs meant to be read one to completion before the
other. The real output shows exactly this splice, e.g.:

```
Par.1.Seetheaccountoftheformationof
disbandingofthemiddlearmy.Wehavedis-
TheChuenheresays:-'Thedisbandingofthe
the3dorarmyofthecentreunderIX.xi.1.
```

Line 1 and line 3 continue one column's paragraph ("Par. 1. See the
account of the formation of ... the disbanding of the ..."); line 2 and
line 4 continue the other column's ("disbanding of the middle army. We
have dis- ... the 3d or army of the centre under IX.xi.1."). Reading the
assembled text in order does not reproduce either paragraph -- this is
the multi-column splicing failure mode named (but not previously shown)
in `PROJECT_STATUS.md`'s carried residuals, now demonstrated on a real
page with real recognized text, not asserted from a hypothetical.

## Finding 3 — vertical CJK columns are recognized but ordered wrong

The classical-Chinese block (rows of pure CJK characters in the raw
output) is genuinely legible text, character-for-character -- but the
classical convention is columns read top-to-bottom, columns ordered
**right-to-left**. `reading_order_text` has no script-direction awareness
at all: it buckets by y-center then sorts **left-to-right**, which is the
wrong column order for this script, and if a single detected box spans
more than one character vertically (recognized top-to-bottom internally
by the recognizer, since it reads along the box's long axis) that
substring is then placed into a left-to-right column sequence that should
have been right-to-left. The real output (e.g. `也尹楚遂南楚城是以告`) does
not form a coherent classical-Chinese sentence in the order produced.

## Architecture Implication (Finding 2)

`reading_order_text`'s original heuristic (row-bucket by median line
height, then left-to-right) was confirmed -- not just suspected -- to be
insufficient for multi-column layouts: two side-by-side columns'
lines at the same height get interleaved row-by-row instead of each
column being read to completion.

## Fix (Finding 2) — column-aware ordering, validated against the real fixture

Replaced the flat row-bucket ordering with a two-level one: `assign_columns`
clusters lines into columns by looking for gaps in the *sorted sequence of
line horizontal centers* wider than 3x the page's median line height (a
real column gutter reliably produces a much bigger jump than ordinary
within-column spacing or paragraph indents). Lines are then ordered by
column (left to right), and within a column by row (top to bottom, then
left to right for same-row jitter) -- each column is read to completion
before the next starts.

This specifically avoids a simpler but riskier approach (clustering by
extending each column's x-range/bounding-box envelope): a stray full-width
line -- a header, footer, or page number spanning most of the page --
would make that approach merge two real columns into one by "swallowing"
the gap between them. Clustering by sorted-center gaps instead means a
full-width line only affects its own position, never merges two real
columns; a synthetic regression test
(`a_full_width_header_does_not_merge_two_real_columns`) locks this in.

Re-ran the real pipeline against `ia_200.jpg` with the fix in place. The
two-column commentary block that previously spliced now reads as two
coherent, continuous paragraphs, each read to completion:

> Par.1.Seetheaccountoftheformationof TheChuenheresays:-'Thedisbandingofthe
> the3dorarmyofthecentreunderIX.xi.1. armyofthecentrewastoreduce[still]lower
> theducalHouse.Thedisbandingwas[pro-]posed]atthehouseoftheShefamily,and
> determinedonatthatoftheTsang.'Formerly,whenthearnyofthecentrewas
> firstconstituted,theducalIlousewas[asit were]dividedintothreeparts,...

(word-spacing loss is the separate, already-known Finding 1 defect, not a
new one) -- and the second column separately, also coherent, starting
"disbandingofthemiddlearmy.Wehavedis-...". A synthetic two-column
regression test (`column_clustering_separates_two_side_by_side_columns`)
covers this in CI without needing model assets. **Multi-column English
splicing: fixed and validated, not just theorized.**

## Fix status for Finding 3 (vertical CJK) — still open

Column clustering does not address script direction: columns are still
read left-to-right, top-to-bottom-within-column, which remains wrong for
vertical classical Chinese (should be right-to-left column order). The
real output for that block is unchanged by this fix and still does not
form a coherent sequence. A real fix needs a script-direction-aware
ordering mode, likely gated on some signal of "this page/region is
vertical text" -- PP-OCR's own family includes layout-analysis and
text-direction models that were not part of this session's reused asset
set, and remains a real, scoped follow-up decision, not assumed or
attempted here.

## Status: Finding 2 (multi-column) closed with validated evidence; Finding 3 (vertical CJK) remains an explicitly open residual

Single-column body text (the majority case for most books) and now
side-by-side multi-column layouts (a common case for commentary/notes,
dictionaries, and academic texts) both produce coherent reading order.
Vertical CJK script direction is the one reading-order defect mode from
M0's original finding that is not yet closed -- carried forward
explicitly, with the exact defect pattern and a concrete next step named,
not silently dropped.
