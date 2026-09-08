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
  return (
    <div className="toc-panel" role="dialog" aria-label="Contents">
      <div className="toc-panel-header">
        <span>Contents</span>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <TocList items={toc} onNavigate={onNavigate} />
    </div>
  );
}

function TocList({ items, onNavigate }: { items: TocItem[]; onNavigate: (href: string) => void }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.href}>
          <button type="button" onClick={() => onNavigate(item.href)}>
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TocList items={item.subitems} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  );
}
