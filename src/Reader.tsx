import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TypographyPanel } from "./TypographyPanel";
import { DEFAULT_TYPOGRAPHY, toEpubCss, type TypographySettings } from "./typography";

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
}
interface FoliateView extends HTMLElement {
  open(file: File): Promise<void>;
  goTo(target: string): Promise<void>;
  lastLocation?: { cfi?: string };
  isFixedLayout?: boolean;
  renderer?: FoliateRenderer;
}

// Minimal EPUB reading surface: opens the Book via foliate-js and keeps
// its DocumentLocation (ARCHITECTURE.md SS5) durable across reopens by
// saving/loading through the Tauri command layer on every relocate.
// DESIGN.md SS7/SS8: reflowable EPUB gets typography controls (`Aa`);
// fixed-layout does not (foliate-js's own `isFixedLayout` flag gates it,
// since "do not expose reflow typography that cannot work").
// DESIGN.md's full Reader chrome (Contents/Notebook panels, Focus
// Reading) is a later M2 checkpoint, not this one.
export function Reader({ bookId, title, onBack }: ReaderProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [isFixedLayout, setIsFixedLayout] = useState(false);
  const [typography, setTypography] = useState<TypographySettings>(DEFAULT_TYPOGRAPHY);
  const [typographyOpen, setTypographyOpen] = useState(false);

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
      if (!view.isFixedLayout) {
        view.renderer?.setStyles(toEpubCss(DEFAULT_TYPOGRAPHY));
      }

      const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
      if (!cancelled && saved?.primary_anchor) {
        await view.goTo(saved.primary_anchor).catch(() => {});
      }

      view.addEventListener("relocate", (event: Event) => {
        const detail = (event as CustomEvent).detail ?? {};
        const cfi = detail.cfi ?? view.lastLocation?.cfi;
        if (!cfi) return;
        const location: DocumentLocationDTO = {
          book_id: bookId,
          format: "epub",
          progression_hint: typeof detail.fraction === "number" ? detail.fraction : 0,
          primary_anchor: cfi,
          fallback_anchors: [],
          context_selector: null,
        };
        invoke("save_reading_location_command", { location }).catch(() => {});
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

  return (
    <div className="reader">
      <div className="reader-toolbar">
        <button type="button" onClick={onBack}>
          Back to Library
        </button>
        <span>{title}</span>
        {!isFixedLayout && (
          <button type="button" onClick={() => setTypographyOpen((open) => !open)}>
            Aa
          </button>
        )}
        <span>{status}</span>
      </div>
      {typographyOpen && !isFixedLayout && (
        <TypographyPanel
          settings={typography}
          onChange={handleTypographyChange}
          onClose={() => setTypographyOpen(false)}
        />
      )}
      <div ref={hostRef} className="reader-surface" />
    </div>
  );
}
