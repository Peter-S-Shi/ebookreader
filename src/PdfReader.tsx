import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

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

// Minimal PDF reading surface: renders one page at a time to a canvas via
// pdf.js (the engine ARCHITECTURE.md SS5/M0-C validated for text/geometry
// extraction). page index is the DocumentLocation primary_anchor for this
// format, per ARCHITECTURE.md SS5's "candidates to validate: page index;
// page geometry/bounding box". Zoom/fit, text selection, and search are
// later M2 checkpoints, not this one.
export function PdfReader({ bookId, title, onBack }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Loading…");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

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

  useEffect(() => {
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

      const location: DocumentLocationDTO = {
        book_id: bookId,
        format: "pdf",
        progression_hint: pdf.numPages > 0 ? pageNumber / pdf.numPages : 0,
        primary_anchor: String(pageNumber),
        fallback_anchors: [],
        context_selector: null,
      };
      invoke("save_reading_location_command", { location }).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [pageNumber, bookId]);

  return (
    <div className="reader">
      <div className="reader-toolbar">
        <button type="button" onClick={onBack}>
          Back to Library
        </button>
        <span>{title}</span>
        <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}>
          Previous
        </button>
        <span>
          Page {pageNumber}
          {pageCount > 0 ? ` of ${pageCount}` : ""}
        </span>
        <button type="button" disabled={pageCount > 0 && pageNumber >= pageCount} onClick={() => setPageNumber((p) => p + 1)}>
          Next
        </button>
        <span>{status}</span>
      </div>
      <div className="reader-surface">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
