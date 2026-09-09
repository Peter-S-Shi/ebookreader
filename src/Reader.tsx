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
        if (!cancelled && saved?.primary_anchor) {
          await view.goTo(saved.primary_anchor).catch(() => {});
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
      {jumpFailed && (
        <p role="alert" className="jump-failed-notice">
          Could not jump to the exact location — opened the Book instead.
        </p>
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
