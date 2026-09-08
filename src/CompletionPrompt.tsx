interface CompletionPromptProps {
  onStartNextRead: () => void;
  onDismiss: () => void;
}

// PRODUCT_SPEC.md SS8.1: "You finished this Book. Start another read?"
// Yes creates/starts the next read (active progress -> 0%); No leaves no
// new active read (UI remains at 100%, completed-read count stays
// incremented) -- both are already correct in useReadingProgress, this is
// just the prompt itself.
export function CompletionPrompt({ onStartNextRead, onDismiss }: CompletionPromptProps) {
  return (
    <div className="completion-prompt" role="alertdialog" aria-label="Book completed">
      <p>You finished this Book. Start another read?</p>
      <div className="completion-prompt-actions">
        <button type="button" onClick={onDismiss}>
          No
        </button>
        <button type="button" onClick={onStartNextRead}>
          Yes
        </button>
      </div>
    </div>
  );
}
