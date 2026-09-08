import { useState, type ReactNode } from "react";

interface ReaderShellProps {
  title: string;
  onBack: () => void;
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
export function ReaderShell({ title, onBack, status, toolbarExtra, overlay, children }: ReaderShellProps) {
  const [focusMode, setFocusMode] = useState(false);

  return (
    <div className={`reader${focusMode ? " reader--focus" : ""}`}>
      <div className="reader-toolbar">
        {!focusMode && (
          <>
            <button type="button" onClick={onBack}>
              Back to Library
            </button>
            <span>{title}</span>
            {toolbarExtra}
            {status && <span>{status}</span>}
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
      {!focusMode && overlay}
      {children}
    </div>
  );
}
