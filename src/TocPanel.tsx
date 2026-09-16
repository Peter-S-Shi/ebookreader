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
              onClick={handleToggleAll}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Close
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
