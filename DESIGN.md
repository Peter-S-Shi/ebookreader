# EbookReader V1 Design Authority

Status: **Frozen V1 UI Baseline**

Canonical visual prototype:

`docs/design/EbookReader_UI_Prototype_v0_5.html`


This document defines the accepted product-local design language, canonical surface compositions, derived-screen rules, interaction patterns, typography/font boundaries, and human acceptance requirements.

## Authority Boundary

This file owns V1 UI and interaction semantics.

It may reference product/domain behavior from `PRODUCT_SPEC.md`, but must not redefine it.

Implementation deviations must first be classified as:

1. **Implementation mismatch**
2. **Renderer / framework constraint**
3. **Intentional design amendment**

Implementation convenience is not permission to silently simplify frozen UI authority. Intentional design amendments require a human gate and must update this file before acceptance.

---

## 1. Governing Design Principle

> **Quiet Surface, Living Motion**

At rest:

- minimal visual noise;
- restrained borders;
- limited card density;
- generous reading space;
- content dominance;
- low dashboard feeling.

In motion:

- gentle glide;
- unfold/reveal;
- subtle focus/elevation;
- light dissolve/recede;
- restrained page-turn feedback.

Motion is communicative, not decorative.

---

## 2. Information Architecture

Top-level Management navigation:

```text
Library
Notes
Calendar
Data
Settings
```

Not top-level:

- Reader;
- Book Details;
- OCR;
- Bilingual Reading;
- Notebook;
- Search;
- Alignment inspection.

These belong to Book/contextual workflows.

---

## 3. Canonical Surface Registry

| ID | Surface | Authority | Main Rule |
|---|---|---|---|
| `ER-LIB-001` | Library | CANONICAL | Book-first, low-dashboard library |
| `ER-READER-001` | Reader | CANONICAL | Central reading surface + optional left/right context |
| `ER-FOCUS-001` | Focus Reading | CANONICAL | Side context glides away; content dominates |
| `ER-TYPE-001` | Reader Typography | CANONICAL | `Aa` panel; format-aware typography |
| `ER-BOOK-001` | Book Details | CANONICAL | Reading/file/OCR summary without admin-dashboard feel |
| `ER-OCR-001` | OCR Workspace | CANONICAL | Page selection + job state + correction |
| `ER-BI-001` | Bilingual Reading | CANONICAL | Two independent Books, synchronized navigation |
| `ER-NOTES-001` | Global Notes | CANONICAL/PATTERN | List-first cross-book reading assets |
| `ER-CAL-001` | Calendar | CANONICAL/PATTERN | Planned Book Hours vs Actual Reading Time |
| `ER-DATA-001` | Data / Recovery | CANONICAL | Safety center; backup/restore/relink/destructive data |
| `ER-SET-001` | Settings | CANONICAL | Compact user preferences + About & Updates |

The v0.5 prototype contains the accepted overall composition. A production implementation may adapt exact spacing/font metrics to the native desktop framework, but must not silently replace the composition model.

---

## 4. Library

The Library is the app home.

Primary hierarchy:

1. Continue Reading (small, 1–3 items);
2. Library controls;
3. book grid/list;
4. completion/progress metadata.

Do not turn the landing page into:

- KPI dashboard;
- analytics wall;
- recommendation feed;
- large habit tracker.

Completion stamp is restrained and bookish, not game-like.

---

## 5. Reader

Normal composition:

```text
┌─────────────────────────────────────────────────────────┐
│ compact book toolbar                                    │
├────────────┬───────────────────────────┬────────────────┤
│ Contents   │       Reading Surface     │ Notebook       │
│ optional   │                           │ optional       │
├────────────┴───────────────────────────┴────────────────┤
│ progress / read state / time                            │
└─────────────────────────────────────────────────────────┘
```

Rules:

- Reading surface is visually primary.
- Left/right panels are collapsible.
- Side panels glide, not abruptly pop.
- Reading surface background must remain continuous around all rendered content.
- Reader chrome is lower-noise than Management surfaces.

---

## 6. Focus Reading

Focus mode:

- side panels hidden;
- minimal reader chrome;
- no unrelated management navigation;
- background/surface contrast remains subtle;
- no modal dashboard overlay.

Focus is an interaction state, not a separate product area.

---

## 7. Format-Aware Reader Controls

### Reflowable EPUB / TXT

Expose:

- Search;
- `Aa`;
- Bookmark;
- Notebook;
- view mode where supported;
- More.

### PDF

Expose:

- Search;
- zoom;
- fit page / fit width;
- OCR when relevant;
- Bookmark;
- Notebook;
- More.

Do not show reflowable font-family controls for ordinary PDF/scanned PDF.

### Scanned PDF without OCR

Truthful state:

```text
Text unavailable · Run OCR
```

Do not show empty search as if no match exists.

---

## 8. Typography UI

Primary reader entry: `Aa`.

Hierarchy:

```text
Typography

Font
Publisher / Original

Recommended
System Fonts
Custom Fonts

Size
Line Height
Page Width
Margins

Advanced
CJK Font Override
```

Global defaults live in Settings → Typography.

Per-Book overrides live in Reader `Aa`.

### Font source labels

```text
PUBLISHER
BUILT-IN
SYSTEM
CUSTOM
```

The labels communicate provenance/ownership, not quality.

---

## 9. Font Rights Boundary

### PUBLISHER

Use within the publication.

Do not extract embedded font assets into the global font library.

### BUILT-IN

Only fonts with verified redistribution permission may ship with EbookReader.

### SYSTEM

Use fonts installed on the user's OS.

Do not redistribute system font files.

### CUSTOM

User-supplied local fonts.

Do not silently embed/distribute them in exports.

Font usability and font redistribution permission are separate concerns.

---

## 10. OCR Workspace

Canonical structure:

```text
Toolbar / OCR scope
    ↓
Page thumbnail grid
    +
job/status/correction side region
```

V1 scope choices:

- Current Page;
- Selected Pages;
- Entire Book.

Selected Pages supports:

- thumbnail multi-select;
- page-range input.

Job states:

- Ready;
- Running;
- Paused;
- Cancelled;
- Failed;
- Complete.

### OCR Complete

Completion must be visually explicit:

```text
✓ OCR complete
```

Rules:

- success icon;
- stable semantic success color;
- progress at 100%;
- Pause/Cancel disappear after terminal completion;
- next action may be Review Corrections.

Success color is semantic and must not be replaced by user Accent.

---

## 11. Bilingual Reading

Canonical structure:

- two equal reading panes;
- one independent Book per side;
- synchronized navigation;
- explicit sync on/off;
- side swap;
- alignment-status inspection;
- bounded long-book Contents navigation (intentional V1 design amendment);
- each side keeps its own Note/Excerpt/Annotation actions.

The UI must communicate:

> synchronized navigation, independent Book data.

Alignment inspection may surface mismatch/review status.

It must not become an editor in V1.

Both reading panes require visible usable vertical scrolling where content exceeds the viewport.

### Intentional V1 Design Amendment: Long-Book Contents Navigation

A compact toolbar entry ("Contents") opens a collapsible drawer allowing structure inspection and navigation of either the Left or Right Book using real source structure:

- **EPUB**: source TOC items and section index list;
- **PDF**: page outline and 1..N page navigation;
- **TXT / Unstructured**: truthful "No contents available for this source".

Clicking a Contents item navigates that specific Book's scroller to the destination offset. When Sync is ON, the counterpart pane continues following the existing scroll-ratio synchronization. When Sync is OFF, only the targeted Book navigates, keeping the counterpart independent. This amendment does not introduce chapter-alignment semantics, modify Alignment Package schema, infer fake TXT chapters, or replace scroll-ratio sync.

---

## 12. Global Notes

List-first, not card-wall.

Filters:

- All;
- Notes;
- Excerpts;
- Highlights/Annotations.

A result can:

- show Book/source context;
- open the source Book at `DocumentLocation`.

Do not turn Global Notes into a general-purpose knowledge-base editor.

---

## 13. Calendar

Calendar answers:

> What did I plan, and what reading actually happened?

Primary metrics:

- Planned Book Hours;
- Actual Reading Time.

Do not copy enterprise calendar/dashboard patterns or gamify heavily.

---

## 14. Data / Recovery

The Data surface is a safety center.

Primary groups:

- Library Health;
- Backup & Restore;
- Book Data;
- Relink;
- destructive data operations;
- OCR cache;
- Search index.

Restore must always Preview before replacement.

Manual completed-read adjustment must warn that:

- active progress is cleared;
- Actual Reading Time stays unchanged;
- ReadingSession history stays unchanged.

The page may be technical enough to be trustworthy, but should remain understandable to a non-engineer.

---

## 15. Settings

Canonical subsections:

```text
Appearance
Reading
Typography
Sound & Motion
Files & Data
About & Updates
```

### Appearance

- System / Light / Dark;
- constrained presets;
- Accent;
- Background;
- Surface;
- Text;
- Auto Contrast Guard.

### Reading

Only V1-approved timing toggles.

### Typography

Global reading defaults and font-source model.

### Sound & Motion

- Page Turn Sound On/Off;
- Standard / Reduced Motion.

### Files & Data

- default import mode;
- managed-library location;
- link to Data center.

### About & Updates

- current version;
- Stable release channel;
- Check Now;
- automatic background update-awareness toggle;
- Up To Date / Update Available / Check Failed.

V1 does not advertise silent auto-install.

---

## 16. Theme Architecture

Customization is semantic, not arbitrary paint.

User-controlled dimensions:

- Accent;
- Background;
- Surface;
- Text.

Accent may affect:

- primary action;
- selection;
- focus;
- progress;
- links;
- restrained active states.

Accent must not redefine:

- success;
- warning;
- danger;
- error;
- OCR completion.

Contrast Guard protects text-bearing combinations.

---

## 17. Motion System

Use a compact motion vocabulary.

### Enter / Navigate → Glide

Use for:

- Library → Book;
- panel transitions;
- contextual workspace change.

### Reveal → Unfold / Glide

Use for:

- Notebook;
- Typography panel;
- Settings/inspection surfaces.

### Focus → Slight Elevation

Use for:

- hovered/selected Book;
- active context.

### Dismiss → Recede / Dissolve

Use for:

- temporary panels;
- contextual dismissal.

### Page Turn

Gentle perspective/translation only.

Avoid theatrical page-curl simulation.

### Reduced Motion

Honor OS reduced-motion preference and product Reduced setting.

---

## 18. Sound

Page-turn sound is optional.

Design intent:

- short;
- soft;
- paper-rustle-like;
- local/offline;
- no external network asset.

Sound must have an immediate On/Off control and a Settings preference.

---

## 19. Empty / Loading / Error / Degraded States

Every major surface must define these states before being called UI-complete.

Examples:

- Library empty;
- import in progress;
- file missing;
- unsupported/corrupt book;
- no search index;
- scanned PDF without OCR;
- OCR failed;
- alignment invalid;
- backup invalid;
- restore conflict;
- update check failed/offline.

Never confuse:

```text
no data
```

with:

```text
data unavailable
```

or:

```text
operation failed
```

---

## 20. Derived Screens

Not every V1 workflow requires a standalone visual prototype.

The following may be derived from accepted patterns:

- import confirmation;
- duplicate-file confirmation;
- start-next-read prompt;
- Reading Checkpoint;
- Collection management;
- Search results;
- Alignment Package import validation;
- Remove from Library confirmation;
- Delete Reading Data confirmation;
- generic progress/partial-success dialogs.

Derived screens must reuse:

- existing typography;
- button hierarchy;
- semantic colors;
- modal/drawer patterns;
- motion rules;
- safety language.

They may not invent a second design language.

---

## 21. Design-to-Implementation Trace

Before implementing a UI-affecting milestone, the agent should state:

```text
Design authority
→ affected canonical/pattern surfaces
→ concrete implementation mapping
```

At delivery, reverse-map:

```text
Implemented UI
→ DESIGN authority
→ implementation freedom used
→ human visual acceptance status
```

Reading `DESIGN.md` alone is not evidence of design alignment.

---

## 22. Visual Completion Rule

Automated tests can prove:

- components exist;
- semantic tokens resolve;
- controls are format-aware;
- basic contrast/state rules;
- layout invariants.

Automated tests cannot prove:

- visual coherence;
- spacing comfort;
- reading dominance;
- faithful canonical composition;
- motion feel.

A UI surface is not visually complete until:

1. implementation runs;
2. structural checks pass;
3. the real native window is reviewed;
4. a human accepts it.

---

## 23. Forbidden Design Drift

Do not silently:

- replace the left navigation with top browser tabs;
- turn Library into a KPI dashboard;
- make Reader chrome dominant;
- turn Notebook into a Notion clone;
- turn Calendar into enterprise scheduling;
- turn Data into a developer console;
- turn OCR into a full document editor;
- turn Alignment into an authoring tool;
- replace subtle motion with decorative animation;
- hide format limitations behind controls that do nothing.
