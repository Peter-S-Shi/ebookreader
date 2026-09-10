import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type * as pdfjsLib from "pdfjs-dist";
import { calculateOcrRenderScale } from "./ocrScaleUtils";

type OcrScope = "current" | "selected" | "entire";
// DESIGN.md SS10 "OCR Workspace" canonical job states: Ready, Running,
// Paused, Cancelled, Failed, Complete. `rendering` is this app's own
// sub-state of Running (preparing page images before the actual inference
// call) -- not a separate canonical state, just distinguished in the UI
// label so "running" doesn't look stuck while pages are still being
// captured to bytes.
type JobPhase = "ready" | "rendering" | "running" | "paused" | "cancelled" | "failed" | "complete";

interface OcrWorkspaceProps {
  bookId: string;
  pdf: pdfjsLib.PDFDocumentProxy;
  currentPage: number;
  onClose: () => void;
  /** Called after a job completes or a correction is saved, so the Reader
   * can refresh its own displayed text for the page it's currently on. */
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

// DESIGN.md SS10 "OCR Workspace" (canonical surface `ER-OCR-001`, "Page
// selection + job state + correction"): a dedicated contextual workspace,
// not folded into the Reader's own page view. Canonical structure:
//   Toolbar / OCR scope
//       v
//   Page thumbnail grid + job/status/correction side region
// Selected Pages supports both thumbnail multi-select and page-range text
// input, per SS10. Job states: Ready/Running/Paused/Cancelled/Failed/
// Complete, with Pause/Cancel disappearing after terminal completion and
// an explicit "[check] OCR complete" using the semantic success color, not
// user Accent (SS10 "OCR Complete" rules).
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

  // Thumbnail grid: rendered lazily and sequentially at a small scale so it
  // doesn't compete heavily with the main reading surface's own rendering.
  // For very long books this is a real, not-yet-addressed cost (residual --
  // no virtualization/on-demand-only rendering yet).
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

  useEffect(() => {
    let cancelled = false;
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
    onOcrUpdated();
  }

  const busy = phase === "rendering" || phase === "running";

  return (
    <div className="ocr-workspace" role="dialog" aria-label="OCR Workspace">
      <div className="ocr-workspace-toolbar">
        <span className="ocr-workspace-title">OCR Workspace</span>
        <button type="button" onClick={onClose} className="ocr-workspace-close">
          Close
        </button>
      </div>
      <div className="ocr-workspace-section">
        <h2>Pages</h2>
        <span className="ocr-workspace-hint">Choose exactly what should be recognized.</span>
      </div>
      <div className="ocr-workspace-tools">
        <label>
          <input type="radio" name="ocr-ws-scope" checked={scope === "current"} onChange={() => setScope("current")} disabled={busy} />
          Current page
        </label>
        <label>
          <input type="radio" name="ocr-ws-scope" checked={scope === "selected"} onChange={() => setScope("selected")} disabled={busy} />
          Selected pages
        </label>
        {scope === "selected" && (
          <input
            type="text"
            aria-label="Page numbers or ranges, e.g. 1,3,5-7"
            placeholder="e.g. 1,3,5-7 (or click thumbnails)"
            value={pageRangeInput}
            onChange={(e) => setPageRangeInput(e.target.value)}
            disabled={busy}
          />
        )}
        <label>
          <input type="radio" name="ocr-ws-scope" checked={scope === "entire"} onChange={() => setScope("entire")} disabled={busy} />
          Entire book
        </label>
      </div>
      <div className="ocr-workspace-body">
        <div className="ocr-workspace-thumbnails" role="list" aria-label="Page thumbnails">
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
              {thumbnails[p - 1] ? <img src={thumbnails[p - 1]!} alt="" /> : <span className="ocr-thumbnail-loading">…</span>}
              <span className="ocr-thumbnail-number">{p}</span>
            </button>
          ))}
        </div>
        <div className="ocr-workspace-side">
          <div className="ocr-workspace-status">
            {phase === "ready" && (
              <button type="button" onClick={handleStart}>
                Run OCR
              </button>
            )}
            {phase === "rendering" && (
              <span role="status">
                Preparing pages… ({pagesPrepared}/{targetPages.length})
              </span>
            )}
            {phase === "running" && (
              <>
                <span role="status">Running…</span>
                <button type="button" onClick={handlePause}>
                  Pause
                </button>
                <button type="button" onClick={handleCancel}>
                  Cancel
                </button>
              </>
            )}
            {phase === "paused" && (
              <>
                <span role="status">Paused</span>
                <button type="button" onClick={handleResume}>
                  Resume
                </button>
                <button type="button" onClick={handleCancel}>
                  Cancel
                </button>
              </>
            )}
            {phase === "cancelled" && (
              <>
                <span role="status">Cancelled. Pages already processed were saved.</span>
                <button type="button" onClick={handleStart}>
                  Run OCR again
                </button>
              </>
            )}
            {phase === "failed" && (
              <>
                <p className="ocr-workspace-error" role="alert">
                  Failed: {error}
                </p>
                <button type="button" onClick={handleStart}>
                  Try again
                </button>
              </>
            )}
            {phase === "complete" && (
              <p className="ocr-workspace-complete" role="status">
                <span className="ocr-complete-icon" aria-hidden="true">
                  ✓
                </span>
                <span>
                  OCR complete
                  <br />
                  <span className="ocr-workspace-complete-detail">Pages processed successfully · corrections can be reviewed</span>
                </span>
              </p>
            )}
          </div>
          <div className="ocr-workspace-page-text">
            <h3>Page correction</h3>
            <div className="ocr-workspace-page-text-meta">
              Page {viewedPage} · OCR text preview
            </div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} aria-label="Correct OCR text" />
            <button type="button" onClick={handleSaveCorrection}>
              Save correction
            </button>
            <div className="ocr-workspace-hint">Manual corrections are preserved as user data; raw OCR can be rebuilt.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
