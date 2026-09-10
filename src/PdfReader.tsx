import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ReaderShell } from "./ReaderShell";
import { NotebookPanel } from "./NotebookPanel";
import { OcrWorkspace } from "./OcrWorkspace";
import { currentPageFromScroll } from "./pdfContinuous";
import { useSoundToggle } from "./useSoundToggle";
import { useReadingProgress } from "./useReadingProgress";
import { CompletionPrompt } from "./CompletionPrompt";
import { useActualReadingTimeHeartbeat } from "./useActualReadingTimeHeartbeat";
import { useReadingCheckpoint } from "./useReadingCheckpoint";
import { ReadingCheckpointPrompt } from "./ReadingCheckpointPrompt";
import { useRecordBookOpened } from "./useRecordBookOpened";
import { extractHighlightColor, formatContextSelector, HIGHLIGHT_COLORS, type HighlightColor } from "./highlightUtils";

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
  // FC-C01/FC-C02: a source location (from a Search hit or a Notebook
  // asset) to open directly to, instead of resuming the last page.
  initialAnchor?: DocumentLocationDTO;
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
export function PdfReader({ bookId, title, onBack, initialAnchor }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const continuousContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [jumpFailed, setJumpFailed] = useState(false);
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
  // Track OCR availability for the current page to surface a restrained affordance.
  // Full OCR review, run controls, and text corrections live in `OcrWorkspace`.
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrWorkspaceOpen, setOcrWorkspaceOpen] = useState(false);
  const [noticeCollapsed, setNoticeCollapsed] = useState(false);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const { enabled: soundEnabled, toggle: toggleSound, playPageTurn } = useSoundToggle();
  const { progress, showCompletionPrompt, advance, startNextRead, dismissCompletionPrompt } = useReadingProgress(bookId);
  const checkpoint = useReadingCheckpoint();
  useRecordBookOpened(bookId);
  useActualReadingTimeHeartbeat(bookId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rawBytes = await invoke<Uint8Array | ArrayBuffer | number[]>("read_book_file_command", { bookId });
      if (cancelled) return;
      const uint8Bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes as ArrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: uint8Bytes }).promise;
      if (cancelled) return;
      // FC-C01/FC-C02: an exact jump takes priority over the resume page.
      // An anchor that fails to parse to a valid in-range page is reported
      // truthfully rather than silently opening at page one.
      let startPage = 1;
      if (initialAnchor?.primary_anchor) {
        const targetPage = parseInt(initialAnchor.primary_anchor, 10);
        const valid = Number.isFinite(targetPage) && targetPage >= 1 && targetPage <= pdf.numPages;
        if (!cancelled) {
          startPage = valid ? targetPage : 1;
          setJumpFailed(!valid);
        }
      } else {
        const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
        const savedPage = saved?.primary_anchor ? parseInt(saved.primary_anchor, 10) : NaN;
        startPage = Number.isFinite(savedPage) && savedPage >= 1 && savedPage <= pdf.numPages ? savedPage : 1;
      }

      if (cancelled) return;
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      setPageNumber(startPage);
      setPdfDoc(pdf);

      // Check text content of initial target page immediately for text selection state.
      // Entire-document scanned state (hasExtractableText = false) remains unknown
      // until the background whole-document inspection below completes.
      try {
        const page1 = await pdf.getPage(startPage);
        const tc1 = await page1.getTextContent();
        const hasText = tc1.items.some((item) => "str" in item && (item as { str: string }).str.trim().length > 0);
        if (hasText && !cancelled) {
          setHasExtractableText(true);
        }
      } catch {
        // ignore page text check failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Deferred whole-book text extraction into search index and scanned-PDF detection.
  // Runs asynchronously after Reader reaches Ready state to avoid competing with Page 1 paint.
  useEffect(() => {
    if (status !== "Ready" || !pdfDoc) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      let anyPageHasText = false;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(i);
        if (cancelled) return;
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        if (pageText.trim()) {
          anyPageHasText = true;
          const anchor: DocumentLocationDTO = {
            book_id: bookId,
            format: "pdf",
            progression_hint: pdfDoc.numPages > 0 ? i / pdfDoc.numPages : 0,
            primary_anchor: String(i),
            fallback_anchors: [],
            context_selector: null,
          };
          await invoke("index_search_text_command", {
            bookId,
            kind: "book_text",
            entryId: String(i),
            content: pageText,
            anchor,
          }).catch(() => {});
        }
      }
      if (!cancelled) {
        setHasExtractableText(anyPageHasText);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, pdfDoc, bookId]);

  function refreshOcrText() {
    invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber })
      .then((text) => setOcrText(text))
      .catch(() => {});
  }

  useEffect(() => {
    if (hasExtractableText !== false) return;
    let cancelled = false;
    invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber })
      .then((text) => {
        if (!cancelled) setOcrText(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId, pageNumber, hasExtractableText]);

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
    const pdf = pdfDoc || pdfRef.current;
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      renderTask = page.render({ canvasContext: context, viewport, canvas });
      await renderTask.promise.catch(() => {});
      if (cancelled) return;

      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.replaceChildren();
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.style.setProperty("--total-scale-factor", String(viewport.scale));
        const textContent = await page.streamTextContent();
        if (cancelled) return;
        await new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport }).render();

        // Rehydrate persistent highlights for this page in textLayer
        try {
          const assets = await invoke<Array<{ kind: string; text: string; anchor?: DocumentLocationDTO }>>(
            "list_reading_assets_command",
            { bookId },
          );
          if (!cancelled && textLayerDiv) {
            const pageAnnotations = assets.filter(
              (a) => a.kind === "annotation" && a.anchor?.primary_anchor === String(pageNumber),
            );
            for (const ann of pageAnnotations) {
              if (!ann.text?.trim()) continue;
              const query = ann.text.trim().toLowerCase();
              const color = extractHighlightColor(ann.anchor?.context_selector);
              const spans = Array.from(textLayerDiv.querySelectorAll("span"));
              for (const span of spans) {
                if (span.textContent && span.textContent.toLowerCase().includes(query)) {
                  span.classList.add("reader-highlight");
                  span.dataset.color = color;
                }
              }
            }
          }
        } catch {
          // ignore highlight rehydration error if assets fail
        }
      }
      if (cancelled) return;

      setStatus("Ready");
      saveLocation(pageNumber, pdf.numPages);
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [viewMode, pageNumber, bookId, pdfDoc]);

  // Text-selection -> Highlight/Excerpt capture (PRODUCT_SPEC.md SS11).
  // Single-page mode only this checkpoint -- continuous mode would need
  // per-page-div selection scoping across many simultaneously mounted text
  // layers, a follow-up, not folded in here. Also covers the OCR result
  // paragraph (`ocrTextRef`) once a scanned page has real OCR text -- it is
  // plain selectable DOM text, so the same selectionchange listener applies
  // without a separate pdf.js TextLayer (SS13's "search/excerpt/annotation
  // jump-back usability" for OCR'd pages, not just extractable-text pages).
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

  async function handleCaptureSelection(kind: "annotation" | "excerpt", selectedColor?: HighlightColor) {
    if (!selection) return;
    const color = selectedColor ?? highlightColor;
    const anchor: DocumentLocationDTO = {
      book_id: bookId,
      format: "pdf",
      progression_hint: pageCount > 0 ? selection.page / pageCount : 0,
      primary_anchor: String(selection.page),
      fallback_anchors: [],
      context_selector: formatContextSelector(selection.text, color),
    };
    await invoke("create_reading_asset_command", { bookId, kind, text: selection.text, anchor }).catch(() => {});
    document.getSelection()?.removeAllRanges();
    setSelection(null);
    setNotebookRefreshKey((k) => k + 1);
  }

  async function handleRemoveHighlight() {
    if (!selection) return;

    try {
      const assets = await invoke<Array<{ id: string; kind: string; text: string }>>("list_reading_assets_command", { bookId });
      const targetText = selection.text.trim().toLowerCase();
      const match = assets.find(
        (a) => a.kind === "annotation" && (a.text.trim().toLowerCase().includes(targetText) || targetText.includes(a.text.trim().toLowerCase())),
      );
      if (match) {
        await invoke("mark_reading_asset_orphaned_command", { assetId: match.id });
      }
    } catch {
      // ignore orphan error
    }

    if (textLayerRef.current) {
      const spans = Array.from(textLayerRef.current.querySelectorAll("span.reader-highlight"));
      for (const span of spans) {
        if (span.textContent?.toLowerCase().includes(selection.text.trim().toLowerCase())) {
          span.classList.remove("reader-highlight");
          delete (span as HTMLElement).dataset.color;
        }
      }
    }

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

  function triggerPageTurnAnimation() {
    const container = canvasRef.current?.parentElement;
    if (container) {
      container.classList.remove("page-turn-animating");
      void container.offsetWidth;
      container.classList.add("page-turn-animating");
      setTimeout(() => {
        container.classList.remove("page-turn-animating");
      }, 160);
    }
  }

  function switchViewMode(next: PdfViewMode) {
    setViewMode(next);
  }

  return (
    <ReaderShell
      title={title}
      onBack={() => checkpoint.requestBack(onBack)}
      status={status}
      progressPercent={pageCount > 0 ? (pageNumber / pageCount) * 100 : progress?.active_pass_progress}
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
                  triggerPageTurnAnimation();
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
                  triggerPageTurnAnimation();
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
          {hasExtractableText === false && (
            <button type="button" onClick={() => setOcrWorkspaceOpen(true)}>
              OCR Workspace
            </button>
          )}
        </>
      }
      overlay={
        notebookOpen ? (
          <NotebookPanel
            key={notebookRefreshKey}
            bookId={bookId}
            bookTitle={title}
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
        ) : (
          ocrWorkspaceOpen &&
          pdfRef.current && (
            <OcrWorkspace
              bookId={bookId}
              pdf={pdfRef.current}
              currentPage={pageNumber}
              onClose={() => setOcrWorkspaceOpen(false)}
              onOcrUpdated={refreshOcrText}
            />
          )
        )
      }
    >
      {showCompletionPrompt && (
        <CompletionPrompt onStartNextRead={startNextRead} onDismiss={dismissCompletionPrompt} />
      )}
      {checkpoint.showPrompt && (
        <ReadingCheckpointPrompt
          onDismiss={checkpoint.dismiss}
          onSaveNote={async (text) => {
            await invoke("create_reading_asset_command", { bookId, kind: "note", text, anchor: null }).catch(() => {});
          }}
        />
      )}
      {jumpFailed && (
        <p role="alert" className="jump-failed-notice">
          Could not jump to the exact location — opened the Book instead.
        </p>
      )}
      {hasExtractableText === false && (
        <div
          className={`pdf-ocr-notice ${noticeCollapsed ? "pdf-ocr-notice--collapsed" : ""}`}
          role="region"
          aria-label="Scanned document notice"
        >
          {noticeCollapsed ? (
            <button
              type="button"
              className="pdf-ocr-notice-expand"
              onClick={() => setNoticeCollapsed(false)}
              title="Expand Scanned PDF Notice"
            >
              Scanned PDF — Expand notice
            </button>
          ) : (
            <div className="pdf-ocr-notice-body">
              <span className="pdf-ocr-notice-badge">Scanned PDF</span>
              <span className="pdf-ocr-notice-text">
                {ocrText
                  ? `OCR text available for Page ${pageNumber}`
                  : "No extractable text found on this page. Visual reading works normally; search and annotations require OCR."}
              </span>
              <div className="pdf-ocr-notice-actions">
                <button
                  type="button"
                  className="pdf-ocr-open-btn"
                  onClick={() => setOcrWorkspaceOpen(true)}
                >
                  {ocrText ? "Open OCR Workspace" : "Run OCR in Workspace"}
                </button>
                <button
                  type="button"
                  className="pdf-ocr-notice-dismiss"
                  onClick={() => setNoticeCollapsed(true)}
                  title="Collapse notice"
                  aria-label="Collapse notice"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {viewMode === "single" && selection && (
        <div className="selection-toolbar" role="toolbar" aria-label="Selection actions">
          <div className="selection-toolbar-colors" aria-label="Highlight color preset palette">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`highlight-swatch highlight-swatch--${c}`}
                aria-label={`${c} highlight`}
                aria-pressed={highlightColor === c}
                onClick={() => {
                  setHighlightColor(c);
                  handleCaptureSelection("annotation", c);
                }}
              />
            ))}
            <button
              type="button"
              className="highlight-swatch highlight-swatch--clear"
              aria-label="Remove highlight"
              title="Remove highlight"
              onClick={handleRemoveHighlight}
            />
          </div>
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
