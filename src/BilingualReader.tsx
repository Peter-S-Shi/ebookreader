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

/// Extracts a Book's full plain text, reusing exactly the same per-format
/// paths already validated for Library-wide Search indexing (Reader.tsx/
/// PdfReader.tsx/TxtReader.tsx) -- see `crates/domain/src/alignment.rs`
/// for why this is the accepted evidence basis for the Bilingual Reading
/// 🧪 marker rather than a new extraction pipeline. Sections/pages are
/// joined with a blank line so the plain-text pane at least shows
/// paragraph-ish breaks.
async function extractBookText(bookId: string, format: string): Promise<string> {
  const rawBytes = await invoke<Uint8Array | ArrayBuffer | number[]>("read_book_file_command", { bookId });
  const data = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes as ArrayBuffer);

  if (format === "txt") {
    return new TextDecoder("utf-8").decode(data);
  }

  if (format === "pdf") {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      pages.push(textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join("\n\n");
  }

  // EPUB (reflowable or fixed-layout): open via foliate-js exactly as
  // Reader.tsx does for search indexing, but headless -- the element is
  // never attached visibly, only used to reach book.sections.
  // @ts-expect-error -- foliate-js has no published type declarations
  await import("foliate-js/view.js");
  const file = new File([new Uint8Array(data)], "book.epub", { type: "application/epub+zip" });
  const view = document.createElement("foliate-view") as FoliateView;
  await view.open(file);
  const sections = view.book?.sections ?? [];
  const parts: string[] = [];
  for (const section of sections) {
    if (!section.createDocument) continue;
    const doc = await section.createDocument();
    const text = doc.body?.textContent ?? "";
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join("\n\n");
}

/// `DESIGN.md` SS11 / `PRODUCT_SPEC.md` SS14 "Bilingual Reading" (canonical
/// `ER-BI-001`): two independent reading panes, optional synchronized
/// navigation, side swap, alignment status inspection -- matching the
/// accepted `docs/design/EbookReader_UI_Prototype_v0_5.html#bilingual`
/// composition. Per SS14's own non-goals ("no alignment authoring,
/// mapping drag/drop, or sentence re-segmentation tools") and the scope
/// decision recorded in `crates/domain/src/alignment.rs`, synchronized
/// navigation here is scroll-position-ratio based (matching the
/// prototype's own reference implementation exactly), not a per-
/// paragraph anchor jump -- the Alignment Package's mappings are used
/// only for the read-only Alignment panel, never to drive scroll.
export function BilingualReader({ package: pkg, bookA, bookB, onBack }: BilingualReaderProps) {
  const [textA, setTextA] = useState<string | null>(null);
  const [textB, setTextB] = useState<string | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [syncOn, setSyncOn] = useState(true);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    extractBookText(bookA.bookId, bookA.format).then((text) => {
      if (!cancelled) setTextA(text);
    });
    return () => {
      cancelled = true;
    };
  }, [bookA.bookId, bookA.format]);

  useEffect(() => {
    let cancelled = false;
    extractBookText(bookB.bookId, bookB.format).then((text) => {
      if (!cancelled) setTextB(text);
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

  const left = swapped ? bookB : bookA;
  const right = swapped ? bookA : bookB;
  const leftText = swapped ? textB : textA;
  const rightText = swapped ? textA : textB;
  const leftLang = swapped ? pkg.lang_b : pkg.lang_a;
  const rightLang = swapped ? pkg.lang_a : pkg.lang_b;

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
          <button type="button" onClick={() => setSwapped((s) => !s)}>
            ⇄ Swap
          </button>
          <button type="button" onClick={() => setAlignmentOpen((o) => !o)}>
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
