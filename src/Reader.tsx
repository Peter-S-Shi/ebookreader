import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReaderShell } from "./ReaderShell";
import { TypographyPanel } from "./TypographyPanel";
import { TocPanel, type TocItem } from "./TocPanel";
import { NotebookPanel } from "./NotebookPanel";
import { DEFAULT_TYPOGRAPHY, toEpubCss, type TypographySettings } from "./typography";
import { applyViewMode, VIEW_MODE_LABELS, type ViewMode } from "./viewMode";
import { useSoundToggle } from "./useSoundToggle";
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

interface ReaderProps {
  bookId: string;
  title: string;
  onBack: () => void;
}

// The <foliate-view> custom element foliate-js registers; it ships no
// published type declarations, so this is a minimal local shape covering
// only the API this component actually calls.
interface FoliateRenderer {
  setStyles(css: string): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}
interface FoliateBook {
  toc?: TocItem[];
}
interface FoliateView extends HTMLElement {
  open(file: File): Promise<void>;
  goTo(target: string): Promise<void>;
  getCFI(index: number, range: Range): string;
  lastLocation?: { cfi?: string; fraction?: number };
  isFixedLayout?: boolean;
  renderer?: FoliateRenderer;
  book?: FoliateBook;
}

type OpenPanel = "typography" | "toc" | "notebook" | null;

interface ActiveSelection {
  doc: Document;
  range: Range;
  text: string;
  index: number;
}

// Minimal EPUB reading surface: opens the Book via foliate-js and keeps
// its DocumentLocation (ARCHITECTURE.md SS5) durable across reopens by
// saving/loading through the Tauri command layer on every relocate.
// DESIGN.md SS7/SS8: reflowable EPUB gets typography controls (`Aa`);
// fixed-layout does not (foliate-js's own `isFixedLayout` flag gates it,
// since "do not expose reflow typography that cannot work"). DESIGN.md
// SS5: Contents panel navigates via the publication's own TOC, when it
// has one. DESIGN.md's Notebook side panel is a later M2/M4 checkpoint.
export function Reader({ bookId, title, onBack }: ReaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [isFixedLayout, setIsFixedLayout] = useState(false);
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("paginated-double");
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [notebookRefreshKey, setNotebookRefreshKey] = useState(0);
  const { enabled: soundEnabled, toggle: toggleSound, playPageTurn } = useSoundToggle();
  const playPageTurnRef = useRef(playPageTurn);
  useEffect(() => {
    playPageTurnRef.current = playPageTurn;
  }, [playPageTurn]);
  const { showCompletionPrompt, advance, startNextRead, dismissCompletionPrompt } = useReadingProgress(bookId);
  useActualReadingTimeHeartbeat(bookId);
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // @ts-expect-error -- foliate-js has no published type declarations
      await import("foliate-js/view.js");
      if (cancelled) return;

      const bytes = await invoke<number[]>("read_book_file_command", { bookId });
      if (cancelled) return;
      const file = new File([new Uint8Array(bytes)], `${title}.epub`, { type: "application/epub+zip" });

      const view = document.createElement("foliate-view") as FoliateView;
      view.style.cssText = "width:100%;height:100%;display:block";
      hostRef.current?.replaceChildren(view);
      viewRef.current = view;

      await view.open(file);
      if (cancelled) return;
      setStatus("Ready");
      setIsFixedLayout(Boolean(view.isFixedLayout));
      setToc(view.book?.toc ?? []);
      if (!view.isFixedLayout) {
        view.renderer?.setStyles(toEpubCss(DEFAULT_TYPOGRAPHY));
        if (view.renderer) applyViewMode(view.renderer, viewMode);
      }

      const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
      if (!cancelled && saved?.primary_anchor) {
        await view.goTo(saved.primary_anchor).catch(() => {});
      }

      // Text-selection -> Highlight/Excerpt capture (PRODUCT_SPEC.md SS11:
      // "text selection exposes lightweight Highlight / Excerpt / Note
      // actions"). foliate-js renders each section into its own document
      // (an iframe under the shadow root), so selection must be tracked
      // per-document as sections load, not once on the top-level view.
      view.addEventListener("load", (event: Event) => {
        const detail = (event as CustomEvent).detail ?? {};
        const doc: Document | undefined = detail.doc;
        const index: number = detail.index;
        if (!doc) return;
        doc.addEventListener("selectionchange", () => {
          const sel = doc.getSelection?.();
          if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
            const text = sel.toString();
            if (text.trim()) {
              setSelection({ doc, range: sel.getRangeAt(0).cloneRange(), text, index });
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
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, title]);

  function handleTypographyChange(next: TypographySettings) {
    setTypography(next);
    viewRef.current?.renderer?.setStyles(toEpubCss(next));
  }

  function handleTocNavigate(href: string) {
    viewRef.current?.goTo(href).catch(() => {});
    setOpenPanel(null);
  }

  async function handleCaptureSelection(kind: "annotation" | "excerpt") {
    const active = selection;
    const view = viewRef.current;
    if (!active || !view) return;

    const cfi = view.getCFI(active.index, active.range);
    const anchor: DocumentLocationDTO = {
      book_id: bookId,
      format: "epub",
      progression_hint: view.lastLocation?.fraction ?? 0,
      primary_anchor: cfi,
      fallback_anchors: [],
      context_selector: active.text.slice(0, 80),
    };

    await invoke("create_reading_asset_command", { bookId, kind, text: active.text, anchor }).catch(() => {});
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
      onBack={onBack}
      status={status}
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
              onClose={() => setOpenPanel(null)}
              onJumpTo={(anchor) => {
                viewRef.current?.goTo(anchor.primary_anchor).catch(() => {});
                setOpenPanel(null);
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
      <div ref={hostRef} className="reader-surface" />
    </ReaderShell>
  );
}
