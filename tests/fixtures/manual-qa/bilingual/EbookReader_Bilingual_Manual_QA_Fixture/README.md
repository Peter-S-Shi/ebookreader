# EbookReader Bilingual Manual-QA Fixture

Files:
- Bilingual_QA_EN.txt
- Bilingual_QA_ZH.txt
- Bilingual_QA_alignment.json

English SHA-256:
bf2be670082a814aa11f22b7e9138bdd837963181c74d86b0d5d476ffcd37290

Chinese SHA-256:
f11ddd83720014b02f77021f122f59b0f3cb5eb6888ad603c57bf87ed0e8889e

Important: do not edit either TXT file before importing the Alignment Package. Any byte change changes its SHA-256 fingerprint.

Test order:
1. Import Bilingual_QA_EN.txt.
2. Import Bilingual_QA_ZH.txt.
3. Import Bilingual_QA_alignment.json with Import Alignment Package.
4. Click Bilingual on either test book.
5. Confirm the correct English/Chinese pair opens.
6. With Sync ON, scroll one side; the other should move proportionally.
7. Turn Sync OFF; scrolling one side should no longer force the other side to move.
8. Turn Sync ON again.
9. Click Swap; EN/ZH sides should exchange correctly.
10. Open Alignment.
11. Confirm normal mappings display as 1:1 / OK-like rows.
12. Confirm English Checkpoint 4 -> Chinese Checkpoints 4A + 4B is non-1:1 and marked Review.
13. Close and reopen Bilingual Reading from either book; pairing should still resolve.

Visual checkpoints:
- Top: Checkpoint 1 / 检查点 1
- Middle: Checkpoint 4 / 检查点 4A + 4B
- Later: Checkpoint 6 / 检查点 6
- Bottom: Checkpoint 8 / 检查点 8

The two books intentionally have unequal paragraph lengths. Synchronization is expected to be scroll-ratio based, not sentence-locked.

If Alignment import reports a source/fingerprint mismatch, verify that both TXT files were imported first and were not edited.
