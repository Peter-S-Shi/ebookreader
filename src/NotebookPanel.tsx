import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export type AssetKind = "annotation" | "excerpt" | "note";

export interface DocumentLocationDTO {
  book_id: string;
  format: string;
  progression_hint: number;
  primary_anchor: string;
  fallback_anchors: string[];
  context_selector: string | null;
}

export interface ReadingAssetDTO {
  id: string;
  book_id: string;
  kind: AssetKind;
  text: string;
  anchor: DocumentLocationDTO | null;
  orphaned: boolean;
}

interface NotebookPanelProps {
  bookId: string;
  bookTitle: string;
  onClose: () => void;
  /** Jump the Reader to a source-bound asset's anchor; resolves to whether
   * the anchor actually resolved. Omitted (or the asset having no anchor /
   * being Orphaned) hides the jump-back action. A failed jump (the anchor
   * could no longer be resolved -- PRODUCT_SPEC.md SS11: "If an anchor
   * becomes unrecoverable") marks the asset Orphaned/Detached here rather
   * than deleting it, and never closes the panel so the user sees the
   * result. */
  onJumpTo?: (asset: ReadingAssetDTO) => boolean | Promise<boolean>;
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
export function NotebookPanel({ bookId, bookTitle, onClose, onJumpTo }: NotebookPanelProps) {
  const [assets, setAssets] = useState<ReadingAssetDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  function refresh() {
    invoke<ReadingAssetDTO[]>("list_reading_assets_command", { bookId })
      .then(setAssets)
      .catch(() => setAssets([]));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // PRODUCT_SPEC.md SS10 "Count Note-taking as Reading Time":
  // ReadingSession only needs to know the *fact* of how long note-taking
  // lasted while this panel was open -- whether that duration counts
  // toward displayed Actual Reading Time is a Settings policy applied by
  // `useActualReadingTimeHeartbeat`, not decided here.
  useEffect(() => {
    invoke("start_note_taking_command").catch(() => {});
    return () => {
      invoke("stop_note_taking_command").catch(() => {});
    };
  }, []);

  async function handleJumpTo(asset: ReadingAssetDTO) {
    if (!onJumpTo) return;
    const resolved = await onJumpTo(asset);
    if (resolved) {
      onClose();
    } else {
      await invoke("mark_reading_asset_orphaned_command", { assetId: asset.id }).catch(() => {});
      refresh();
    }
  }

  async function exportMarkdown() {
    const dest = await save({
      defaultPath: `${bookTitle}-notebook.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!dest) return;
    try {
      await invoke("export_notebook_markdown_command", { bookId, destPath: dest });
      setExportStatus(`Notebook exported to ${dest}`);
    } catch (e) {
      setExportStatus(`Export failed: ${e}`);
    }
  }

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
        <button type="button" onClick={exportMarkdown}>
          Export as Markdown
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {exportStatus && <p role="status">{exportStatus}</p>}

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
            {asset.anchor && !asset.orphaned && onJumpTo && (
              <button type="button" onClick={() => handleJumpTo(asset)}>
                Jump to
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
