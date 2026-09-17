import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined" && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

// In-memory session cache for extracted PDF cover Object URLs.
// Keyed by bookId -> Object URL (string) if available, or null if failed / no cover.
const coverUrlCache = new Map<string, string | null>();

// In-flight Promise cache to prevent redundant concurrent parsing when the same book
// appears in multiple locations (e.g. Continue Reading + Library grid).
const inFlightPromises = new Map<string, Promise<string | null>>();

// Maximum concurrent PDF page 1 extraction/render jobs.
const MAX_CONCURRENT_PDF_COVERS = 2;
let activeJobCount = 0;
const pendingQueue: (() => void)[] = [];

function runQueuedJob<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const execute = () => {
      activeJobCount++;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeJobCount--;
          if (pendingQueue.length > 0) {
            const next = pendingQueue.shift()!;
            next();
          }
        });
    };

    if (activeJobCount < MAX_CONCURRENT_PDF_COVERS) {
      execute();
    } else {
      pendingQueue.push(execute);
    }
  });
}

/**
 * Clears the in-memory PDF cover cache and revokes all allocated Object URLs.
 */
export function clearPdfCoverCache(): void {
  for (const url of coverUrlCache.values()) {
    if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Safe swallow
      }
    }
  }
  coverUrlCache.clear();
  inFlightPromises.clear();
  pendingQueue.length = 0;
  activeJobCount = 0;
}

/**
 * Marks a PDF book's cover as broken (e.g. on <img> error), preventing future load attempts.
 */
export function markPdfCoverBroken(bookId: string): void {
  const currentUrl = coverUrlCache.get(bookId);
  if (currentUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    try {
      URL.revokeObjectURL(currentUrl);
    } catch {
      // Safe swallow
    }
  }
  coverUrlCache.set(bookId, null);
}

/**
 * Retrieves the cached PDF cover URL or renders a thumbnail of Page 1 asynchronously.
 * Returns null immediately for non-PDF formats without IPC or pdfjs parsing.
 */
export async function getOrFetchPdfCoverUrl(bookId: string, format: string): Promise<string | null> {
  if (format.toLowerCase() !== "pdf") {
    return null;
  }

  if (coverUrlCache.has(bookId)) {
    return coverUrlCache.get(bookId)!;
  }

  if (inFlightPromises.has(bookId)) {
    return inFlightPromises.get(bookId)!;
  }

  const promise = (async () => {
    return runQueuedJob(async () => {
      let pdf: any = null;
      let page: any = null;
      try {
        const fileData = await invoke<ArrayBuffer | Uint8Array>("read_book_file_command", { bookId });
        const uint8 = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);

        const loadingTask = getDocument({
          data: uint8,
          cMapUrl: "/cmaps/",
          cMapPacked: true,
          wasmUrl: "/wasm/",
        });

        pdf = await loadingTask.promise;
        if (!pdf || pdf.numPages < 1) {
          coverUrlCache.set(bookId, null);
          return null;
        }

        page = await pdf.getPage(1);
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // Thumbnail target: cap max dimension around 360px for sharp, lightweight rendering
        const maxDimension = 360;
        const scale = Math.min(
          maxDimension / Math.max(unscaledViewport.width || 1, unscaledViewport.height || 1),
          1.5,
        );
        const viewport = page.getViewport({ scale: Math.max(0.2, scale) });

        if (typeof document === "undefined") {
          coverUrlCache.set(bookId, null);
          return null;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          coverUrlCache.set(bookId, null);
          return null;
        }

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });
        await renderTask.promise;

        const blob = await new Promise<Blob | null>((resolve) => {
          if (typeof canvas.toBlob === "function") {
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
          } else {
            resolve(null);
          }
        });

        if (blob && blob.size > 0 && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          const url = URL.createObjectURL(blob);
          coverUrlCache.set(bookId, url);
          return url;
        }

        coverUrlCache.set(bookId, null);
        return null;
      } catch {
        coverUrlCache.set(bookId, null);
        return null;
      } finally {
        try {
          page?.cleanup?.();
          await pdf?.destroy?.();
        } catch {
          // ignore cleanup error
        }
        inFlightPromises.delete(bookId);
      }
    });
  })();

  inFlightPromises.set(bookId, promise);
  return promise;
}

/**
 * React hook to retrieve a PDF book's Page 1 cover thumbnail with visibility-gated loading.
 */
export function usePdfCover(
  bookId: string,
  format: string,
  enabled: boolean = true,
): {
  coverUrl: string | null;
  isBroken: boolean;
  markBroken: () => void;
} {
  const isPdf = format.toLowerCase() === "pdf";
  const [coverUrl, setCoverUrl] = useState<string | null>(() => {
    if (!isPdf) return null;
    return coverUrlCache.get(bookId) ?? null;
  });
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    if (!isPdf || isBroken || !enabled) return;
    let cancelled = false;

    getOrFetchPdfCoverUrl(bookId, format).then((url) => {
      if (!cancelled) {
        setCoverUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bookId, format, isPdf, isBroken, enabled]);

  const markBroken = () => {
    setIsBroken(true);
    setCoverUrl(null);
    markPdfCoverBroken(bookId);
  };

  return { coverUrl, isBroken, markBroken };
}
