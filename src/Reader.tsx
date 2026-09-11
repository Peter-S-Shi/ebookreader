import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReaderShell } from "./ReaderShell";
import { TypographyPanel } from "./TypographyPanel";
import { TocPanel, type TocItem } from "./TocPanel";
import { NotebookPanel } from "./NotebookPanel";
import { DEFAULT_TYPOGRAPHY, toEpubCss, type TypographySettings } from "./typography";
import { loadPerBookTypography, savePerBookTypography } from "./appSettings";
import { applyPageWidth, applyViewMode, VIEW_MODE_LABELS, type ViewMode } from "./viewMode";
import { useSoundToggle } from "./useSoundToggle";
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

interface ReaderProps {
  bookId: string;
  title: string;
  onBack: () => void;
  // FC-C01/FC-C02: a source location (from a Search hit or a Notebook
  // asset) to seek to on open, instead of resuming the last reading
  // position. Absent for a normal open.
  initialAnchor?: DocumentLocationDTO;
}

// The <foliate-view> custom element foliate-js registers; it ships no
// published type declarations, so this is a minimal local shape covering
// only the API this component actually calls.
interface FoliateRenderer {
  setStyles(css: string): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}
interface FoliateSection {
  createDocument?: () => Promise<Document>;
  // foliate-js's own precomputed base CFI for this section (epub.js
  // `sections[i].cfi`) -- a real, resolvable `view.goTo()` target, so
  // FC-C01's per-section search index entries can carry a genuine anchor
  // rather than none at all.
  cfi?: string;
}
interface FoliateBook {
  toc?: TocItem[];
  sections?: FoliateSection[];
}
interface FoliateView extends HTMLElement {
  open(file: File): Promise<void>;
  // foliate-js's goTo() never rejects on an unresolvable target -- it
  // catches internally and resolves to `undefined` -- so a resolved
  // (non-undefined) return is the only failure signal available.
  goTo(target: string): Promise<unknown>;
  goToTextStart(): Promise<unknown>;
  prev(distance?: number): Promise<unknown>;
  next(distance?: number): Promise<unknown>;
  goLeft(): Promise<unknown>;
  goRight(): Promise<unknown>;
  getCFI(index: number, range: Range): string;
  lastLocation?: { cfi?: string; fraction?: number };
  isFixedLayout?: boolean;
  renderer?: FoliateRenderer;
  book?: FoliateBook;
}

type OpenPanel = "typography" | "toc" | "notebook" | null;

// HA-007: the app's currently-effective Dark theme (`Settings.tsx`
// Appearance applies an explicit choice as `data-theme` on <html>;
// "Match System" leaves it unset and falls through to the OS
// `prefers-color-scheme`), computed the same way `App.css`'s own CSS
// cascade already does -- but in JS, since this needs to reach
// `toEpubCss`, not just a stylesheet.
function isDarkModeActive(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

interface ActiveSelection {
  doc: Document;
  range: Range;
  text: string;
  index: number;
  assetId?: string;
}

// Minimal EPUB reading surface: opens the Book via foliate-js and keeps
// its DocumentLocation (ARCHITECTURE.md SS5) durable across reopens by
// saving/loading through the Tauri command layer on every relocate.
// DESIGN.md SS7/SS8: reflowable EPUB gets typography controls (`Aa`);
// fixed-layout does not (foliate-js's own `isFixedLayout` flag gates it,
// since "do not expose reflow typography that cannot work"). DESIGN.md
// SS5: Contents panel navigates via the publication's own TOC, when it
// has one. DESIGN.md's Notebook side panel is a later M2/M4 checkpoint.
export function Reader({ bookId, title, onBack, initialAnchor }: ReaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [jumpFailed, setJumpFailed] = useState(false);
  const [isFixedLayout, setIsFixedLayout] = useState(false);
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("paginated-double");
  const viewModeRef = useRef<ViewMode>("paginated-double");
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [notebookRefreshKey, setNotebookRefreshKey] = useState(0);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const { enabled: soundEnabled, toggle: toggleSound, playPageTurn } = useSoundToggle();
  const playPageTurnRef = useRef(playPageTurn);
  useEffect(() => {
    playPageTurnRef.current = playPageTurn;
  }, [playPageTurn]);
  const { progress, showCompletionPrompt, advance, startNextRead, dismissCompletionPrompt } = useReadingProgress(bookId);
  useActualReadingTimeHeartbeat(bookId);
  const checkpoint = useReadingCheckpoint();
  useRecordBookOpened(bookId);
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    const readingInputDocs = new WeakSet<Document>();
    const readingInputCleanups: Array<() => void> = [];

    function attachReadingInput(doc: Document) {
      if (readingInputDocs.has(doc)) return;
      readingInputDocs.add(doc);
      doc.addEventListener("keydown", handleReadingKeyDown);
      doc.addEventListener("wheel", handleReadingWheel, { passive: false });
      readingInputCleanups.push(() => {
        doc.removeEventListener("keydown", handleReadingKeyDown);
        doc.removeEventListener("wheel", handleReadingWheel);
      });
    }

    (async () => {
      // @ts-expect-error -- foliate-js has no published type declarations
      await import("foliate-js/view.js");
      if (cancelled) return;

      if (!hostRef.current || cancelled) return;
      hostRef.current.innerHTML = "";

      const fileData = await invoke<ArrayBuffer | Uint8Array>("read_book_file_command", { bookId });
      if (cancelled) return;
      const uint8 = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
      const file = new File([uint8 as unknown as BlobPart], `${title}.epub`, { type: "application/epub+zip" });

      const view = document.createElement("foliate-view") as unknown as FoliateView;
      view.style.cssText = "width:100%;height:100%;display:block";
      viewRef.current = view;
      hostRef.current.replaceChildren(view);

      await view.open(file);
      if (cancelled) return;
      const initialTypography = await loadPerBookTypography(bookId);
      if (cancelled) return;
      setTypography(initialTypography);
      setStatus("Ready");
      setIsFixedLayout(Boolean(view.isFixedLayout));
      setToc(view.book?.toc ?? []);
      if (!view.isFixedLayout) {
        view.renderer?.setStyles(toEpubCss(initialTypography, isDarkModeActive()));
        if (view.renderer) {
          applyPageWidth(view.renderer, initialTypography.pageWidthCh);
          applyViewMode(view.renderer, viewMode);
        }
      }

      // Text-selection -> Highlight/Excerpt capture (PRODUCT_SPEC.md SS11:
      // "text selection exposes lightweight Highlight / Excerpt / Note
      // actions"). foliate-js renders each section into its own document
      // (an iframe under the shadow root), so selection and reading input
      // must be tracked per-document as sections load, before the first
      // goTo/goToTextStart call can load the initial section.
      view.addEventListener("load", (event: Event) => {
        const detail = (event as CustomEvent).detail ?? {};
        const doc = detail.doc as Document | undefined;
        if (!doc) return;
        attachReadingInput(doc);

        // Rehydrate persistent highlights into section document
        invoke<Array<{ id: string; kind: string; text: string; orphaned: boolean; anchor?: DocumentLocationDTO }>>("list_reading_assets_command", { bookId })
          .then((assets) => {
            const annotations = assets.filter((a) => a.kind === "annotation" && !a.orphaned && a.text?.trim());
            for (const ann of annotations) {
              const query = ann.text.trim();
              if (!query || !doc.body) continue;
              const color = extractHighlightColor(ann.anchor?.context_selector);
              const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
              let node: Node | null;
              while ((node = walker.nextNode())) {
                if (node.parentElement?.classList.contains("reader-highlight")) continue;
                const textVal = node.nodeValue;
                if (textVal && textVal.includes(query)) {
                  try {
                    const range = doc.createRange();
                    const idx = textVal.indexOf(query);
                    range.setStart(node, idx);
                    range.setEnd(node, idx + query.length);
                    const mark = doc.createElement("mark");
                    mark.className = "reader-highlight";
                    mark.dataset.color = color;
                    mark.dataset.assetId = ann.id;
                    mark.addEventListener("click", (e) => {
                      e.stopPropagation();
                      const markRange = doc.createRange();
                      markRange.selectNodeContents(mark);
                      setSelection({ doc, range: markRange, text: mark.textContent || "", index: 0, assetId: ann.id });
                    });
                    range.surroundContents(mark);
                  } catch {
                    // range boundary fallback
                  }
                  break;
                }
              }
            }
          })
          .catch(() => {});

        doc.addEventListener("selectionchange", () => {
          const sel = doc.getSelection?.() || (doc.defaultView || window).getSelection?.();
          if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
            const text = sel.toString();
            if (text.trim()) {
              setSelection({ doc, range: sel.getRangeAt(0).cloneRange(), text, index: 0 });
              return;
            }
          }
          setSelection(null);
        });
      });

      view.addEventListener("relocate", (event: Event) => {
        const detail = (event as CustomEvent).detail ?? {};
        const cfi = detail.cfi ?? view.lastLocation?.cfi;
        if (!cfi) return;
        playPageTurnRef.current();
        if (hostRef.current && (viewModeRef.current as string) !== "continuous") {
          hostRef.current.classList.remove("page-turn-animating");
          void hostRef.current.offsetWidth;
          hostRef.current.classList.add("page-turn-animating");
          setTimeout(() => {
            hostRef.current?.classList.remove("page-turn-animating");
          }, 160);
        }
        const fraction = typeof detail.fraction === "number" ? detail.fraction : 0;
        const location: DocumentLocationDTO = {
          book_id: bookId,
          format: "epub",
          progression_hint: fraction,
          primary_anchor: cfi,
          fallback_anchors: [],
          context_selector: null,
        };
        invoke("save_reading_location_command", { location }).catch(() => {});
        advanceRef.current(fraction);
      });

      if (initialAnchor?.primary_anchor) {
        // FC-C01/FC-C02: an exact jump takes priority over the resume
        // location. foliate-js's goTo() never rejects -- it resolves to
        // `undefined` on an unresolvable target, the only failure signal
        // available -- so an unresolvable anchor is reported truthfully
        // rather than silently falling back to page one.
        const resolved = await view.goTo(initialAnchor.primary_anchor).catch(() => undefined);
        if (!cancelled) setJumpFailed(resolved === undefined);
      } else {
        const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
        if (cancelled) return;
        if (saved?.primary_anchor) {
          await view.goTo(saved.primary_anchor).catch(() => {});
        } else {
          // HA-002: `view.open()` only sets up foliate-js's renderer -- it
          // never renders any section by itself. A fresh Book has no saved
          // location yet, so without an explicit navigation call the
          // reading surface stays blank even though the TOC is already
          // populated. Show the Book's real text start (its own bodymatter
          // landmark, falling back to the first linear section).
          await view.goToTextStart().catch(() => {});
        }
      }

      // Whole-book text into the search index (PRODUCT_SPEC.md SS12:
      // "supported book text" is a required Library-wide Search source),
      // one entry per section. Runs in the background, sequentially, so
      // it doesn't compete with rendering.
      (async () => {
        const sections = view.book?.sections ?? [];
        for (let i = 0; i < sections.length; i++) {
          if (cancelled) return;
          const createDocument = sections[i].createDocument;
          if (!createDocument) continue;
          const doc = await createDocument();
          if (cancelled) return;
          const sectionText = doc.body?.textContent ?? "";
          if (sectionText.trim()) {
            // FC-C01: `sections[i].cfi` is foliate-js's own precomputed
            // base CFI for this section -- a real anchor `view.goTo()`
            // can resolve, not a fabricated position.
            const cfi = sections[i].cfi;
            const anchor: DocumentLocationDTO | null = cfi
              ? {
                  book_id: bookId,
                  format: "epub",
                  progression_hint: sections.length > 0 ? i / sections.length : 0,
                  primary_anchor: cfi,
                  fallback_anchors: [],
                  context_selector: null,
                }
              : null;
            await invoke("index_search_text_command", {
              bookId,
              kind: "book_text",
              entryId: String(i),
              content: sectionText,
              anchor,
            }).catch(() => {});
          }
        }
      })();
    })();

    return () => {
      cancelled = true;
      readingInputCleanups.forEach((cleanup) => cleanup());
    };
  }, [bookId, title]);

  function shouldLetTargetHandleInput(target: EventTarget | null): boolean {
    const element = target && typeof (target as Element).closest === "function" ? (target as Element) : null;
    if (!element) return false;
    return Boolean(
      element.closest(
        "input, textarea, select, button, [contenteditable='true'], .typography-panel, .toc-panel, .notebook-panel, .selection-toolbar, .completion-prompt",
      ),
    );
  }

  function isPaginatedMode() {
    return viewModeRef.current !== "scrolled";
  }

  function handleReadingKeyDown(event: KeyboardEvent) {
    if (!isPaginatedMode() || shouldLetTargetHandleInput(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      viewRef.current?.goRight().catch(() => {});
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      viewRef.current?.goLeft().catch(() => {});
    }
  }

  interface ReadingWheelEvent {
    deltaX: number;
    deltaY: number;
    target: EventTarget | null;
    preventDefault(): void;
  }

  function handleReadingWheel(event: ReadingWheelEvent) {
    if (!isPaginatedMode() || shouldLetTargetHandleInput(event.target)) return;
    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(dominantDelta) < 10) return;
    event.preventDefault();
    if (dominantDelta > 0) {
      viewRef.current?.next(Math.abs(dominantDelta)).catch(() => {});
    } else {
      viewRef.current?.prev(Math.abs(dominantDelta)).catch(() => {});
    }
  }

  useEffect(() => {
    document.addEventListener("keydown", handleReadingKeyDown);
    return () => document.removeEventListener("keydown", handleReadingKeyDown);
  }, []);

  function handleReaderWheel(event: React.WheelEvent<HTMLDivElement>) {
    handleReadingWheel(event);
  }

  // HA-007: "Match System" theme mode means Dark can turn on/off while
  // the Reader is already open, if the OS preference itself changes --
  // re-apply the EPUB's color override live, same as the app shell's own
  // `@media (prefers-color-scheme: dark)` CSS already does automatically.
  useEffect(() => {
    if (isFixedLayout) return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = () => {
      if (document.documentElement.dataset.theme) return; // an explicit choice overrides the OS signal
      viewRef.current?.renderer?.setStyles(toEpubCss(typography, isDarkModeActive()));
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [typography, isFixedLayout]);

  function handleTypographyChange(next: TypographySettings) {
    setTypography(next);
    viewRef.current?.renderer?.setStyles(toEpubCss(next, isDarkModeActive()));
    if (viewRef.current?.renderer) applyPageWidth(viewRef.current.renderer, next.pageWidthCh);
    savePerBookTypography(bookId, next).catch(() => {});
  }

  function handleTocNavigate(href: string) {
    viewRef.current?.goTo(href).catch(() => {});
    setOpenPanel(null);
  }

  async function handleCaptureSelection(kind: "annotation" | "excerpt", selectedColor?: HighlightColor) {
    const active = selection;
    const view = viewRef.current;
    if (!active || !view) return;

    const color = selectedColor ?? highlightColor;
    const cfi = view.getCFI(active.index, active.range);
    const anchor: DocumentLocationDTO = {
      book_id: bookId,
      format: "epub",
      progression_hint: view.lastLocation?.fraction ?? 0,
      primary_anchor: cfi,
      fallback_anchors: [],
      context_selector: formatContextSelector(active.text, color),
    };

    let targetAssetId = active.assetId;
    const containerNode = active.range.startContainer.nodeType === 1
      ? (active.range.startContainer as HTMLElement)
      : active.range.startContainer.parentElement;
    const existingMark = containerNode?.closest?.(".reader-highlight") as HTMLElement | null;
    if (!targetAssetId && existingMark?.dataset?.assetId) {
      targetAssetId = existingMark.dataset.assetId;
    }

    if (kind === "annotation") {
      if (targetAssetId) {
        // Recolor existing asset by ID
        await invoke("update_reading_asset_anchor_command", {
          assetId: targetAssetId,
          anchor,
        }).catch(() => {});
        if (existingMark) {
          existingMark.dataset.color = color;
        }
      } else {
        // Create new asset
        try {
          const created = await invoke<{ id: string }>("create_reading_asset_command", {
            bookId,
            kind,
            text: active.text,
            anchor,
          });
          const mark = active.doc.createElement("mark");
          mark.className = "reader-highlight";
          mark.dataset.color = color;
          mark.dataset.assetId = created.id;
          mark.addEventListener("click", (e) => {
            e.stopPropagation();
            const markRange = active.doc.createRange();
            markRange.selectNodeContents(mark);
            setSelection({ doc: active.doc, range: markRange, text: mark.textContent || "", index: 0, assetId: created.id });
          });
          active.range.surroundContents(mark);
        } catch {
          // surround contents fallback if cross-node
        }
      }
    } else {
      await invoke("create_reading_asset_command", {
        bookId,
        kind,
        text: active.text,
        anchor,
      }).catch(() => {});
    }

    active.doc.getSelection?.()?.removeAllRanges();
    setSelection(null);
    setNotebookRefreshKey((k) => k + 1);
  }

  async function handleRemoveHighlight() {
    const active = selection;
    if (!active) return;

    let targetAssetId = active.assetId;
    const containerNode = active.range.startContainer.nodeType === 1
      ? (active.range.startContainer as HTMLElement)
      : active.range.startContainer.parentElement;
    const existingMark = containerNode?.closest?.(".reader-highlight") as HTMLElement | null;
    if (!targetAssetId && existingMark?.dataset?.assetId) {
      targetAssetId = existingMark.dataset.assetId;
    }

    if (existingMark) {
      const parent = existingMark.parentNode;
      while (existingMark.firstChild) {
        parent?.insertBefore(existingMark.firstChild, existingMark);
      }
      existingMark.remove();
    }

    if (targetAssetId) {
      await invoke("delete_reading_asset_command", { assetId: targetAssetId }).catch(() => {});
    }

    active.doc.getSelection?.()?.removeAllRanges();
    setSelection(null);
    setNotebookRefreshKey((k) => k + 1);
  }

  function handleViewModeChange(next: ViewMode) {
    setViewMode(next);
    const renderer = viewRef.current?.renderer;
    if (renderer) applyViewMode(renderer, next);
  }

  return (
    <ReaderShell
      title={title}
      onWheel={handleReaderWheel}
      onBack={() => checkpoint.requestBack(onBack)}
      status={status}
      progressPercent={progress?.active_pass_progress}
      toolbarExtra={
        <>
          {toc.length > 0 && (
            <button type="button" onClick={() => setOpenPanel((p) => (p === "toc" ? null : "toc"))}>
              Contents
            </button>
          )}
          {!isFixedLayout && (
            <>
              <select
                aria-label="View mode"
                value={viewMode}
                onChange={(e) => handleViewModeChange(e.target.value as ViewMode)}
              >
                {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {VIEW_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setOpenPanel((p) => (p === "typography" ? null : "typography"))}>
                Aa
              </button>
            </>
          )}
          <button type="button" aria-label="Toggle page-turn sound" onClick={toggleSound}>
            {soundEnabled ? "Sound: On" : "Sound: Off"}
          </button>
          <button type="button" onClick={() => setOpenPanel((p) => (p === "notebook" ? null : "notebook"))}>
            Notebook
          </button>
        </>
      }
      overlay={
        <>
          {openPanel === "toc" && (
            <TocPanel toc={toc} onNavigate={handleTocNavigate} onClose={() => setOpenPanel(null)} />
          )}
          {openPanel === "typography" && !isFixedLayout && (
            <TypographyPanel
              settings={typography}
              onChange={handleTypographyChange}
              onClose={() => setOpenPanel(null)}
            />
          )}
          {openPanel === "notebook" && (
            <NotebookPanel
              key={notebookRefreshKey}
              bookId={bookId}
              bookTitle={title}
              onClose={() => setOpenPanel(null)}
              onJumpTo={async (asset) => {
                if (!asset.anchor || !viewRef.current) return false;
                const resolved = await viewRef.current.goTo(asset.anchor.primary_anchor);
                return resolved !== undefined;
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
            <button
              type="button"
              className="highlight-swatch highlight-swatch--clear"
              aria-label="Remove highlight"
              title="Remove highlight"
              onClick={handleRemoveHighlight}
            />
          </div>
          <button type="button" onClick={() => handleCaptureSelection("annotation")}>
            Highlight
          </button>
          <button type="button" onClick={() => handleCaptureSelection("excerpt")}>
            Excerpt
          </button>
        </div>
      )}
      <div ref={hostRef} className="reader-surface" />
    </ReaderShell>
  );
}
