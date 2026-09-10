import { useState } from "react";

interface ReadingCheckpointPromptProps {
  onSaveNote: (text: string) => void | Promise<void>;
  onDismiss: () => void;
}

/// FC-A10. `DESIGN.md` SS20 "Derived Screens": reuses `CompletionPrompt`'s
/// dialog/typography/button-hierarchy pattern rather than inventing a new
/// one. `PRODUCT_SPEC.md` SS15 "V1 does not become a complex habit/
/// gamification system" -- a single optional free-text reflection, saved
/// as a Note if the user writes one, not a streak/rating mechanic.
export function ReadingCheckpointPrompt({ onSaveNote, onDismiss }: ReadingCheckpointPromptProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const text = draft.trim();
    if (!text) {
      onDismiss();
      return;
    }
    setSaving(true);
    try {
      await onSaveNote(text);
    } finally {
      setSaving(false);
      onDismiss();
    }
  }

  return (
    <div className="reading-checkpoint-prompt" role="alertdialog" aria-label="Reading Checkpoint">
      <p>Reading Checkpoint: anything worth remembering from this session?</p>
      <textarea
        aria-label="Reading Checkpoint reflection"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Optional -- saved as a Note if you write something"
      />
      <div className="reading-checkpoint-prompt-actions">
        <button type="button" onClick={onDismiss}>
          Skip
        </button>
        <button type="button" onClick={handleSave} disabled={saving}>
          Save &amp; Continue
        </button>
      </div>
    </div>
  );
}
