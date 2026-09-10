import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type * as pdfjsLib from "pdfjs-dist";
import { calculateOcrRenderScale } from "./ocrScaleUtils";

type OcrScope = "current" | "selected" | "entire";
type JobPhase = "ready" | "rendering" | "running" | "paused" | "cancelled" | "failed" | "complete";

interface OcrWorkspaceProps {
  bookId: string;
  pdf: pdfjsLib.PDFDocumentProxy;
  currentPage: number;
  onClose: () => void;
  /** Called after a job completes or a correction is saved, so the Reader
   * can refresh its own displayed state for the page it's currently on. */
  onOcrUpdated: () => void;
}

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

async function renderPageToDataUrl(pdf: pdfjsLib.PDFDocumentProxy, pageNum: number, scale?: number): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  const effectiveScale = scale ?? calculateOcrRenderScale(unscaledViewport.width, unscaledViewport.height);
  const viewport = page.getViewport({ scale: effectiveScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d")!;
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas.toDataURL("image/png");
}

export function OcrWorkspace({ bookId, pdf, currentPage, onClose, onOcrUpdated }: OcrWorkspaceProps) {
  const pageCount = pdf.numPages;
  const [scope, setScope] = useState<OcrScope>("current");
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => new Set([currentPage]));
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [thumbnails, setThumbnails] = useState<(string | null)[]>(() => new Array(pageCount).fill(null));
  const [viewedPage, setViewedPage] = useState(currentPage);
  const [phase, setPhase] = useState<JobPhase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [targetPages, setTargetPages] = useState<number[]>([]);
  const [pagesPrepared, setPagesPrepared] = useState(0);
  const [draft, setDraft] = useState("");
  const [savedFeedback, setSavedFeedback] = useState(false);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);

  // Render high-resolution source PDF page in the primary comparison pane
  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    (async () => {
      if (!pdf || !sourceCanvasRef.current) return;
      try {
        const page = await pdf.getPage(viewedPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = sourceCanvasRef.current;
        if (!canvas) return;
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise.catch(() => {});
      } catch {
        // ignore canvas render error
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, viewedPage]);

  // Thumbnail strip: rendered lazily and sequentially at small scale
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 1; i <= pageCount; i++) {
        if (cancelled) return;
        const url = await renderPageToDataUrl(pdf, i, 0.15);
        if (cancelled) return;
        setThumbnails((prev) => {
          const next = prev.slice();
          next[i - 1] = url;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageCount]);

  // Load effective OCR text whenever viewedPage changes
  useEffect(() => {
    let cancelled = false;
    setSavedFeedback(false);
    invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber: viewedPage })
      .then((text) => {
        if (!cancelled) {
          setDraft(text ?? "");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId, viewedPage]);

  function toggleThumbnailSelect(p: number) {
    if (scope !== "selected") return;
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  }

  async function runForPages(id: string, pagesToRun: number[]) {
    setPhase("rendering");
    setPagesPrepared(0);
    const pages: [number, number[]][] = [];
    for (const p of pagesToRun) {
      const dataUrl = await renderPageToDataUrl(pdf, p);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const bytes = Array.from(atob(base64), (c) => c.charCodeAt(0));
      pages.push([p, bytes]);
      setPagesPrepared((n) => n + 1);
    }

    setPhase("running");
    await invoke("run_ocr_job_command", { jobId: id, bookId, pages });

    const job = await invoke<{ status: string } | null>("get_ocr_job_command", { jobId: id });
    if (job?.status === "cancelled") {
      setPhase("cancelled");
      return;
    }
    if (job?.status === "paused") {
      setPhase("paused");
      return;
    }
    setPhase("complete");
    onOcrUpdated();
    invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber: viewedPage })
      .then((text) => setDraft(text ?? ""))
      .catch(() => {});
  }

  async function handleStart() {
    const pages =
      scope === "current"
        ? [currentPage]
        : scope === "entire"
          ? Array.from({ length: pageCount }, (_, i) => i + 1)
          : selectedPages.size > 0
            ? Array.from(selectedPages).sort((a, b) => a - b)
            : parsePageRangeInput(pageRangeInput, pageCount);
    if (pages.length === 0) return;

    setError(null);
    setTargetPages(pages);
    try {
      const job = await invoke<{ id: string }>("create_ocr_job_command", {
        bookId,
        scope:
          scope === "current"
            ? { kind: "current_page", page: currentPage }
            : scope === "entire"
              ? { kind: "entire_book" }
              : { kind: "selected_pages", pages },
      });
      setJobId(job.id);
      await runForPages(job.id, pages);
    } catch (e) {
      setError(String(e));
      setPhase("failed");
    }
  }

  async function handlePause() {
    if (!jobId) return;
    await invoke("set_ocr_job_status_command", { jobId, status: "paused" }).catch(() => {});
  }

  async function handleCancel() {
    if (!jobId) return;
    await invoke("set_ocr_job_status_command", { jobId, status: "cancelled" }).catch(() => {});
  }

  async function handleResume() {
    if (!jobId) return;
    setError(null);
    try {
      await invoke("set_ocr_job_status_command", { jobId, status: "running" });
      const remaining: number[] = [];
      for (const p of targetPages) {
        const text = await invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber: p });
        if (text === null) remaining.push(p);
      }
      if (remaining.length === 0) {
        setPhase("complete");
        onOcrUpdated();
        return;
      }
      await runForPages(jobId, remaining);
    } catch (e) {
      setError(String(e));
      setPhase("failed");
    }
  }

  async function handleSaveCorrection() {
    await invoke("save_ocr_correction_command", { bookId, pageNumber: viewedPage, correctedText: draft }).catch(() => {});
    setSavedFeedback(true);
    onOcrUpdated();
    setTimeout(() => setSavedFeedback(false), 2000);
  }

  const busy = phase === "rendering" || phase === "running";

  return (
    <div className="ocr-workspace" role="dialog" aria-label="OCR Workspace">
      {/* Top Header & Job Controls */}
      <div className="ocr-workspace-toolbar">
        <div className="ocr-workspace-title-group">
          <span className="ocr-workspace-title">OCR Workspace</span>
          <span className="ocr-workspace-page-badge">Page {viewedPage} of {pageCount}</span>
        </div>

        <div className="ocr-workspace-scope-controls" role="group" aria-label="OCR Scope">
          <label className="ocr-scope-label">
            <input
              type="radio"
              name="ocr-ws-scope"
              checked={scope === "current"}
              onChange={() => {
                setScope("current");
                setViewedPage(currentPage);
              }}
              disabled={busy}
            />
            Current page ({currentPage})
          </label>
          <label className="ocr-scope-label">
            <input
              type="radio"
              name="ocr-ws-scope"
              checked={scope === "selected"}
              onChange={() => setScope("selected")}
              disabled={busy}
            />
            Selected pages
          </label>
          {scope === "selected" && (
            <input
              type="text"
              className="ocr-range-input"
              aria-label="Page numbers or ranges, e.g. 1,3,5-7"
              placeholder="e.g. 1,3,5-7"
              value={pageRangeInput}
              onChange={(e) => setPageRangeInput(e.target.value)}
              disabled={busy}
            />
          )}
          <label className="ocr-scope-label">
            <input
              type="radio"
              name="ocr-ws-scope"
              checked={scope === "entire"}
              onChange={() => setScope("entire")}
              disabled={busy}
            />
            Entire book ({pageCount} pages)
          </label>
        </div>

        <div className="ocr-workspace-action-group">
          {phase === "ready" && (
            <button type="button" className="ocr-primary-btn" onClick={handleStart}>
              Run OCR
            </button>
          )}
          {phase === "rendering" && (
            <span className="ocr-status-pill" role="status">
              Preparing pages… ({pagesPrepared}/{targetPages.length})
            </span>
          )}
          {phase === "running" && (
            <div className="ocr-running-controls">
              <span className="ocr-status-pill" role="status">Running OCR…</span>
              <button type="button" onClick={handlePause}>
                Pause
              </button>
              <button type="button" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          )}
          {phase === "paused" && (
            <div className="ocr-paused-controls">
              <span className="ocr-status-pill" role="status">Paused</span>
              <button type="button" className="ocr-primary-btn" onClick={handleResume}>
                Resume
              </button>
              <button type="button" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          )}
          {phase === "cancelled" && (
            <div className="ocr-cancelled-controls">
              <span className="ocr-status-pill" role="status">Cancelled</span>
              <button type="button" onClick={handleStart}>
                Run Again
              </button>
            </div>
          )}
          {phase === "failed" && (
            <div className="ocr-failed-controls">
              <span className="ocr-status-pill ocr-status-pill--error" role="alert">
                Failed: {error}
              </span>
              <button type="button" onClick={handleStart}>
                Retry
              </button>
            </div>
          )}
          {phase === "complete" && (
            <span className="ocr-workspace-complete" role="status">
              <span className="ocr-complete-icon" aria-hidden="true">✓</span>
              <span>OCR complete</span>
            </span>
          )}

          <button type="button" onClick={onClose} className="ocr-workspace-close" aria-label="Close">
            Close
          </button>
        </div>
      </div>

      {/* Main Comparison Area: Source Canvas Left + OCR Text/Editor Right */}
      <div className="ocr-workspace-body">
        {/* Left: Source PDF Page Reference */}
        <div className="ocr-workspace-source" aria-label={`Source Page ${viewedPage}`}>
          <div className="ocr-pane-header">
            <h3>Source Page {viewedPage}</h3>
            <div className="ocr-page-nav-controls">
              <button
                type="button"
                disabled={viewedPage <= 1}
                onClick={() => setViewedPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>{viewedPage} / {pageCount}</span>
              <button
                type="button"
                disabled={viewedPage >= pageCount}
                onClick={() => setViewedPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
          <div className="ocr-source-canvas-container">
            <canvas ref={sourceCanvasRef} aria-label={`Source PDF Page ${viewedPage}`} />
          </div>

          {/* Thumbnail Strip for Multi-Page Selection & Navigation */}
          {pageCount > 1 && (
            <div className="ocr-workspace-thumbnail-strip" role="list" aria-label="Page thumbnails">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="listitem"
                  className={
                    "ocr-thumbnail" +
                    (p === viewedPage ? " ocr-thumbnail-viewed" : "") +
                    (scope === "selected" && selectedPages.has(p) ? " ocr-thumbnail-selected" : "")
                  }
                  onClick={() => {
                    setViewedPage(p);
                    toggleThumbnailSelect(p);
                  }}
                  aria-label={`Page ${p}${scope === "selected" && selectedPages.has(p) ? ", selected" : ""}`}
                >
                  {thumbnails[p - 1] ? (
                    <img src={thumbnails[p - 1]!} alt="" />
                  ) : (
                    <span className="ocr-thumbnail-loading">…</span>
                  )}
                  <span className="ocr-thumbnail-number">{p}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: OCR Recognized Text & Correction Editor */}
        <div className="ocr-workspace-editor">
          <div className="ocr-pane-header">
            <h3>Recognized Text · Page {viewedPage}</h3>
            <span className="ocr-char-count">{draft.length} characters</span>
          </div>

          <div className="ocr-editor-body">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="No OCR text available for this page. Click 'Run OCR' above to process."
              aria-label="Correct OCR text"
            />
          </div>

          <div className="ocr-editor-footer">
            <button
              type="button"
              className="ocr-primary-btn"
              onClick={handleSaveCorrection}
            >
              {savedFeedback ? "Saved ✓" : "Save correction"}
            </button>
            <span className="ocr-workspace-hint">
              Manual corrections are preserved as user data; raw OCR can be rebuilt.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
