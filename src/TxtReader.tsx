import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DocumentLocationDTO {
  book_id: string;
  format: string;
  progression_hint: number;
  primary_anchor: string;
  fallback_anchors: string[];
  context_selector: string | null;
}

interface TxtReaderProps {
  bookId: string;
  title: string;
  onBack: () => void;
}

// Minimal TXT reading surface: plain-text has no pagination/typography of
// its own, so "stable reopen" (ARCHITECTURE.md SS5) is scroll-fraction
// based -- progression_hint is the primary restore signal, with a computed
// character offset saved alongside it as primary_anchor (consistent with
// tooling/m0-evidence's TXT DocumentLocation spike, which validated
// character-offset + context-fallback stability at the domain level).
export function TxtReader({ bookId, title, onBack }: TxtReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bytes = await invoke<number[]>("read_book_file_command", { bookId });
      if (cancelled) return;
      const decoded = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
      setText(decoded);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (text === null || restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
      const container = containerRef.current;
      if (saved && container && saved.progression_hint > 0) {
        container.scrollTop = saved.progression_hint * (container.scrollHeight - container.clientHeight);
      }
    })();
  }, [text, bookId]);

  function handleScroll() {
    const container = containerRef.current;
    if (!container || text === null) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const fraction = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
    const charOffset = Math.round(fraction * text.length);

    const location: DocumentLocationDTO = {
      book_id: bookId,
      format: "txt",
      progression_hint: fraction,
      primary_anchor: String(charOffset),
      fallback_anchors: [],
      context_selector: text.slice(charOffset, charOffset + 40) || null,
    };
    invoke("save_reading_location_command", { location }).catch(() => {});
  }

  return (
    <div className="reader">
      <div className="reader-toolbar">
        <button type="button" onClick={onBack}>
          Back to Library
        </button>
        <span>{title}</span>
      </div>
      <div ref={containerRef} className="reader-surface txt-surface" onScroll={handleScroll}>
        <pre>{text ?? "Loading…"}</pre>
      </div>
    </div>
  );
}
