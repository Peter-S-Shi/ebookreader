import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OcrWorkspace } from "./OcrWorkspace";
import type * as pdfjsLib from "pdfjs-dist";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const mockRenderTask = { promise: Promise.resolve(), cancel: vi.fn() };
const mockGetPage = vi.fn().mockImplementation(async (_pageNo: number) => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
  render: () => mockRenderTask,
  getTextContent: async () => ({ items: [] }),
}));

const mockPdf = {
  numPages: 5,
  getPage: mockGetPage,
} as unknown as pdfjsLib.PDFDocumentProxy;

beforeEach(() => {
  invokeMock.mockReset();
  mockGetPage.mockClear();
  mockRenderTask.cancel.mockClear();

  invokeMock.mockImplementation(async (cmd: string, args: any) => {
    if (cmd === "get_ocr_effective_text_command") {
      if (args?.pageNumber === 2) {
        return "Page 2 recognized OCR text content";
      }
      return "Default recognized text";
    }
    if (cmd === "create_ocr_job_command") {
      return { id: "job-123" };
    }
    if (cmd === "run_ocr_job_command") {
      return null;
    }
    if (cmd === "get_ocr_job_command") {
      return { status: "complete" };
    }
    if (cmd === "save_ocr_correction_command") {
      return null;
    }
    return null;
  });
});

describe("OcrWorkspace — UX Convergence & Side-by-Side Review", () => {
  it("renders side-by-side source page canvas and OCR text/correction editor", async () => {
    render(
      <OcrWorkspace
        bookId="pdf1"
        pdf={mockPdf}
        currentPage={2}
        onClose={vi.fn()}
        onOcrUpdated={vi.fn()}
      />
    );

    // Header title and close button
    expect(screen.getByText("OCR Workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    // Source page reference section
    expect(screen.getByLabelText("Source PDF Page 2")).toBeInTheDocument();

    // OCR text preview / correction editor
    await waitFor(() => {
      const textarea = screen.getByLabelText("Correct OCR text") as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();
      expect(textarea.value).toBe("Page 2 recognized OCR text content");
    });
  });

  it("persists user correction via save_ocr_correction_command and notifies onOcrUpdated", async () => {
    const onOcrUpdated = vi.fn();
    render(
      <OcrWorkspace
        bookId="pdf1"
        pdf={mockPdf}
        currentPage={2}
        onClose={vi.fn()}
        onOcrUpdated={onOcrUpdated}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Correct OCR text")).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText("Correct OCR text");
    fireEvent.change(textarea, { target: { value: "User corrected OCR content for page 2" } });

    const saveButton = screen.getByRole("button", { name: "Save correction" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_ocr_correction_command", {
        bookId: "pdf1",
        pageNumber: 2,
        correctedText: "User corrected OCR content for page 2",
      });
      expect(onOcrUpdated).toHaveBeenCalled();
    });
  });

  it("switches viewed page and loads corresponding source and OCR text", async () => {
    render(
      <OcrWorkspace
        bookId="pdf1"
        pdf={mockPdf}
        currentPage={1}
        onClose={vi.fn()}
        onOcrUpdated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Page 2")).toBeInTheDocument();
    });

    // Click thumbnail for page 2
    fireEvent.click(screen.getByLabelText("Page 2"));

    await waitFor(() => {
      expect(mockGetPage).toHaveBeenCalledWith(2);
      expect(invokeMock).toHaveBeenCalledWith("get_ocr_effective_text_command", {
        bookId: "pdf1",
        pageNumber: 2,
      });
    });
  });

  it("renders truthful neutral info banner when Optional OCR Pack is not installed", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_ocr_status_command") {
        return {
          available: false,
          installed_path: null,
          message: "Optional OCR Pack is not installed.",
        };
      }
      return null;
    });

    render(
      <OcrWorkspace
        bookId="pdf1"
        pdf={mockPdf}
        currentPage={1}
        onClose={vi.fn()}
        onOcrUpdated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Optional OCR Pack notice")).toBeInTheDocument();
      expect(screen.getByText("Optional Component")).toBeInTheDocument();
      expect(screen.getByText(/The Optional OCR Pack is not installed/)).toBeInTheDocument();
    });
  });

  it("displays neutral info status pill when OCR job returns missing OCR Pack error", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "create_ocr_job_command") {
        return { id: "job-123" };
      }
      if (cmd === "run_ocr_job_command") {
        throw new Error("Optional OCR Pack is not installed. Scanned PDF visual reading works normally; install the official EbookReader OCR Pack to enable local text recognition.");
      }
      return null;
    });

    render(
      <OcrWorkspace
        bookId="pdf1"
        pdf={mockPdf}
        currentPage={1}
        onClose={vi.fn()}
        onOcrUpdated={vi.fn()}
      />
    );

    const runButton = screen.getByRole("button", { name: "Run OCR" });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText(/Optional OCR Pack not installed — install EbookReader OCR Pack to enable OCR/)).toBeInTheDocument();
      // Should not show scary red Failed: prefix
      expect(screen.queryByText(/^Failed:/)).not.toBeInTheDocument();
    });
  });
});

