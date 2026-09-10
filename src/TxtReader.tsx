import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReaderShell } from "./ReaderShell";
import { TypographyPanel } from "./TypographyPanel";
import { NotebookPanel } from "./NotebookPanel";
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from "./typography";
import { loadPerBookTypography, savePerBookTypography } from "./appSettings";
import { toTextStyle } from "./typography";
import { useReadingProgress } from "./useReadingProgress";
import { CompletionPrompt } from "./CompletionPrompt";
import { useActualReadingTimeHeartbeat } from "./useActualReadingTimeHeartbeat";
import { useReadingCheckpoint } from "./useReadingCheckpoint";
import { ReadingCheckpointPrompt } from "./ReadingCheckpointPrompt";
import { useRecordBookOpened } from "./useRecordBookOpened";
import { extractHighlightColor, formatContextSelector, HIGHLIGHT_COLORS, type HighlightColor } from "./highlightUtils";

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
  // FC-C01/FC-C02: a source location (from a Search hit or a Notebook
  // asset) to scroll to on open, instead of resuming the last position.
  initialAnchor?: DocumentLocationDTO;
}

// Minimal TXT reading surface: plain-text has no pagination/typography of
// its own, so "stable reopen" (ARCHITECTURE.md SS5) is scroll-fraction
// based -- progression_hint is the primary restore signal, with a computed
// character offset saved alongside it as primary_anchor (consistent with
// tooling/m0-evidence's TXT DocumentLocation spike, which validated
// character-offset + context-fallback stability at the domain level).
export function TxtReader({ bookId, title, onBack, initialAnchor }: TxtReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [jumpFailed, setJumpFailed] = useState(false);
  const restoredRef = useRef(false);
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [typographyOpen, setTypographyOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookRefreshKey, setNotebookRefreshKey] = useState(0);
  const [selection, setSelection] = useState<{ text: string; startOffset: number } | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
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
      const decoded = new TextDecoder("utf-8").decode(uint8Bytes);
      setText(decoded);
      loadPerBookTypography(bookId).then((loaded) => {
        if (!cancelled) setTypography(loaded);
      });

      // Whole-book text into the search index (PRODUCT_SPEC.md SS12:
      // "supported book text" is a required Library-wide Search source).
      // FC-C01: indexing the whole file as one entry (the original
      // approach) has no sub-position to anchor a jump to -- TXT has no
      // natural section boundaries the way EPUB/PDF do, but paragraphs
      // (blank-line-separated runs) are a real, resolvable one: each
      // entry's primary_anchor is the real character offset where that
      // paragraph starts in `decoded`, the same offset scheme
      // `handleScroll`/`onJumpTo` below already use for jump-to-asset.
      let cursor = 0;
      for (const paragraph of decoded.split(/\n{2,}/)) {
        const start = decoded.indexOf(paragraph, cursor);
        const paragraphStart = start >= 0 ? start : cursor;
        cursor = paragraphStart + paragraph.length;
        if (!paragraph.trim()) continue;
        const anchor: DocumentLocationDTO = {
          book_id: bookId,
          format: "txt",
          progression_hint: decoded.length > 0 ? paragraphStart / decoded.length : 0,
          primary_anchor: String(paragraphStart),
          fallback_anchors: [],
          context_selector: paragraph.slice(0, 80),
        };
        invoke("index_search_text_command", {
          bookId,
          kind: "book_text",
          entryId: String(paragraphStart),
          content: paragraph,
          anchor,
        }).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (text === null || restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      const container = containerRef.current;
      if (!container) return;

      // FC-C01/FC-C02: an exact jump takes priority over the resume
      // position. An out-of-range anchor is reported truthfully rather
      // than silently scrolling to an arbitrary spot.
      if (initialAnchor?.primary_anchor) {
        const charOffset = parseInt(initialAnchor.primary_anchor, 10);
        const valid = Number.isFinite(charOffset) && charOffset >= 0 && charOffset <= text.length;
        if (valid) {
          const fraction = text.length > 0 ? charOffset / text.length : 0;
          container.scrollTop = fraction * (container.scrollHeight - container.clientHeight);
        }
        setJumpFailed(!valid);
        return;
      }

      const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
      if (saved && saved.progression_hint > 0) {
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
      const preRange = document.createRange();
      preRange.selectNodeContents(container);
      preRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = preRange.toString().length;

      setSelection({ text: selectedText, startOffset });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  useEffect(() => {
    if (text === null) return;
    const container = containerRef.current;
    if (!container) return;

    invoke<Array<{ kind: string; text: string; anchor?: DocumentLocationDTO }>>("list_reading_assets_command", { bookId })
      .then((assets) => {
        const annotations = assets.filter((a) => a.kind === "annotation" && a.text?.trim());
        for (const ann of annotations) {
          const query = ann.text.trim();
          if (!query || !container) continue;
          const color = extractHighlightColor(ann.anchor?.context_selector);
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (node.parentElement?.classList.contains("reader-highlight")) continue;
            const textVal = node.nodeValue;
            if (textVal && textVal.includes(query)) {
              try {
                const range = document.createRange();
                const idx = textVal.indexOf(query);
                range.setStart(node, idx);
                range.setEnd(node, idx + query.length);
                const mark = document.createElement("mark");
                mark.className = "reader-highlight";
                mark.dataset.color = color;
                range.surroundContents(mark);
              } catch {
                // fallback
              }
              break;
            }
          }
        }
      })
      .catch(() => {});
  }, [text, bookId, notebookRefreshKey]);

  async function handleCaptureSelection(kind: "annotation" | "excerpt", selectedColor?: HighlightColor) {
    if (!selection || text === null) return;
    const color = selectedColor ?? highlightColor;
    if (kind === "annotation") {
      try {
        const sel = document.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const mark = document.createElement("mark");
          mark.className = "reader-highlight";
          mark.dataset.color = color;
          range.surroundContents(mark);
        }
      } catch {
        const sel = document.getSelection();
        const containerNode = sel?.anchorNode?.nodeType === 1
          ? (sel.anchorNode as HTMLElement)
          : sel?.anchorNode?.parentElement;
        const existingMark = containerNode?.closest?.(".reader-highlight") as HTMLElement | null;
        if (existingMark) {
          existingMark.dataset.color = color;
        }
      }
    }
    const anchor: DocumentLocationDTO = {
      book_id: bookId,
      format: "txt",
      progression_hint: text.length > 0 ? selection.startOffset / text.length : 0,
      primary_anchor: String(selection.startOffset),
      fallback_anchors: [],
      context_selector: formatContextSelector(selection.text, color),
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

  function handleTypographyChange(next: TypographySettings) {
    setTypography(next);
    savePerBookTypography(bookId, next).catch(() => {});
  }

  const textStyle: React.CSSProperties = toTextStyle(typography);

  return (
    <ReaderShell
      title={title}
      onBack={() => checkpoint.requestBack(onBack)}
      progressPercent={progress?.active_pass_progress}
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
              onChange={handleTypographyChange}
              onClose={() => setTypographyOpen(false)}
            />
          )}
          {notebookOpen && (
            <NotebookPanel
              key={notebookRefreshKey}
              bookId={bookId}
              bookTitle={title}
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
      {selection && (
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
          </div>
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
