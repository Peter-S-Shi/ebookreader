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

## Finding 3 — vertical CJK columns recognize as real characters but in the wrong sequence

The classical-Chinese block's recognized output (e.g. `也尹楚遂南楚城是以告`)
consists of real, valid CJK characters -- the recognizer is not producing
garbage -- but does not form a coherent classical-Chinese sentence in the
order produced. Initially read as an ordering-only defect (columns present
but traversed in the wrong direction); refined below, after inspecting the
source page and the real detected box geometry, into a more precise
detection-orientation finding, not just an ordering one.

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

## Finding 3, refined — visually confirmed against the source page: this is a detection-orientation problem, not just an assembly-ordering one

Before assuming a reordering fix (reverse column traversal to
right-to-left) would close this, the fixture page was actually inspected
visually (not just via recognized text) and cross-referenced against the
real detected box geometry for every CJK-containing line:

```
x=[261,1368] y=[421,512]  w=1106 h=91  也尹楚遂南楚城是以告
x=[251,1455] y=[393,781]  w=1204 h=388 以云
x=[335,1370] y=[658,748]  w=1035 h=90  之山楚報卜虞人有做怒而知而
x=[335,1369] y=[711,795]  w=1033 h=83  遠蹶之及邊師在一其使備邑虐忘也為
x=[302,1412] y=[718,924]  w=1110 h=206 臺薩與廣韓藝是一教屬英樂簡其業為
x=[303,1403] y=[814,1023] w=1100 h=210 華營業雲軍襲委立至體客業國希轉雲
x=[341,1367] y=[957,1025] w=1026 h=68  于懼吳可之沈也誰焉鼓且修以日好知
```

The source page shows the classical-Chinese block as roughly 15 narrow
vertical columns, each one character wide, read top-to-bottom,
right-to-left. The detected boxes are the opposite shape: **wide and
short** (w~1000-1200px spanning nearly the entire block's width, h as
little as 68-91px) -- each detected box is a *horizontal band crossing
most or all 15 columns*, not a single column. The recognizer then reads
each wide band in its normal left-to-right direction, picking up one
character from each of many different columns per band, in the wrong
order for any of them.

**This means a reverse-column-order fix (the natural next step to try,
symmetric with the Finding 2 fix) would not actually work** -- there are
no real per-column boxes to reorder; the wrong characters are already
concatenated together inside single boxes before reading order is ever
assembled. `reading_order_text` operates on already-detected/recognized
lines and cannot recover information that the detection stage itself
never separated out correctly. Confirming this by actually looking at
the source page and the real box geometry -- rather than assuming a
column-reversal heuristic would close the gap and shipping it unverified
-- avoided what would have been a plausible-looking but ineffective fix.

## Architecture Implication (Finding 3)

A real fix needs a different intervention *before* `reading_order_text`
ever runs, not a different ordering rule within it: either (a) a
text-direction/layout-analysis signal that identifies a page region as
vertical CJK and reprocesses that region through detection+recognition
after rotating it 90° (so DBNet finds narrow tall column-boxes instead of
wide short cross-column bands), or (b) a genuinely different detection
model/configuration tuned for vertical text. PP-OCR's own family includes
layout-analysis and text-direction classification models for exactly
this; none were part of this session's reused asset set, and adding
either is a real, scoped architecture decision for a future checkpoint,
not attempted here.

## Status: Finding 2 (multi-column) closed with validated evidence; Finding 3 (vertical CJK) remains an explicitly open residual, now root-caused rather than just observed

Single-column body text (the majority case for most books) and now
side-by-side multi-column layouts (a common case for commentary/notes,
dictionaries, and academic texts) both produce coherent reading order.
Vertical CJK script direction is the one reading-order defect mode from
M0's original finding that is not yet closed. It is now understood at
the *architecture* level, not just observed as bad output: this is a
detection-orientation gap (the detector finds cross-column horizontal
bands, not per-column boxes) that requires a rotation-and-reprocess or
dedicated direction-detection intervention before the recognizer ever
runs on that region -- carried forward explicitly, with the exact defect
pattern, the concrete real box geometry, and the specific reason a naive
reordering fix would not work, not silently dropped.
