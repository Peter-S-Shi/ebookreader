# EbookReader V1 Manual QA Plan

Status: **Planning Baseline**


This file defines high-value human acceptance journeys. Automated tests complement this plan but cannot replace it.

## QA Evidence Classes

Manual QA depth scales with risk and promotion level.

### Checkpoint / Promotion-Unit Evidence

Use focused manual acceptance only when the active risk requires it, such as native visual behavior, renderer-specific interaction, destructive data, file-system boundaries, OCR quality, or migration/recovery.

Routine low-risk code checkpoints do not require ceremonial manual QA.

### Milestone Exit Evidence

Use cross-feature workflow acceptance where the Milestone contract requires it.

### Feature Complete / Hardening / RC Evidence

Use progressively broader regression and real-environment acceptance, including native Windows behavior, packaging/install, backup/restore, recovery/destructive flows, and offline/update-awareness behavior.

Automated tests remain evidence, not truth, and never replace human acceptance where the contract requires human evidence.

---

## 1. QA Philosophy

Manual QA focuses on boundaries that are difficult to prove through unit tests alone:

- real document rendering;
- visual comfort;
- file/path behavior;
- long-running reading;
- OCR;
- recovery;
- packaging;
- human-understandable states.

A release claim requires both automated evidence and human acceptance.

---

## 2. Test Materials

Use synthetic or redistributable test material.

Maintain a representative set:

### EPUB

- English reflowable;
- Chinese reflowable;
- mixed CJK/Latin;
- embedded-font EPUB;
- fixed-layout EPUB;
- large EPUB;
- malformed/edge EPUB.

### PDF

- English text PDF;
- Chinese text PDF;
- large PDF;
- rotated page;
- multi-column;
- scanned English;
- scanned Chinese;
- mixed-language scan;
- poor-quality scan;
- image/caption;
- header/footer.

### TXT

- English;
- Chinese;
- mixed;
- large file;
- newline/encoding variations.

No personal/private source document should become a public fixture.

---

# 3. Library / Import

## QA-LIB-01 Reference Import

1. Import a book as Reference.
2. Confirm original file path remains unchanged.
3. Edit metadata.
4. Restart app.
5. Confirm metadata persists.
6. Confirm original book bytes unchanged.

Pass if no silent source mutation occurs.

## QA-LIB-02 Managed Copy

1. Import as Managed Copy.
2. Confirm managed copy location.
3. Move/delete original source.
4. Confirm managed Book remains usable.

## QA-LIB-03 Duplicate Fingerprint

1. Import a file.
2. Copy same bytes to another path.
3. Import copy.

Expected:

- do not silently create duplicate Book;
- offer Open Existing / Relink / Cancel.

## QA-LIB-04 Missing Reference

1. Import Reference book.
2. Close app.
3. Move source file.
4. Reopen app.

Expected:

- Needs Relink;
- no asset deletion;
- choose same-fingerprint file;
- progress/notes preserved.

## QA-LIB-05 Changed Fingerprint

Relink to a different-content file with similar name.

Expected:

- no silent inheritance;
- explicit replacement/migration workflow.

---

# 4. Reader / UI

## QA-UI-01 Library

Verify:

- low-dashboard feeling;
- book-first hierarchy;
- completion stamps understandable;
- Continue Reading is not visually dominant over the whole library.

## QA-UI-02 Reader

Verify:

- central content dominance;
- Contents and Notebook collapse smoothly;
- reading surface remains continuous around all content;
- no text visually falls outside the reading surface.

## QA-UI-03 Focus

Verify:

- side context disappears;
- minimal chrome;
- returning from Focus restores state.

## QA-UI-04 Motion / Reduced Motion

Verify Standard and Reduced.

Motion must not:

- cause navigation confusion;
- delay interaction;
- trigger layout jump;
- override system reduced-motion preference.

## QA-UI-05 Page Sound

Verify:

- soft;
- brief;
- can be disabled;
- disabled state persists.

---

# 5. Typography & Fonts

## QA-TYPE-01 Publisher Original

Open EPUB with embedded/publisher font.

Expected:

- default can preserve publisher style;
- no extraction into global font library.

## QA-TYPE-02 System Font

Select a Windows-installed font.

Expected:

- reader uses it;
- application does not copy font bytes into product-managed built-in assets.

## QA-TYPE-03 Custom Font

Add local user font.

Expected:

- usable locally;
- provenance shown as CUSTOM;
- no silent embedding into export.

## QA-TYPE-04 CJK Override

Mixed Latin/CJK EPUB.

Expected:

- Latin/body font remains usable;
- CJK override resolves glyph coverage;
- no missing-glyph boxes.

## QA-TYPE-05 Format Awareness

Open PDF/fixed-layout content.

Expected:

- reflow font-family controls are hidden/disabled truthfully.

---

# 6. Progress, Completion & Re-reading

## QA-READ-01 Final Page Completion

Reach final page.

Expected:

- completed count +1;
- completion stamp appears;
- prompt asks whether to start another read.

## QA-READ-02 Decline Next Read

Choose No.

Expected:

- UI remains 100%;
- completed count remains incremented;
- cumulative calculation does not double-count displayed 100%.

## QA-READ-03 Start Next Read

Choose Yes.

Expected:

- new active progress = 0;
- prior completion remains counted;
- cumulative percentage = completed × 100 + active progress.

## QA-READ-04 Backtracking

Jump backward/read old chapter.

Expected:

- no automatic new read;
- no cumulative % inflation.

## QA-READ-05 Manual Override

From Data, change completed count.

Expected:

- explicit warning;
- active progress cleared;
- Actual Reading Time unchanged;
- ReadingSession history unchanged.

---

# 7. Actual Reading Time

## QA-TIME-01 Foreground

Read actively.

Expected: counted.

## QA-TIME-02 Background

Switch app away with background pause On.

Expected: not counted.

## QA-TIME-03 Inactivity

Remain inactive for >5 minutes.

Expected: auto-pause per frozen rule.

## QA-TIME-04 Note-taking

Create notes with Count Note-taking On, then Off.

Expected: derived Actual Reading Time follows policy without corrupting historical facts.

## QA-TIME-05 Sleep / Lock

Lock/sleep Windows.

Expected: always paused.

## QA-TIME-06 Close / Crash Boundary

Close normally and simulate interrupted shutdown in controlled testing.

Expected: session ends or recovers without implausible duration inflation.

---

# 8. Book Hours

## QA-HOURS-01 Base Estimate

Verify Quantity / Speed / Coefficient.

## QA-HOURS-02 Cumulative

For Base = 8h:

- first read 50% → 4h;
- completed once → 8h;
- second read 50% → 12h;
- completed twice → 16h.

## QA-HOURS-03 Revision

Change Workload Category/formula input.

Expected:

- current estimate changes;
- Actual Reading Time does not;
- historical reporting remains explainable.

---

# 9. Notes / Excerpts / Annotations

## QA-NOTE-01 Create Three Asset Types

Create Annotation, Excerpt, Note.

Expected: remain distinct.

## QA-NOTE-02 Global Notes

Search/filter across Books.

Expected: open source location correctly.

## QA-NOTE-03 Relink

Move/relink source file.

Expected: assets preserved.

## QA-NOTE-04 Unresolved Anchor

Force an anchor mismatch.

Expected:

- asset preserved;
- unresolved/orphan state visible;
- no silent deletion.

## QA-NOTE-05 Markdown Export

Export Book Notebook.

Expected:

- readable Markdown;
- source Book/location included as designed.

---

# 10. Search

## QA-SRCH-01 In-book

English / Chinese / mixed.

## QA-SRCH-02 Global

Search across:

- Book text;
- OCR-corrected text;
- Note;
- Excerpt;
- annotation user text.

## QA-SRCH-03 Rebuild

Delete/rebuild derived index.

Expected: canonical user data unchanged.

---

# 11. OCR

## QA-OCR-01 Degraded State

Open scan without OCR.

Expected:

- visual reading works;
- text-dependent features truthfully unavailable;
- no fake empty search.

## QA-OCR-02 Current Page

Run on one page.

## QA-OCR-03 Selected Pages

Select thumbnails and range expression.

Expected: only selected pages processed.

## QA-OCR-04 Entire Book

Run representative multi-page job.

## QA-OCR-05 Pause / Resume / Cancel

Expected: consistent state after each.

## QA-OCR-06 Completion State

Expected:

- 100%;
- success semantic color;
- ✓ OCR complete;
- Pause/Cancel disappear;
- review correction action available.

## QA-OCR-07 Correction Durability

Correct OCR text.

Then:

- rebuild raw OCR cache;
- rebuild search index;
- restart.

Expected: manual correction persists.

## QA-OCR-08 Layout

Use:

- two-column;
- header/footer;
- image/caption;
- mixed CJK/Latin.

Verify reading order and jump-back.

---

# 12. Bilingual Reading

## QA-BI-01 Import / Validate

Import two Books + Alignment Package.

Expected: fingerprint/source validation.

## QA-BI-02 Dual Pane

Verify both panes independently scroll.

## QA-BI-03 Sync

Toggle synchronized navigation.

## QA-BI-04 Swap

Swap sides.

## QA-BI-05 Independent Data

Create notes on each side.

Expected: assets remain attached to their own Book.

## QA-BI-06 Mismatch

Alignment mismatch displays review/status.

Expected: no hidden auto-edit.

---

# 13. Calendar / Goals

## QA-CAL-01 Plan vs Actual

Verify Planned Book Hours and Actual Reading Time are visually and semantically distinct.

## QA-CAL-02 History

Change current Book Hours formula.

Expected: factual historical Actual Reading Time unchanged.

---

# 14. Backup / Restore / Recovery

## QA-BACK-01 App Data Backup

Create backup.

Verify canonical user data included.

Verify Reference source bytes excluded by default.

## QA-BACK-02 Full Library Backup

Verify Managed Copy bytes included.

Explicitly include selected Reference file and verify inclusion is opt-in.

## QA-BACK-03 Restore Preview

Expected:

- timestamp;
- version;
- counts;
- warnings;
- no state changed before confirm.

## QA-BACK-04 Clean Restore

Restore into clean app state.

Verify:

- Books;
- Collections;
- progress;
- completed reads;
- ReadingSessions;
- Notes/Excerpts/Annotations;
- Book Hours;
- OCR corrections;
- Alignment;
- settings.

## QA-BACK-05 Reference Relink After Restore

Expected: Needs Relink where path unavailable; no silent file overwrite.

## QA-BACK-06 Automatic Snapshot

Trigger migration/high-risk mutation.

Expected: recovery snapshot exists before mutation.

---

# 15. Update Awareness

## QA-UPD-01 Up To Date

Stable current version.

Expected: Up to Date.

## QA-UPD-02 Update Available

Remote stable > local.

Expected:

- Update Available;
- latest version;
- release/download action.

## QA-UPD-03 Prerelease / Draft

Expected: ignored.

## QA-UPD-04 Offline

Disable network.

Expected:

- Check Failed/offline state;
- app remains usable;
- reading/data unaffected.

## QA-UPD-05 Startup Background Check

Expected: does not block UI.

## QA-UPD-06 Disabled Auto Check

Turn automatic check Off.

Expected: no startup check; manual Check Now remains possible.

---

# 16. Data Safety

## QA-DATA-01 Remove from Library

Expected: not equivalent to deleting reading data.

## QA-DATA-02 Delete Reading Data

Explicit destructive confirmation.

Expected: no ambiguity about what will be removed.

## QA-DATA-03 Search/OCR Derived Rebuild

Expected: user-authored assets preserved.

---

# 17. Settings

Verify persistence for:

- Appearance;
- Accent/Background/Surface/Text;
- Contrast Guard;
- Reading time toggles;
- Reading Checkpoint;
- Typography defaults;
- Sound;
- Motion;
- default import mode;
- update-awareness preference.

Verify semantic success/warning/danger colors remain independent of Accent.

---

# 18. Feature Complete Human Gate

Before Feature Freeze:

- every canonical surface viewed in real desktop app;
- every primary workflow completed at least once;
- format capability matrix checked against real behavior;
- no required V1 feature exists only in the HTML prototype.

---

# 19. Hardening Regression

During M9, convert discovered release blockers into:

- automated regression test where appropriate; or
- named repeatable manual QA case.

Do not treat one successful demo as regression coverage.

---

# 20. RC Clean Windows Acceptance

On a clean/disposable Windows environment:

1. install release candidate;
2. launch;
3. import representative EPUB/PDF/TXT;
4. read;
5. change typography/theme;
6. create Note/Excerpt/Annotation;
7. verify progress;
8. run OCR smoke;
9. close;
10. reopen;
11. verify persistence;
12. create backup;
13. restore;
14. verify update awareness;
15. verify no private development artifact is packaged.

RC does not pass until this flow succeeds on the packaged product.
