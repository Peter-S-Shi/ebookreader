import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// In-memory session cache for extracted EPUB cover Object URLs.
// Keyed by bookId -> Object URL (string) if available, or null if no cover / failed.
const coverUrlCache = new Map<string, string | null>();

// In-flight Promise cache to prevent redundant concurrent parsing when the same book
// appears in multiple locations (e.g. Continue Reading + Library grid).
const inFlightPromises = new Map<string, Promise<string | null>>();

/**
 * Clears the in-memory cover cache and revokes all allocated Object URLs.
 */
export function clearEpubCoverCache(): void {
  for (const url of coverUrlCache.values()) {
    if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Safe swallow if already revoked
      }
    }
  }
  coverUrlCache.clear();
  inFlightPromises.clear();
}

/**
 * Marks a book's cover as broken (e.g. on <img> error), preventing future load attempts.
 */
export function markEpubCoverBroken(bookId: string): void {
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
 * Retrieves the cached cover URL or extracts it asynchronously from the EPUB container.
 * Returns null immediately for non-EPUB formats without IPC or parsing.
 */
export async function getOrFetchEpubCoverUrl(bookId: string, format: string): Promise<string | null> {
  if (format.toLowerCase() !== "epub") {
    return null;
  }

  if (coverUrlCache.has(bookId)) {
    return coverUrlCache.get(bookId)!;
  }

  if (inFlightPromises.has(bookId)) {
    return inFlightPromises.get(bookId)!;
  }

  const promise = (async () => {
    try {
      const fileData = await invoke<ArrayBuffer | Uint8Array>("read_book_file_command", { bookId });
      const uint8 = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
      const file = new File([uint8 as unknown as BlobPart], `${bookId}.epub`, { type: "application/epub+zip" });

      // @ts-expect-error -- foliate-js has no published type declarations
      const { makeBook } = await import("foliate-js/view.js");
      const book = await makeBook(file);
      const blob = await book?.getCover?.();

      if (blob && blob instanceof Blob && blob.size > 0) {
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
      inFlightPromises.delete(bookId);
    }
  })();

  inFlightPromises.set(bookId, promise);
  return promise;
}

/**
 * React hook to retrieve an EPUB book's cover URL with reactive update.
 */
export function useEpubCover(bookId: string, format: string): {
  coverUrl: string | null;
  isBroken: boolean;
  markBroken: () => void;
} {
  const isEpub = format.toLowerCase() === "epub";
  const [coverUrl, setCoverUrl] = useState<string | null>(() => {
    if (!isEpub) return null;
    return coverUrlCache.get(bookId) ?? null;
  });
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    if (!isEpub || isBroken) return;
    let cancelled = false;

    getOrFetchEpubCoverUrl(bookId, format).then((url) => {
      if (!cancelled) {
        setCoverUrl(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bookId, format, isEpub, isBroken]);

  const markBroken = () => {
    setIsBroken(true);
    setCoverUrl(null);
    markEpubCoverBroken(bookId);
  };

  return { coverUrl, isBroken, markBroken };
}
