import { useMemo, useState } from "react";

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

function collectCollapsibleHrefs(items: TocItem[]): string[] {
  const hrefs: string[] = [];
  const walk = (list: TocItem[]) => {
    for (const item of list) {
      if (item.subitems && item.subitems.length > 0) {
        hrefs.push(item.href);
        walk(item.subitems);
      }
    }
  };
  walk(items);
  return hrefs;
}

function BoxedPlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="8" y1="5.25" x2="8" y2="10.75" />
      <line x1="5.25" y1="8" x2="10.75" y2="8" />
    </svg>
  );
}

function BoxedMinusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="5.25" y1="8" x2="10.75" y2="8" />
    </svg>
  );
}

function BoxedCloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" />
      <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" />
    </svg>
  );
}

// DESIGN.md §5 Reader composition: "Contents · optional" panel.
export function TocPanel({ toc, onNavigate, onClose }: TocPanelProps) {
  // V2-M2: collapse state lives here (not per-TocList instance) so it
  // survives across the whole tree's re-renders. Keyed by href; a node is
  // expanded unless its href is in this set -- expanded-by-default matches
  // the panel's prior always-expanded behavior exactly, so no existing
  // reader loses visibility of anything they could already see.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const collapsibleHrefs = useMemo(() => collectCollapsibleHrefs(toc), [toc]);
  const hasCollapsible = collapsibleHrefs.length > 0;

  // If all collapsible nodes are collapsed, show "Expand all"; otherwise (fully expanded or mixed), show "Collapse all".
  const allCollapsed = hasCollapsible && collapsibleHrefs.every((href) => collapsed.has(href));

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

  const handleToggleAll = () => {
    if (allCollapsed) {
      setCollapsed(new Set());
    } else {
      setCollapsed(new Set(collapsibleHrefs));
    }
  };

  return (
    <div className="toc-panel" role="dialog" aria-label="Contents">
      <div className="toc-panel-header">
        <span>Contents</span>
        <div className="toc-panel-header-actions">
          {hasCollapsible && (
            <button
              type="button"
              className="toc-expand-toggle"
              aria-label={allCollapsed ? "Expand all" : "Collapse all"}
              title={allCollapsed ? "Expand all" : "Collapse all"}
              onClick={handleToggleAll}
            >
              {allCollapsed ? <BoxedPlusIcon /> : <BoxedMinusIcon />}
            </button>
          )}
          <button
            type="button"
            className="toc-close-button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <BoxedCloseIcon />
          </button>
        </div>
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
