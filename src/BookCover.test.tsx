import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookCover } from "./BookCover";
import * as epubCoverModule from "./epubCover";

describe("BookCover component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders format placeholder for non-EPUB formats", () => {
    render(<BookCover bookId="pdf-1" format="pdf" />);

    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.queryByRole("img", { hidden: true })).not.toBeInTheDocument();
  });

  it("renders format placeholder for EPUB when no cover is available", () => {
    vi.spyOn(epubCoverModule, "useEpubCover").mockReturnValue({
      coverUrl: null,
      isBroken: false,
      markBroken: vi.fn(),
    });

    render(<BookCover bookId="epub-1" format="epub" />);

    expect(screen.getByText("EPUB")).toBeInTheDocument();
    expect(screen.queryByRole("img", { hidden: true })).not.toBeInTheDocument();
  });

  it("renders cover image when EPUB has a valid coverUrl", () => {
    vi.spyOn(epubCoverModule, "useEpubCover").mockReturnValue({
      coverUrl: "blob:http://localhost/mock-cover-blob",
      isBroken: false,
      markBroken: vi.fn(),
    });

    const { container } = render(<BookCover bookId="epub-1" format="epub" />);

    const img = container.querySelector("img.cover-img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "blob:http://localhost/mock-cover-blob");
    expect(screen.queryByText("EPUB")).not.toBeInTheDocument();
  });

  it("calls markBroken and switches to placeholder if image encounters error", () => {
    const markBrokenMock = vi.fn();
    vi.spyOn(epubCoverModule, "useEpubCover").mockReturnValue({
      coverUrl: "blob:http://localhost/corrupted-blob",
      isBroken: false,
      markBroken: markBrokenMock,
    });

    const { container } = render(<BookCover bookId="epub-1" format="epub" />);

    const img = container.querySelector("img.cover-img");
    expect(img).toBeInTheDocument();

    fireEvent.error(img!);

    expect(markBrokenMock).toHaveBeenCalled();
  });

  it("handles onClick callback when provided", () => {
    const handleClick = vi.fn();
    const { container } = render(<BookCover bookId="epub-1" format="epub" onClick={handleClick} />);

    const coverDiv = container.querySelector(".cover");
    expect(coverDiv).toBeInTheDocument();
    fireEvent.click(coverDiv!);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
