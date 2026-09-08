import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ReaderShell } from "./ReaderShell";
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
// virtualization for much longer documents. Zoom/fit, text selection, and
// search remain later M2/M4 checkpoints, not this one.
export function PdfReader({ bookId, title, onBack }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const continuousContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [viewMode, setViewMode] = useState<PdfViewMode>("single");
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
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

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
      setStatus("Ready");
      saveLocation(pageNumber, pdf.numPages);
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, pageNumber, bookId]);

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
        </>
      }
    >
      {showCompletionPrompt && (
        <CompletionPrompt onStartNextRead={startNextRead} onDismiss={dismissCompletionPrompt} />
      )}
      {viewMode === "single" ? (
        <div className="reader-surface">
          <canvas ref={canvasRef} />
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
