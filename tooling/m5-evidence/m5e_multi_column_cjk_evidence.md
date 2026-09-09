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

## Architecture Implication

`reading_order_text`'s current heuristic (row-bucket by median line
height, then left-to-right) is confirmed -- not just suspected -- to be
insufficient for both multi-column layouts and vertical CJK script. A
real fix needs, at minimum: (a) column detection/grouping (cluster boxes
into columns by x-position before ordering, and fully order one column
before starting the next, rather than interleaving by row) and (b) a
script-direction-aware ordering mode (right-to-left column order, and
top-to-bottom-within-column, for vertical CJK), likely gated on some
signal of "this page/region is vertical text" -- PP-OCR's own family
includes layout-analysis and text-direction models that were not part of
this session's reused asset set and are a real, scoped follow-up
decision, not assumed here.

## Status: residual explicitly confirmed with evidence, not yet closed

This checkpoint does not close M0's multi-column/vertical-CJK residual --
it replaces an assumed failure mode with a concretely demonstrated one on
the real fixture M0 originally used, with the exact defect pattern
identified for whoever picks up the layout-analysis work next. Single-
column body text (the majority case for most books) is unaffected by
either finding.
