import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReaderShell } from "./ReaderShell";
import { TypographyPanel } from "./TypographyPanel";
import { NotebookPanel } from "./NotebookPanel";
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from "./typography";
import { useReadingProgress } from "./useReadingProgress";
import { CompletionPrompt } from "./CompletionPrompt";
import { useActualReadingTimeHeartbeat } from "./useActualReadingTimeHeartbeat";

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
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [typographyOpen, setTypographyOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const { showCompletionPrompt, advance, startNextRead, dismissCompletionPrompt } = useReadingProgress(bookId);
  useActualReadingTimeHeartbeat(bookId);

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
    advance(fraction);
  }

  const textStyle: React.CSSProperties = {
    fontFamily: typography.fontFamily ?? undefined,
    fontSize: `${typography.fontSizePercent}%`,
    lineHeight: typography.lineHeight,
    maxWidth: `${typography.pageWidthCh}ch`,
  };

  return (
    <ReaderShell
      title={title}
      onBack={onBack}
      toolbarExtra={
        <>
          <button type="button" onClick={() => setTypographyOpen((open) => !open)}>
            Aa
          </button>
          <button type="button" onClick={() => setNotebookOpen((open) => !open)}>
            Notebook
          </button>
        </>
      }
      overlay={
        <>
          {typographyOpen && (
            <TypographyPanel
              settings={typography}
              onChange={setTypography}
              onClose={() => setTypographyOpen(false)}
            />
          )}
          {notebookOpen && (
            <NotebookPanel
              bookId={bookId}
              onClose={() => setNotebookOpen(false)}
              onJumpTo={(anchor) => {
                const container = containerRef.current;
                if (container && text !== null) {
                  const charOffset = parseInt(anchor.primary_anchor, 10);
                  const fraction = Number.isFinite(charOffset) && text.length > 0 ? charOffset / text.length : 0;
                  container.scrollTop = fraction * (container.scrollHeight - container.clientHeight);
                }
                setNotebookOpen(false);
              }}
            />
          )}
        </>
      }
    >
      {showCompletionPrompt && (
        <CompletionPrompt onStartNextRead={startNextRead} onDismiss={dismissCompletionPrompt} />
      )}
      <div ref={containerRef} className="reader-surface txt-surface" onScroll={handleScroll}>
        <pre style={textStyle}>{text ?? "Loading…"}</pre>
      </div>
    </ReaderShell>
  );
}
