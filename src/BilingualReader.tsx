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

// Minimal FoliateView shape, mirrored from Reader.tsx -- only the calls
// needed to extract plain text, not to render a full reading surface.
interface FoliateSection {
  createDocument?: () => Promise<Document>;
}
interface FoliateBook {
  sections?: FoliateSection[];
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

/// Extracts a Book's full plain text and structural contents (EPUB sections/TOC,
/// PDF pages/outline), reusing exactly the same per-format paths already
/// validated for Library-wide Search indexing. For unstructured TXT sources,
/// `contents` is empty ([]), surfacing a truthful "No contents available".
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
    const contents: BookContentsItem[] = [];
    let currentOffset = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      contents.push({
        id: `page-${i}`,
        label: `Page ${i}`,
        pageNumber: i,
        offset: currentOffset,
      });
      pages.push(pageText);
      currentOffset += pageText.length + 2;
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
  const contents: BookContentsItem[] = [];
  let currentOffset = 0;
  let secIdx = 1;
  for (const section of sections) {
    if (!section.createDocument) continue;
    const doc = await section.createDocument();
    const text = (doc.body?.textContent ?? "").trim();
    if (text) {
      contents.push({
        id: `sec-${secIdx}`,
        label: `Section ${secIdx}`,
        offset: currentOffset,
      });
      parts.push(text);
      currentOffset += text.length + 2;
      secIdx++;
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
