interface PdfExternalLinkModalProps {
  url: string;
  onConfirm: (url: string) => void;
  onCancel: () => void;
}

export function PdfExternalLinkModal({ url, onConfirm, onCancel }: PdfExternalLinkModalProps) {
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div
        className="modal pdf-external-link-modal"
        role="alertdialog"
        aria-label="Open External Link"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHead">
          <h2>Open External Link</h2>
        </div>
        <p className="pdf-external-link-desc">
          This document requests to open an external website:
        </p>
        <div className="pdf-external-link-target" title="Destination URL">
          <code className="pdf-external-link-url">{url}</code>
        </div>
        <p className="pdf-external-link-warning">
          Only continue if you trust this destination. The link will open in your default system browser.
        </p>
        <div className="modalActions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primaryBtn"
            onClick={() => onConfirm(url)}
          >
            Open in Browser
          </button>
        </div>
      </div>
    </div>
  );
}
