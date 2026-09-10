# EbookReader — Human Acceptance Defect Register #1

Written: 2026-09-10. Source: a real human click-through of the native Tauri desktop app against the second Feature Complete Candidate (`FEATURE_COMPLETE_CANDIDATE_REPORT.md`, commit `1932414`). This register exists because that candidate report named an explicit open residual — native/manual GUI click-through against `MANUAL_QA.md` had not been performed in the sandbox — and this is the user's own real-desktop pass closing that gap, ahead of and independent of `ROADMAP.md`'s formally-later "Full Regression & Human Acceptance" phase (which sits after M9 Product Hardening). This register does **not** move that formal phase earlier; it records defects found while gathering the human-acceptance evidence the second candidate was still missing.

**Status semantics (exact, not to be collapsed):** `IMPLEMENTED / READY FOR HUMAN RETEST` means a corrective code change plus automated-test and source-level engineering evidence exist. It is explicitly **not** `HUMAN-ACCEPTANCE CLOSED` — only the user's own real native Tauri desktop retest can close an item, per `MANUAL_QA.md`'s own QA Evidence Classes distinguishing engineering evidence from human acceptance evidence. Browser-pane/live web-preview visual verification and `vitest`/`cargo test` runs are real engineering evidence, not a substitute for that retest.

## Register

| ID | Severity | Symptom | Status | Commit |
|---|---|---|---|---|
| HA-001 | P2 UI | Library's left side shows a meaningless isolated bullet marker in every state (empty, populated, Collection-filtered) | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |
| HA-002 | P0 BLOCKER | Fresh EPUB first open: TOC visible, body text blank until a chapter is clicked | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |
| HA-003 | P2 UI | Contents panel: title and Close control visually merge ("ContentsClose") | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |
| HA-004 | P1 UX | Reader toolbar crowds/breaks under a long Book title | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |
| HA-005 | P1 UX | Settings renders as unstyled native form elements, no grouping | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |
| HA-006 | P1 UX | Reader's Aa Typography overlay is oversized; shell not adapted per host context | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |
| HA-007 | P0 BLOCKER | Dark app theme: EPUB body text stays unreadable (dark-on-dark) | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |
| HA-008 | P0 BLOCKER | Settings: Typography panel pinned over the top, Appearance/About/Actual Reading Time unreachable | IMPLEMENTED / READY FOR HUMAN RETEST | `1814a40` |

All 8 corrective changes landed together as one commit (`1814a40`, "Human Acceptance Corrective Batch #1"), verified by GitHub Actions CI run `34497573797` (Frontend and Rust jobs green) and reviewed via `/code-review` (Standards axis: no hard violations, three minor judgement-call notes on cross-language color-constant duplication, a `foliate-js init()` integration-point nit, and CSS-selector/markup coupling — none blocking; Spec axis: all 8 rows addressed, zero scope creep, one design-tradeoff note on HA-007 that the spec itself does not require different treatment for).

## Failure Attribution per item (earliest-wrong layer)

- **HA-001**: Frontend/CSS — two Library `<ul>` elements had no `list-style: none` rule (one had no class at all; one had a class with no matching CSS rule).
- **HA-002**: Frontend integration — `foliate-js`'s `view.open()` only sets up the renderer; it never renders any section by itself. No navigation call ever fired when there was no saved location and no Search/Notes jump target.
- **HA-003**: Frontend composition/CSS — a knock-on effect of the same fixed-offset assumption behind HA-004's root cause (see below); explicit header gap added as a second, independent safeguard.
- **HA-004**: Frontend layout/responsive composition — the toolbar title had no truncation and no shrink constraint.
- **HA-005**: UI composition — `.settings-panel` had zero CSS rules defined anywhere.
- **HA-006**: Component composition — the shared `TypographyPanel`'s CSS had one absolutely-positioned rule with no size cap, correct only for the Reader's floating-overlay use.
- **HA-007**: Reader theme propagation — `foliate-js` renders each EPUB section into an isolated document the app's `data-theme`/`prefers-color-scheme` CSS cascade cannot reach.
- **HA-008**: CSS/component composition — `.typography-panel`'s only rule was `position: absolute; top: 3em; right: 1em; z-index: 10`, applied unconditionally to both the Reader-overlay and Settings-inline hosting contexts.

## Minimal real-desktop retest checklist

Each item below is the smallest action that exercises the fixed code path in the actual native Tauri window (`start-dev.bat` or `npm run tauri dev`), matching each row's own Acceptance / Exit Evidence column from the original defect table.

1. **HA-001** — Open Library with zero Books, then import one Book, then create a Collection and filter to it. At every step: confirm no stray bullet/marker appears to the left of the Library content.
2. **HA-002** — Import a brand-new EPUB that has never been opened before (no saved reading position). Open it directly from the Library (not via Search/Notes). Confirm real body text is visible immediately, without first clicking a Contents entry. Then confirm existing behavior is unchanged: reopen a Book with a saved position (resumes there) and open one via a Search or Notes jump (jumps to that exact location).
3. **HA-003** — Open an EPUB with a populated Contents/TOC, click "Contents". Confirm the panel's title ("Contents") and its "Close" button are visually separated, not touching or overlapping.
4. **HA-004** — Open a Book with a long title (or rename one via Edit Title to something long). Confirm the title truncates (hover shows the full title as a tooltip) and every toolbar control (Focus, Contents, Aa, Sound, Notebook) remains visible and clickable.
5. **HA-005** — Open Settings. Confirm each section (Appearance, About & Updates, Actual Reading Time, Typography, Sound & Motion, Reading Checkpoint, Files & Data) renders as a visually distinct, spaced, grouped card rather than a flat list of raw controls.
6. **HA-006** — Open a Book, click "Aa". Confirm the Typography overlay is compact (does not dominate the reading surface) and scrolls internally if its content exceeds the panel height. Then open Settings -> Typography and confirm it renders inline in the page (not as a floating overlay), independent of the Reader's overlay behavior.
7. **HA-007** — Set Settings -> Appearance -> Theme to Dark. Open an EPUB. Confirm body text is clearly readable (light text on a dark background), including after navigating via Contents. Then switch Theme to Light and confirm the Book returns to normal (non-forced) coloring, and to Match System and confirm it follows the OS's current light/dark preference.
8. **HA-008** — Open Settings. Confirm Appearance is visible at the real top of the page, and scrolling down reaches About & Updates, Actual Reading Time, Typography, Sound & Motion, Reading Checkpoint, and Files & Data in order, with Typography never overlapping or hiding any other section. Then open a Book and confirm Reader's own Aa overlay still opens/closes normally.

A user checking off all 8 above as passing is what moves this register's status column from `IMPLEMENTED / READY FOR HUMAN RETEST` to `HUMAN-ACCEPTANCE CLOSED` — that transition is not self-granted by this session.
