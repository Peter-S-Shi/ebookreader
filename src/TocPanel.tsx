import { useState } from "react";

export interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

interface TocPanelProps {
  toc: TocItem[];
  onNavigate: (href: string) => void;
  onClose: () => void;
}

// DESIGN.md SS5 Reader composition: "Contents · optional" panel.
export function TocPanel({ toc, onNavigate, onClose }: TocPanelProps) {
  // V2-M2: collapse state lives here (not per-TocList instance) so it
  // survives across the whole tree's re-renders. Keyed by href; a node is
  // expanded unless its href is in this set -- expanded-by-default matches
  // the panel's prior always-expanded behavior exactly, so no existing
  // reader loses visibility of anything they could already see.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (href: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  return (
    <div className="toc-panel" role="dialog" aria-label="Contents">
      <div className="toc-panel-header">
        <span>Contents</span>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <TocList items={toc} onNavigate={onNavigate} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
    </div>
  );
}

function TocList({
  items,
  onNavigate,
  collapsed,
  onToggleCollapsed,
}: {
  items: TocItem[];
  onNavigate: (href: string) => void;
  collapsed: Set<string>;
  onToggleCollapsed: (href: string) => void;
}) {
  return (
    <ul>
      {items.map((item) => {
        const hasChildren = Boolean(item.subitems && item.subitems.length > 0);
        const isCollapsed = collapsed.has(item.href);
        return (
          <li key={item.href}>
            {hasChildren && (
              <button
                type="button"
                className="toc-toggle"
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? `Expand ${item.label}` : `Collapse ${item.label}`}
                onClick={() => onToggleCollapsed(item.href)}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>
            )}
            <button type="button" onClick={() => onNavigate(item.href)}>
              {item.label}
            </button>
            {hasChildren && !isCollapsed && (
              <TocList
                items={item.subitems!}
                onNavigate={onNavigate}
                collapsed={collapsed}
                onToggleCollapsed={onToggleCollapsed}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
