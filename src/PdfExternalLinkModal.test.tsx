import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PdfExternalLinkModal } from "./PdfExternalLinkModal";

describe("PdfExternalLinkModal", () => {
  it("renders external link warning with exact destination URL", () => {
    const url = "https://example.com/path/to/resource?source=ebookreader&case=external-link#target";
    render(
      <PdfExternalLinkModal
        url={url}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/external website/i)).toBeInTheDocument();
    const urlElement = screen.getByText(url);
    expect(urlElement).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();
    render(
      <PdfExternalLinkModal
        url="https://example.com"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handleCancel).toHaveBeenCalledTimes(1);
    expect(handleConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the exact URL when Open button is clicked", async () => {
    const user = userEvent.setup();
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();
    const url = "https://iana.org/domains/reserved";
    render(
      <PdfExternalLinkModal
        url={url}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(handleConfirm).toHaveBeenCalledWith(url);
    expect(handleCancel).not.toHaveBeenCalled();
  });
});
