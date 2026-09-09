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
  const [notebookRefreshKey, setNotebookRefreshKey] = useState(0);
  const [selection, setSelection] = useState<{ text: string; startOffset: number } | null>(null);
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

  // Text-selection -> Highlight/Excerpt capture (PRODUCT_SPEC.md SS11).
  // The absolute character offset is computed the same way regardless of
  // DOM node structure: count the rendered text from the container's
  // start up to the selection's start.
  useEffect(() => {
    function handleSelectionChange() {
      const container = containerRef.current;
      const sel = document.getSelection();
      if (!container || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const selectedText = sel.toString();
      if (!selectedText.trim()) {
        setSelection(null);
        return;
      }
      const startRange = document.createRange();
      startRange.selectNodeContents(container);
      startRange.setEnd(range.startContainer, range.startOffset);
      setSelection({ text: selectedText, startOffset: startRange.toString().length });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  async function handleCaptureSelection(kind: "annotation" | "excerpt") {
    if (!selection || text === null) return;
    const anchor: DocumentLocationDTO = {
      book_id: bookId,
      format: "txt",
      progression_hint: text.length > 0 ? selection.startOffset / text.length : 0,
      primary_anchor: String(selection.startOffset),
      fallback_anchors: [],
      context_selector: selection.text.slice(0, 80),
    };
    await invoke("create_reading_asset_command", { bookId, kind, text: selection.text, anchor }).catch(() => {});
    document.getSelection()?.removeAllRanges();
    setSelection(null);
    setNotebookRefreshKey((k) => k + 1);
  }

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
              key={notebookRefreshKey}
              bookId={bookId}
              onClose={() => setNotebookOpen(false)}
              onJumpTo={(asset) => {
                const container = containerRef.current;
                if (!asset.anchor || !container || text === null) return false;
                const charOffset = parseInt(asset.anchor.primary_anchor, 10);
                if (!Number.isFinite(charOffset) || charOffset < 0 || charOffset > text.length) return false;
                const fraction = text.length > 0 ? charOffset / text.length : 0;
                container.scrollTop = fraction * (container.scrollHeight - container.clientHeight);
                return true;
              }}
            />
          )}
        </>
      }
    >
      {showCompletionPrompt && (
        <CompletionPrompt onStartNextRead={startNextRead} onDismiss={dismissCompletionPrompt} />
      )}
      {selection && (
        <div className="selection-toolbar" role="toolbar" aria-label="Selection actions">
          <button type="button" onClick={() => handleCaptureSelection("annotation")}>
            Highlight
          </button>
          <button type="button" onClick={() => handleCaptureSelection("excerpt")}>
            Excerpt
          </button>
        </div>
      )}
      <div ref={containerRef} className="reader-surface txt-surface" onScroll={handleScroll}>
        <pre style={textStyle}>{text ?? "Loading…"}</pre>
      </div>
    </ReaderShell>
  );
}
