# EbookReader Bilingual TOC Manual-QA Fixture

Purpose: validate real EPUB publication TOC handling in Bilingual Reading after the long-book Contents correction.

Files:
- Bilingual_TOC_EN.epub
- Bilingual_TOC_ZH.epub
- Bilingual_TOC_alignment.json

Import order:
1. Import Bilingual_TOC_EN.epub.
2. Import Bilingual_TOC_ZH.epub.
3. Import Bilingual_TOC_alignment.json.
4. Open Bilingual Reading from either book.

Expected Contents titles:

English:
- Chapter 1 — Morning Library
- Chapter 2 — River Bridge
- Chapter 3 — Evening Train

Chinese:
- 第一章——清晨的图书馆
- 第二章——河上的桥
- 第三章——傍晚的列车

Acceptance:
- In Dark Mode, the whole Bilingual surface and drawers remain dark/readable.
- Contents opens and shows the real titles above, not generic "Section 1 / Section 2".
- Switching Left Book / Right Book changes the displayed TOC to the corresponding language.
- Click Chapter 2 on one side: that pane jumps to Chapter 2.
- Sync ON: counterpart follows by the existing scroll-ratio behavior.
- Sync OFF: counterpart does not move when one side jumps.
- Swap still works.
- Alignment inspection still shows the three 1:1 mappings.
- Close and reopen Bilingual Reading; pairing still resolves.

English SHA-256:
c6aec450479f692d8be3ddf8c3c2ad769369f5be8eee79df18a0509ee7b59f04

Chinese SHA-256:
9a4d5214b7cf238357d0b6c505cfdcbc1cafaf30e0eea71b9c37023161a95473

Do not edit either EPUB before importing the alignment package.
