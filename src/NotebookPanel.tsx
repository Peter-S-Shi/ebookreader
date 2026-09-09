import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type AssetKind = "annotation" | "excerpt" | "note";

export interface ReadingAssetDTO {
  id: string;
  book_id: string;
  kind: AssetKind;
  text: string;
  orphaned: boolean;
}

interface NotebookPanelProps {
  bookId: string;
  onClose: () => void;
}

const KIND_LABELS: Record<AssetKind, string> = {
  annotation: "Annotation",
  excerpt: "Excerpt",
  note: "Note",
};

// DESIGN.md SS5 "Notebook · optional" panel; PRODUCT_SPEC.md SS11
// "Notebook aggregates Annotation / Note / Excerpt". This checkpoint
// covers free-standing Notes (create + list); selection-bound Excerpt/
// Annotation capture needs per-format text-selection wiring (foliate-js
// selection events, pdf.js text-layer selection, TXT selection) and is a
// follow-up checkpoint, not silently folded in here (DESIGN.md's own
// non-goal: "turn Notebook into a Notion clone" -- keep this minimal).
export function NotebookPanel({ bookId, onClose }: NotebookPanelProps) {
  const [assets, setAssets] = useState<ReadingAssetDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    invoke<ReadingAssetDTO[]>("list_reading_assets_command", { bookId })
      .then(setAssets)
      .catch(() => setAssets([]));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  async function handleAddNote() {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      await invoke("create_reading_asset_command", { bookId, kind: "note", text, anchor: null });
      setDraft("");
      refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notebook-panel" role="dialog" aria-label="Notebook">
      <div className="notebook-panel-header">
        <span>Notebook</span>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="notebook-panel-compose">
        <textarea
          aria-label="New note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note about this book…"
        />
        <button type="button" onClick={handleAddNote} disabled={saving || !draft.trim()}>
          Add Note
        </button>
      </div>

      <ul className="notebook-panel-list">
        {assets.map((asset) => (
          <li key={asset.id}>
            <span className="notebook-asset-kind">{KIND_LABELS[asset.kind]}</span>
            {asset.orphaned && <span className="notebook-asset-orphaned">Detached</span>}
            <p>{asset.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
