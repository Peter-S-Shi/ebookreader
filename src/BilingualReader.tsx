import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface AlignmentMappingDTO {
  a: number[];
  b: number[];
}

interface AlignmentPackageDTO {
  id: string;
  book_id_a: string;
  book_id_b: string;
  lang_a: string;
  lang_b: string;
  mappings: AlignmentMappingDTO[];
}

interface BookRef {
  bookId: string;
  title: string;
  format: string;
}

interface BilingualReaderProps {
  package: AlignmentPackageDTO;
  bookA: BookRef;
  bookB: BookRef;
  onBack: () => void;
}

interface FoliateSection {
  id?: string;
  name?: string;
  url?: string;
  href?: string;
  createDocument?: () => Promise<Document>;
}
interface FoliateTocItem {
  label: string;
  href: string;
  subitems?: FoliateTocItem[];
}
interface FoliateBook {
  sections?: FoliateSection[];
  toc?: FoliateTocItem[];
}
interface FoliateView extends HTMLElement {
  open(file: File): Promise<void>;
  book?: FoliateBook;
}

export interface BookContentsItem {
  id: string;
  label: string;
  pageNumber?: number;
  offset: number;
}

export interface ExtractedBookData {
  text: string;
  contents: BookContentsItem[];
}

/// Extracts a Book's full plain text and structural contents:
/// - EPUB: uses real publication TOC where available; falls back to section labels.
/// - PDF: uses real document outline where available; falls back to Page 1..N.
/// - TXT: empty contents ([]), surfacing truthful "No contents available for this source".
async function extractBookData(bookId: string, format: string): Promise<ExtractedBookData> {
  const rawBytes = await invoke<Uint8Array | ArrayBuffer | number[]>("read_book_file_command", { bookId });
  const data = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes as ArrayBuffer);

  if (format === "txt") {
    const text = new TextDecoder("utf-8").decode(data);
    return { text, contents: [] };
  }

  if (format === "pdf") {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];
    const pageOffsets: number[] = [];
    let currentOffset = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      pageOffsets.push(currentOffset);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(pageText);
      currentOffset += pageText.length + 2;
    }

    const contents: BookContentsItem[] = [];
    try {
      if (typeof pdf.getOutline === "function") {
        const outline = await pdf.getOutline();
        if (outline && Array.isArray(outline) && outline.length > 0) {
          async function traverseOutline(items: any[], depth = 0) {
            for (const item of items) {
              if (!item.title || !item.title.trim()) continue;
              let pageNum = 1;
              try {
                let dest = item.dest;
                if (typeof dest === "string" && typeof pdf.getDestination === "function") {
                  dest = await pdf.getDestination(dest);
                }
                if (Array.isArray(dest) && dest.length > 0 && typeof pdf.getPageIndex === "function") {
                  const pageIndex = await pdf.getPageIndex(dest[0]);
                  if (typeof pageIndex === "number" && pageIndex >= 0) {
                    pageNum = pageIndex + 1;
                  }
                }
              } catch {
                // fallback to page 1 on dest resolution error
              }
              const offset = pageOffsets[pageNum - 1] ?? 0;
              contents.push({
                id: `pdf-outline-${contents.length}-${pageNum}`,
                label: depth > 0 ? `${"  ".repeat(depth)}${item.title.trim()}` : item.title.trim(),
                pageNumber: pageNum,
                offset,
              });
              if (item.items && Array.isArray(item.items) && item.items.length > 0) {
                await traverseOutline(item.items, depth + 1);
              }
            }
          }
          await traverseOutline(outline);
        }
      }
    } catch {
      // ignore outline resolution error and use fallback
    }

    // Fallback to Page 1..N when no usable outline exists
    if (contents.length === 0) {
      for (let i = 1; i <= pdf.numPages; i++) {
        contents.push({
          id: `page-${i}`,
          label: `Page ${i}`,
          pageNumber: i,
          offset: pageOffsets[i - 1] ?? 0,
        });
      }
    }

    return { text: pages.join("\n\n"), contents };
  }

  // EPUB (reflowable or fixed-layout): open via foliate-js
  // @ts-expect-error -- foliate-js has no published type declarations
  await import("foliate-js/view.js");
  const file = new File([new Uint8Array(data)], "book.epub", { type: "application/epub+zip" });
  const view = document.createElement("foliate-view") as FoliateView;
  await view.open(file);
  const sections = view.book?.sections ?? [];
  const parts: string[] = [];
  const sectionOffsets: number[] = [];
  let currentOffset = 0;

  for (const section of sections) {
    sectionOffsets.push(currentOffset);
    if (!section.createDocument) continue;
    const doc = await section.createDocument();
    const text = (doc.body?.textContent ?? "").trim();
    if (text) {
      parts.push(text);
      currentOffset += text.length + 2;
    }
  }

  const rawToc = view.book?.toc ?? [];
  const contents: BookContentsItem[] = [];

  function matchSectionOffset(href: string): number {
    if (!href) return 0;
    const cleanHref = href.split("#")[0].split("/").pop() ?? href;
    const idx = sections.findIndex((s) => {
      const sName = s.name ? s.name.split("/").pop() : "";
      const sHref = s.href ? s.href.split("/").pop() : "";
      const sId = s.id ?? "";
      const sUrl = typeof s.url === "string" ? s.url.split("/").pop() : "";
      return sName === cleanHref || sHref === cleanHref || sId === cleanHref || sUrl === cleanHref;
    });
    if (idx >= 0 && idx < sectionOffsets.length) {
      return sectionOffsets[idx];
    }
    return 0;
  }

  function flattenEpubToc(items: FoliateTocItem[], depth = 0) {
    for (const item of items) {
      if (item.label && item.label.trim()) {
        contents.push({
          id: `epub-toc-${contents.length}-${item.href || ""}`,
          label: depth > 0 ? `${"  ".repeat(depth)}${item.label.trim()}` : item.label.trim(),
          offset: matchSectionOffset(item.href),
        });
      }
      if (item.subitems && item.subitems.length > 0) {
        flattenEpubToc(item.subitems, depth + 1);
      }
    }
  }

  if (rawToc && Array.isArray(rawToc) && rawToc.length > 0) {
    flattenEpubToc(rawToc);
  }

  // Fallback to Section 1..N if no usable publication TOC exists
  if (contents.length === 0) {
    for (let i = 0; i < sections.length; i++) {
      contents.push({
        id: `sec-${i + 1}`,
        label: `Section ${i + 1}`,
        offset: sectionOffsets[i] ?? 0,
      });
    }
  }

  return { text: parts.join("\n\n"), contents };
}

/// `DESIGN.md` SS11 / `PRODUCT_SPEC.md` SS14 "Bilingual Reading" (canonical
/// `ER-BI-001`): two independent reading panes, optional synchronized
/// navigation, side swap, alignment status inspection, and bounded long-book
/// Contents navigation -- matching the accepted design authority.
export function BilingualReader({ package: pkg, bookA, bookB, onBack }: BilingualReaderProps) {
  const [dataA, setDataA] = useState<ExtractedBookData | null>(null);
  const [dataB, setDataB] = useState<ExtractedBookData | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [syncOn, setSyncOn] = useState(true);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [selectedContentsSide, setSelectedContentsSide] = useState<"left" | "right">("left");
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    extractBookData(bookA.bookId, bookA.format).then((data) => {
      if (!cancelled) setDataA(data);
    });
    return () => {
      cancelled = true;
    };
  }, [bookA.bookId, bookA.format]);

  useEffect(() => {
    let cancelled = false;
    extractBookData(bookB.bookId, bookB.format).then((data) => {
      if (!cancelled) setDataB(data);
    });
    return () => {
      cancelled = true;
    };
  }, [bookB.bookId, bookB.format]);

  // Scroll-position-ratio sync, matching the accepted prototype's own
  // reference implementation exactly (docs/design/..._v0_5.html's
  // `syncScroll`).
  function syncScroll(src: HTMLDivElement | null, dst: HTMLDivElement | null) {
    if (!syncOn || syncingRef.current || !src || !dst) return;
    syncingRef.current = true;
    const maxSrc = Math.max(1, src.scrollHeight - src.clientHeight);
    const maxDst = Math.max(1, dst.scrollHeight - dst.clientHeight);
    dst.scrollTop = (src.scrollTop / maxSrc) * maxDst;
    setTimeout(() => {
      syncingRef.current = false;
    }, 0);
  }

  function jumpToDestination(side: "left" | "right", offset: number) {
    const scroller = side === "left" ? leftScrollRef.current : rightScrollRef.current;
    const targetText = side === "left" ? leftText : rightText;
    if (!scroller || !targetText || targetText.length === 0) return;

    const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const ratio = Math.min(1, Math.max(0, offset / targetText.length));
    scroller.scrollTop = ratio * maxScroll;

    if (syncOn) {
      const counterpartScroller = side === "left" ? rightScrollRef.current : leftScrollRef.current;
      if (counterpartScroller) {
        const counterpartMax = Math.max(1, counterpartScroller.scrollHeight - counterpartScroller.clientHeight);
        counterpartScroller.scrollTop = ratio * counterpartMax;
      }
    }
  }

  const left = swapped ? bookB : bookA;
  const right = swapped ? bookA : bookB;
  const leftText = swapped ? dataB?.text ?? null : dataA?.text ?? null;
  const rightText = swapped ? dataA?.text ?? null : dataB?.text ?? null;
  const leftContents = swapped ? dataB?.contents ?? [] : dataA?.contents ?? [];
  const rightContents = swapped ? dataA?.contents ?? [] : dataB?.contents ?? [];
  const leftLang = swapped ? pkg.lang_b : pkg.lang_a;
  const rightLang = swapped ? pkg.lang_a : pkg.lang_b;

  const currentContents = selectedContentsSide === "left" ? leftContents : rightContents;

  return (
    <div className="bilingual-reader" role="dialog" aria-label="Bilingual Reading">
      <div className="bilingual-toolbar">
        <button type="button" onClick={onBack} aria-label="Back">
          ←
        </button>
        <b>Bilingual Reading</b>
        <span className="bilingual-pair-title">
          {bookA.title} · {pkg.lang_a} ↔ {pkg.lang_b}
        </span>
        <div className="bilingual-toolbar-actions">
          <button
            type="button"
            onClick={() => {
              setContentsOpen((o) => !o);
              setAlignmentOpen(false);
            }}
            aria-expanded={contentsOpen}
            aria-label="Contents"
          >
            📖 Contents
          </button>
          <button type="button" onClick={() => setSwapped((s) => !s)}>
            ⇄ Swap
          </button>
          <button
            type="button"
            onClick={() => {
              setAlignmentOpen((o) => !o);
              setContentsOpen(false);
            }}
            aria-expanded={alignmentOpen}
          >
            Alignment
          </button>
        </div>
      </div>

      <div className="bilingual-body">
        <section className="bilingual-pane" aria-label={`${left.title} (${leftLang})`}>
          <div className="bilingual-pane-head">
            <span className="bilingual-lang-tag">{leftLang.toUpperCase()}</span>
            <b>{left.title}</b>
          </div>
          <div
            className="bilingual-scroller"
            ref={leftScrollRef}
            onScroll={() => syncScroll(leftScrollRef.current, rightScrollRef.current)}
          >
            {leftText === null ? <p>Loading…</p> : <p className="bilingual-text">{leftText}</p>}
          </div>
        </section>

        <section className="bilingual-pane" aria-label={`${right.title} (${rightLang})`}>
          <div className="bilingual-pane-head">
            <span className="bilingual-lang-tag">{rightLang.toUpperCase()}</span>
            <b>{right.title}</b>
          </div>
          <div
            className="bilingual-scroller"
            ref={rightScrollRef}
            onScroll={() => syncScroll(rightScrollRef.current, leftScrollRef.current)}
          >
            {rightText === null ? <p>Loading…</p> : <p className="bilingual-text">{rightText}</p>}
          </div>
        </section>
      </div>

      <div className="bilingual-bottom">
        <button
          type="button"
          className="bilingual-sync-toggle"
          onClick={() => setSyncOn((s) => !s)}
          aria-pressed={syncOn}
        >
          ⛓ Sync navigation {syncOn ? "on" : "off"}
        </button>
      </div>

      {contentsOpen && (
        <div className="bilingual-contents-panel" role="region" aria-label="Book Contents">
          <h3>Contents</h3>
          <div className="bilingual-contents-side-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={selectedContentsSide === "left"}
              aria-pressed={selectedContentsSide === "left"}
              onClick={() => setSelectedContentsSide("left")}
            >
              Left: {left.title}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedContentsSide === "right"}
              aria-pressed={selectedContentsSide === "right"}
              onClick={() => setSelectedContentsSide("right")}
            >
              Right: {right.title}
            </button>
          </div>

          {currentContents.length === 0 ? (
            <p className="bilingual-contents-empty">No contents available for this source.</p>
          ) : (
            <ul className="bilingual-contents-list">
              {currentContents.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => jumpToDestination(selectedContentsSide, item.offset)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {alignmentOpen && (
        <div className="bilingual-align-panel" role="region" aria-label="Alignment Package">
          <h3>Alignment Package</h3>
          <p className="bilingual-align-hint">
            Alignment only coordinates navigation. Each book keeps its own notes, excerpts, highlights, and progress.
          </p>
          {pkg.mappings.length === 0 ? (
            <p>No paragraph mapping in this Alignment Package.</p>
          ) : (
            <ul className="bilingual-align-rows">
              {pkg.mappings.map((mapping, i) => {
                const isOk = mapping.a.length === 1 && mapping.b.length === 1;
                return (
                  <li key={i} className={isOk ? "bilingual-align-ok" : "bilingual-align-review"}>
                    <span>
                      {pkg.lang_a} ¶{mapping.a.join(",")}
                    </span>
                    <span>{isOk ? "↔" : "Review"}</span>
                    <span>
                      {pkg.lang_b} ¶{mapping.b.join(",")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
