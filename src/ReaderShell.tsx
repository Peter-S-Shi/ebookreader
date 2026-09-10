import { useState, type ReactNode } from "react";

interface ReaderShellProps {
  title: string;
  onBack: () => void;
  onWheel?: (event: React.WheelEvent<HTMLDivElement>) => void;
  status?: string;
  /** Format-specific toolbar controls (Aa, page navigation, ...). Hidden in Focus mode. */
  toolbarExtra?: ReactNode;
  /** Anything that should render below/beside the toolbar (e.g. an open Typography panel). */
  overlay?: ReactNode;
  children: ReactNode;
}

// Shared Reader chrome: DESIGN.md SS5 (compact toolbar + Reading Surface)
// and SS6 Focus Reading ("side panels hidden; minimal reader chrome; ...
// no modal dashboard overlay" -- Focus is an interaction state, not a
// separate product area, hence a toggle here rather than a route).
export function ReaderShell({ title, onBack, onWheel, status, toolbarExtra, overlay, children }: ReaderShellProps) {
  const [focusMode, setFocusMode] = useState(false);

  return (
    <div className={`reader${focusMode ? " reader--focus" : ""}`} onWheel={onWheel}>
      <div className="reader-toolbar">
        {!focusMode && (
          <>
            <button type="button" className="reader-back" onClick={onBack}>
              Back to Library
            </button>
            <span className="reader-title" title={title}>
              {title}
            </span>
            <span className="reader-toolbar-controls">
              {toolbarExtra}
              {status && <span className="reader-status">{status}</span>}
            </span>
          </>
        )}
        <button
          type="button"
          className="focus-toggle"
          onClick={() => setFocusMode((f) => !f)}
          aria-label={focusMode ? "Exit Focus" : "Focus"}
        >
          {focusMode ? "Exit Focus" : "Focus"}
        </button>
      </div>
      {/* HA-003: anchor overlay panels to the toolbar's own actual
          rendered bottom edge, not a guessed fixed `top` offset -- a
          fixed em value can under-clear the toolbar (e.g. a wrapped or
          taller-than-assumed row), letting a panel's header visually
          collide with the toolbar's own controls. This wrapper sits in
          normal flow right after the toolbar (zero height, so it doesn't
          add visible space) and panels position `absolute` relative to
          it instead of `.reader`. */}
      {!focusMode && <div className="reader-overlay-anchor">{overlay}</div>}
      {children}
    </div>
  );
}
