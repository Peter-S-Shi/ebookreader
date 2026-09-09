import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ReaderShell } from "./ReaderShell";
import { NotebookPanel } from "./NotebookPanel";
import { currentPageFromScroll } from "./pdfContinuous";
import { useSoundToggle } from "./useSoundToggle";
import { useReadingProgress } from "./useReadingProgress";
import { CompletionPrompt } from "./CompletionPrompt";
import { useActualReadingTimeHeartbeat } from "./useActualReadingTimeHeartbeat";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface DocumentLocationDTO {
  book_id: string;
  format: string;
  progression_hint: number;
  primary_anchor: string;
  fallback_anchors: string[];
  context_selector: string | null;
}

interface PdfReaderProps {
  bookId: string;
  title: string;
  onBack: () => void;
}

type PdfViewMode = "single" | "continuous";

// PDF reading surface: renders via pdf.js (the engine ARCHITECTURE.md
// SS5/M0-C validated for text/geometry extraction) to a canvas per page.
// page index is the DocumentLocation primary_anchor, per ARCHITECTURE.md
// SS5's "candidates to validate: page index; page geometry/bounding box".
// Two view modes close FORMAT_CAPABILITY_MATRIX.md's required "Continuous
// scroll" / "Single-page / paged" rows for Text PDF (DESIGN.md SS7's PDF
// controls: "zoom; fit page / fit width" remain a residual -- pages
// currently render at a fixed scale). Double-page spread and very large
// (100s of pages) documents' rendering performance are later-checkpoint
// residuals: continuous mode here renders every page eagerly, which is
// fine at the scale M0 validated (a 15-page document) but would need
// virtualization for much longer documents. Zoom/fit remains a later
// checkpoint. Text selection -> Highlight/Excerpt (M4, SS11) is
// implemented for single-page mode via a pdf.js TextLayer overlaid on the
// canvas; continuous mode's per-page selection scoping is a follow-up.
// Whole-page text is also indexed into the M4 search index in the
// background on open (SS12: "supported book text" is a required
// Library-wide Search source). M5 (Scanned PDF OCR) begins here: the same
// background pass that extracts text also detects a scanned PDF (no
// extractable text on any page) and surfaces SS13.1/SS13.2's truthful
// degraded state -- visual reading still works, text-dependent features
// don't pretend to. The OCR pipeline itself (local ONNX inference via the
// Rust `ort` crate, per M0_ARCHITECTURE_DECISION.md SS8) now runs for real
// via run_ocr_job_command, with SS13.1's full Current Page / Selected Pages
// / Entire Book scope selection. Real mid-run pause/cancel and incremental
// per-page progress reporting are not wired (a single command call blocks
// until every target page is done) -- a genuine residual, not hidden from
// the user: the button's label says so rather than faking a progress bar.
export function PdfReader({ bookId, title, onBack }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const continuousContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [viewMode, setViewMode] = useState<PdfViewMode>("single");
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookRefreshKey, setNotebookRefreshKey] = useState(0);
  const [selection, setSelection] = useState<{ text: string; page: number } | null>(null);
  // PRODUCT_SPEC.md SS13.1/SS13.2: a scanned PDF (no extractable text on
  // any page) must display a truthful degraded state rather than pretend
  // search/selection/excerpt work -- `null` until the whole-document text
  // pass below has actually checked every page.
  const [hasExtractableText, setHasExtractableText] = useState<boolean | null>(null);
  // SS13.1: "user chooses Current Page, Selected Pages, or Entire Book".
  // `ocrPhase` is deliberately not a numeric progress bar -- rendering each
  // target page to bytes is fast, but the actual OCR inference for all of
  // them happens inside one run_ocr_job_command call with no incremental
  // callback (a real residual, see PROJECT_STATUS.md), so a fake "3 of 5"
  // counter that then sits still for minutes would be more misleading than
  // an honest "running, this may take a while" (SS13.2's "no pretending").
  const [ocrScope, setOcrScope] = useState<"current" | "selected" | "entire">("current");
  const [ocrPageRangeInput, setOcrPageRangeInput] = useState("");
  const [ocrPhase, setOcrPhase] = useState<"idle" | "rendering" | "inferring" | "succeeded" | "failed">("idle");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrPagesRun, setOcrPagesRun] = useState<number | null>(null);
  const [ocrDraft, setOcrDraft] = useState("");
  const [ocrEditing, setOcrEditing] = useState(false);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const { enabled: soundEnabled, toggle: toggleSound, playPageTurn } = useSoundToggle();
  const { showCompletionPrompt, advance, startNextRead, dismissCompletionPrompt } = useReadingProgress(bookId);
  useActualReadingTimeHeartbeat(bookId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bytes = await invoke<number[]>("read_book_file_command", { bookId });
      if (cancelled) return;
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
      if (cancelled) return;
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);

      const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
      const savedPage = saved?.primary_anchor ? parseInt(saved.primary_anchor, 10) : NaN;
      const startPage = Number.isFinite(savedPage) && savedPage >= 1 && savedPage <= pdf.numPages ? savedPage : 1;
      if (!cancelled) setPageNumber(startPage);

      // Whole-book text into the search index (PRODUCT_SPEC.md SS12:
      // "supported book text" is a required Library-wide Search source),
      // one entry per page so results stay reasonably scoped. Runs in the
      // background, sequentially, so it doesn't compete with rendering.
      let anyPageHasText = false;
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        const page = await pdf.getPage(i);
        if (cancelled) return;
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        if (pageText.trim()) {
          anyPageHasText = true;
          await invoke("index_search_text_command", {
            bookId,
            kind: "book_text",
            entryId: String(i),
            content: pageText,
          }).catch(() => {});
        }
      }
      if (!cancelled) setHasExtractableText(anyPageHasText);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Once a scanned page has been established, check for an already-saved
  // OCR result/correction so a returning reader doesn't have to re-run OCR
  // every visit (`get_ocr_effective_text_command`: correction > raw result
  // > null).
  useEffect(() => {
    if (hasExtractableText !== false) return;
    let cancelled = false;
    invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber })
      .then((text) => {
        if (!cancelled) {
          setOcrText(text);
          setOcrPhase(text !== null ? "succeeded" : "idle");
          setOcrPagesRun(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId, pageNumber, hasExtractableText]);

  function parsePageRangeInput(input: string, maxPage: number): number[] {
    const pages = new Set<number>();
    for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) {
        const start = parseInt(range[1], 10);
        const end = parseInt(range[2], 10);
        for (let p = start; p <= end; p++) {
          if (p >= 1 && p <= maxPage) pages.add(p);
        }
      } else {
        const p = parseInt(part, 10);
        if (Number.isFinite(p) && p >= 1 && p <= maxPage) pages.add(p);
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  async function renderPageToPngBytes(pageNum: number): Promise<number[]> {
    const pdf = pdfRef.current!;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d")!;
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return Array.from(atob(base64), (c) => c.charCodeAt(0));
  }

  async function handleRunOcr() {
    const pdf = pdfRef.current;
    if (!pdf) return;
    const targetPages =
      ocrScope === "current"
        ? [pageNumber]
        : ocrScope === "entire"
          ? Array.from({ length: pdf.numPages }, (_, i) => i + 1)
          : parsePageRangeInput(ocrPageRangeInput, pdf.numPages);
    if (targetPages.length === 0) return;

    setOcrPhase("rendering");
    setOcrError(null);
    setOcrPagesRun(null);
    try {
      const job = await invoke<{ id: string }>("create_ocr_job_command", {
        bookId,
        scope:
          ocrScope === "current"
            ? { kind: "current_page", page: pageNumber }
            : ocrScope === "entire"
              ? { kind: "entire_book" }
              : { kind: "selected_pages", pages: targetPages },
      });

      const pages: [number, number[]][] = [];
      for (const p of targetPages) {
        pages.push([p, await renderPageToPngBytes(p)]);
      }

      setOcrPhase("inferring");
      await invoke("run_ocr_job_command", { jobId: job.id, bookId, pages });

      if (ocrScope === "current") {
        const text = await invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber });
        setOcrText(text ?? "");
      } else {
        // Multi-page: no single page's text to show here -- navigate to a
        // page to see its saved result via the effective-text loader above.
        setOcrText(null);
      }
      setOcrPagesRun(targetPages.length);
      setOcrPhase("succeeded");
    } catch (e) {
      setOcrError(String(e));
      setOcrPhase("failed");
    }
  }

  async function handleSaveOcrCorrection() {
    await invoke("save_ocr_correction_command", { bookId, pageNumber, correctedText: ocrDraft }).catch(() => {});
    setOcrText(ocrDraft);
    setOcrEditing(false);
  }

  function saveLocation(page: number, count: number) {
    const fraction = count > 0 ? page / count : 0;
    const location: DocumentLocationDTO = {
      book_id: bookId,
      format: "pdf",
      progression_hint: fraction,
      primary_anchor: String(page),
      fallback_anchors: [],
      context_selector: null,
    };
    invoke("save_reading_location_command", { location }).catch(() => {});
    advance(fraction);
  }

  // Single-page mode: render only the current page.
  useEffect(() => {
    if (viewMode !== "single") return;
    const pdf = pdfRef.current;
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      if (cancelled) return;

      // Text layer: an invisible, selectable text overlay matched to the
      // canvas's rendered geometry, so PRODUCT_SPEC.md SS11's "text
      // selection exposes lightweight Highlight / Excerpt / Note actions"
      // holds for Text PDF. On a scanned page this renders empty (there is
      // no text to lay out) -- combined with the hasExtractableText check
      // above, that is exactly SS13.2's degraded state: nothing here
      // pretends selection/search/excerpt work when there is no text.
      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.replaceChildren();
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.style.setProperty("--total-scale-factor", String(viewport.scale));
        const textContent = await page.streamTextContent();
        if (cancelled) return;
        await new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport }).render();
      }
      if (cancelled) return;

      setStatus("Ready");
      saveLocation(pageNumber, pdf.numPages);
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, pageNumber, bookId]);

  // Text-selection -> Highlight/Excerpt capture (PRODUCT_SPEC.md SS11).
  // Single-page mode only this checkpoint -- continuous mode would need
  // per-page-div selection scoping across many simultaneously mounted text
  // layers, a follow-up, not folded in here.
  useEffect(() => {
    if (viewMode !== "single") return;
    function handleSelectionChange() {
      const layer = textLayerRef.current;
      const sel = document.getSelection();
      if (!layer || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!layer.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const text = sel.toString();
      if (!text.trim()) {
        setSelection(null);
        return;
      }
      setSelection({ text, page: pageNumber });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [viewMode, pageNumber]);

  async function handleCaptureSelection(kind: "annotation" | "excerpt") {
    if (!selection) return;
    const anchor: DocumentLocationDTO = {
      book_id: bookId,
      format: "pdf",
      progression_hint: pageCount > 0 ? selection.page / pageCount : 0,
      primary_anchor: String(selection.page),
      fallback_anchors: [],
      context_selector: selection.text.slice(0, 80),
    };
    await invoke("create_reading_asset_command", { bookId, kind, text: selection.text, anchor }).catch(() => {});
    document.getSelection()?.removeAllRanges();
    setSelection(null);
    setNotebookRefreshKey((k) => k + 1);
  }

  // Continuous mode: render every page into a scrollable stack, and jump
  // to the saved page once on entry.
  useEffect(() => {
    if (viewMode !== "continuous") return;
    const pdf = pdfRef.current;
    if (!pdf) return;
    let cancelled = false;

    (async () => {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;
        const page = await pdf.getPage(i);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1.2 });
        const context = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport, canvas }).promise;
      }
      if (cancelled) return;
      setStatus("Ready");

      const target = canvasRefs.current[pageNumber - 1];
      target?.scrollIntoView({ block: "start" });
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, bookId, pageCount]);

  function handleContinuousScroll() {
    const pdf = pdfRef.current;
    const container = continuousContainerRef.current;
    if (!pdf || !container) return;
    const heights = canvasRefs.current.map((c) => (c ? c.clientHeight + 16 : 0)); // + gap
    const current = currentPageFromScroll(heights, container.scrollTop);
    setPageNumber(current);
    saveLocation(current, pdf.numPages);
  }

  function switchViewMode(next: PdfViewMode) {
    setViewMode(next);
  }

  return (
    <ReaderShell
      title={title}
      onBack={onBack}
      status={status}
      toolbarExtra={
        <>
          <select
            aria-label="View mode"
            value={viewMode}
            onChange={(e) => switchViewMode(e.target.value as PdfViewMode)}
          >
            <option value="single">Single page</option>
            <option value="continuous">Continuous scroll</option>
          </select>
          {viewMode === "single" && (
            <>
              <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => {
                  setPageNumber((p) => p - 1);
                  playPageTurn();
                }}
              >
                Previous
              </button>
              <span>
                Page {pageNumber}
                {pageCount > 0 ? ` of ${pageCount}` : ""}
              </span>
              <button
                type="button"
                disabled={pageCount > 0 && pageNumber >= pageCount}
                onClick={() => {
                  setPageNumber((p) => p + 1);
                  playPageTurn();
                }}
              >
                Next
              </button>
            </>
          )}
          {viewMode === "continuous" && (
            <span>
              Page {pageNumber}
              {pageCount > 0 ? ` of ${pageCount}` : ""}
            </span>
          )}
          <button type="button" aria-label="Toggle page-turn sound" onClick={toggleSound}>
            {soundEnabled ? "Sound: On" : "Sound: Off"}
          </button>
          <button type="button" onClick={() => setNotebookOpen((o) => !o)}>
            Notebook
          </button>
        </>
      }
      overlay={
        notebookOpen && (
          <NotebookPanel
            key={notebookRefreshKey}
            bookId={bookId}
            onClose={() => setNotebookOpen(false)}
            onJumpTo={(asset) => {
              if (!asset.anchor) return false;
              const page = parseInt(asset.anchor.primary_anchor, 10);
              if (!Number.isFinite(page) || page < 1 || (pageCount > 0 && page > pageCount)) return false;
              setViewMode("single");
              setPageNumber(page);
              return true;
            }}
          />
        )
      }
    >
      {showCompletionPrompt && (
        <CompletionPrompt onStartNextRead={startNextRead} onDismiss={dismissCompletionPrompt} />
      )}
      {hasExtractableText === false && viewMode === "single" && (
        <div className="pdf-ocr-panel">
          <p className="pdf-degraded-notice" role="status">
            Scanned PDF -- no extractable text found on this page. Visual reading works normally; search, text
            selection, and Excerpt/Annotation are unavailable for pages without OCR text.
          </p>
          {ocrPhase !== "rendering" && ocrPhase !== "inferring" && (
            <div className="pdf-ocr-scope">
              <label>
                <input
                  type="radio"
                  name="ocr-scope"
                  checked={ocrScope === "current"}
                  onChange={() => setOcrScope("current")}
                />
                Current page
              </label>
              <label>
                <input
                  type="radio"
                  name="ocr-scope"
                  checked={ocrScope === "selected"}
                  onChange={() => setOcrScope("selected")}
                />
                Selected pages
              </label>
              {ocrScope === "selected" && (
                <input
                  type="text"
                  aria-label="Page numbers or ranges, e.g. 1,3,5-7"
                  placeholder="e.g. 1,3,5-7"
                  value={ocrPageRangeInput}
                  onChange={(e) => setOcrPageRangeInput(e.target.value)}
                />
              )}
              <label>
                <input
                  type="radio"
                  name="ocr-scope"
                  checked={ocrScope === "entire"}
                  onChange={() => setOcrScope("entire")}
                />
                Entire book
              </label>
            </div>
          )}
          {ocrPhase !== "succeeded" && (
            <button
              type="button"
              onClick={handleRunOcr}
              disabled={ocrPhase === "rendering" || ocrPhase === "inferring"}
            >
              {ocrPhase === "rendering"
                ? "Preparing pages…"
                : ocrPhase === "inferring"
                  ? "Running OCR (this may take a while for many pages)…"
                  : "Run OCR"}
            </button>
          )}
          {ocrPhase === "failed" && ocrError && (
            <p className="pdf-ocr-error" role="alert">
              OCR failed: {ocrError}
            </p>
          )}
          {ocrPhase === "succeeded" && ocrPagesRun !== null && ocrPagesRun > 1 && (
            <p className="pdf-ocr-result-text">
              OCR complete for {ocrPagesRun} pages. Navigate to a page to see its recognized text.
            </p>
          )}
          {ocrPhase === "succeeded" && ocrText !== null && !ocrEditing && (
            <div className="pdf-ocr-result">
              <p className="pdf-ocr-result-text">{ocrText || "(no text recognized on this page)"}</p>
              <button
                type="button"
                onClick={() => {
                  setOcrDraft(ocrText);
                  setOcrEditing(true);
                }}
              >
                Correct text
              </button>
              <button type="button" onClick={handleRunOcr}>
                Re-run OCR
              </button>
            </div>
          )}
          {ocrEditing && (
            <div className="pdf-ocr-correction">
              <textarea
                value={ocrDraft}
                onChange={(e) => setOcrDraft(e.target.value)}
                rows={6}
                aria-label="Correct OCR text"
              />
              <button type="button" onClick={handleSaveOcrCorrection}>
                Save correction
              </button>
              <button type="button" onClick={() => setOcrEditing(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {viewMode === "single" && selection && (
        <div className="selection-toolbar" role="toolbar" aria-label="Selection actions">
          <button type="button" onClick={() => handleCaptureSelection("annotation")}>
            Highlight
          </button>
          <button type="button" onClick={() => handleCaptureSelection("excerpt")}>
            Excerpt
          </button>
        </div>
      )}
      {viewMode === "single" ? (
        <div className="reader-surface">
          <div className="pdf-page">
            <canvas ref={canvasRef} />
            <div ref={textLayerRef} className="pdf-text-layer" />
          </div>
        </div>
      ) : (
        <div
          ref={continuousContainerRef}
          className="reader-surface pdf-continuous"
          onScroll={handleContinuousScroll}
        >
          {Array.from({ length: pageCount }, (_, i) => (
            <canvas
              key={i}
              ref={(el) => {
                canvasRefs.current[i] = el;
              }}
            />
          ))}
        </div>
      )}
    </ReaderShell>
  );
}
