import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ReaderShell } from "./ReaderShell";
import { NotebookPanel } from "./NotebookPanel";
import { OcrWorkspace } from "./OcrWorkspace";
import {
  currentPageFromScroll,
  computeActivePageRange,
  computeActivePagesFromScroll,
  computePageHeights,
  resolvePageDimension,
  type PdfPageDimension,
} from "./pdfContinuous";
import { useSoundToggle } from "./useSoundToggle";
import { useReadingProgress } from "./useReadingProgress";
import { CompletionPrompt } from "./CompletionPrompt";
import { useActualReadingTimeHeartbeat } from "./useActualReadingTimeHeartbeat";
import { useReadingCheckpoint } from "./useReadingCheckpoint";
import { ReadingCheckpointPrompt } from "./ReadingCheckpointPrompt";
import { useRecordBookOpened } from "./useRecordBookOpened";
import { extractContextDetails, formatContextSelector, HIGHLIGHT_COLORS, type HighlightColor } from "./highlightUtils";
import { applyPdfHighlights, clearPdfHighlights, recolorPdfHighlight, type PdfAnnotationItem } from "./pdfHighlight";
import { TocPanel, type TocItem } from "./TocPanel";
import { pdfOutlineToTocItems } from "./pdfOutline";
import { parsePageJumpInput } from "./pdfPageInput";
import {
  getPdfPageAppearancePreference,
  setPdfPageAppearancePreference,
  extractImageRects,
  isScanLikeDocument,
  renderAppearanceOverlay,
  type PdfPageAppearance,
  type PdfImageRect,
  type PageScanSample,
} from "./pdfAppearance";
import { openUrl } from "@tauri-apps/plugin-opener";
import { extractPagePdfLinks, type PdfLinkItem, type PdfLinkTarget } from "./pdfLinks";
import { PdfExternalLinkModal } from "./PdfExternalLinkModal";
import { createPdfDocumentLoadingParams } from "./pdfDocumentOptions";
import {
  classifyPdfDocument,
  type PdfDocumentClassification,
  type PageTextSummary,
} from "./pdfDocumentClassification";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface DocumentLocationDTO {
  book_id: string;
  format: string;
  progression_hint: number;
  primary_anchor: string;
  fallback_anchors: string[];
  context_selector: string | null;
}

interface PdfReaderProps {
  bookId: string;
  title: string;
  onBack: () => void;
  initialAnchor?: DocumentLocationDTO | null;
}

type PdfViewMode = "single" | "continuous";
type PdfFitMode = "custom" | "page" | "width";

const DEFAULT_PDF_SCALE = 1.2;
const PDF_ZOOM_STEP = 0.1;
const MIN_PDF_SCALE = 0.5;
const MAX_PDF_SCALE = 3;

function clampPdfScale(scale: number): number {
  return Math.min(MAX_PDF_SCALE, Math.max(MIN_PDF_SCALE, Math.round(scale * 100) / 100));
}

function blocksPdfNavigationShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, button, [contenteditable='true'], [role='dialog'], [role='alertdialog']"));
}

function isSamePageList(a: number[], b: number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// FORMAT_CAPABILITY_MATRIX.md: PDF is a FIXED-LAYOUT / PAGED format.
// Page Appearance (Day / Eye Care / Parchment / Night) is applied via
// canvas overlay with image-region cutout protection and scanned-PDF detection.
// Continuous Scroll (V2-M4): rendered as a vertical stack of canvases.
// Whole-book search index is built asynchronously on first open (M3
// Library-wide Search source). M5 (Scanned PDF OCR) begins here: the same
// background pass that extracts text also detects a scanned PDF (no
// extractable text on any page) and surfaces SS13.1/SS13.2's truthful
// degraded state -- visual reading still works, text-dependent features
// don't pretend to. The OCR pipeline itself (local ONNX inference via the
// Rust `ort` crate, per M0_ARCHITECTURE_DECISION.md SS8) now runs for real
// via run_ocr_job_command, with SS13.1's full Current Page / Selected Pages
// / Entire Book scope selection. Real mid-run pause/cancel and incremental
// per-page progress reporting are not wired (a single command call blocks
// until every target page is done) -- a genuine residual, not hidden from
// the user: the button's label says so rather than faking a progress bar.
export function PdfReader({ bookId, title, onBack, initialAnchor }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appearanceCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const singlePageSurfaceRef = useRef<HTMLDivElement>(null);
  const continuousContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const appearanceCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const page1ViewportRef = useRef<{ width: number; height: number } | null>(null);
  const pageDimensionsRef = useRef<(PdfPageDimension | null)[]>([]);
  const [, setPageDimensionsVersion] = useState(0);
  const pendingContinuousPageRef = useRef<number | null>(null);
  const continuousRenderTasksRef = useRef<Map<number, pdfjsLib.RenderTask>>(new Map());
  const inFlightContinuousPagesRef = useRef<Set<number>>(new Set());
  const renderedContinuousPagesRef = useRef<Set<number>>(new Set());
  const [activeContinuousPages, setActiveContinuousPages] = useState<number[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [jumpFailed, setJumpFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [viewMode, setViewMode] = useState<PdfViewMode>("single");
  const [zoomScale, setZoomScale] = useState(DEFAULT_PDF_SCALE);
  const [fitMode, setFitMode] = useState<PdfFitMode>("custom");
  const [pageAppearance, setPageAppearance] = useState<PdfPageAppearance>(getPdfPageAppearancePreference);
  const [isScanLikeDoc, setIsScanLikeDoc] = useState(false);
  const [pageImageRects, setPageImageRects] = useState<PdfImageRect[]>([]);
  const [notebookOpen, setNotebookOpen] = useState(false);
  // V2-M2: native PDF bookmarks (pdf.js `getOutline()`) surfaced in the
  // same shared Contents UI (`TocPanel`) EPUB already uses. Empty when the
  // PDF has no usable outline, matching Reader.tsx's own `toc.length > 0`
  // gate for hiding the Contents button entirely rather than showing one
  // that opens onto nothing.
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [pageLinks, setPageLinks] = useState<PdfLinkItem[]>([]);
  const [externalLinkPromptUrl, setExternalLinkPromptUrl] = useState<string | null>(null);
  // V2-M2 addendum: the editable current-page field. `pageInputText` is
  // the field's own draft text, kept in sync with `pageNumber` (which is
  // the single source of truth, updated by Previous/Next, bookmark
  // navigation, and continuous-scroll) so external page changes are
  // reflected even mid-edit -- see the sync effect below.
  const [pageInputText, setPageInputText] = useState("1");
  const [pageJumpInvalid, setPageJumpInvalid] = useState(false);
  const [notebookRefreshKey, setNotebookRefreshKey] = useState(0);
  const [selection, setSelection] = useState<{
    text: string;
    page: number;
    assetId?: string;
    prefix?: string;
    suffix?: string;
  } | null>(null);
  // V2-M4-U4C: Robust document classification into TEXT, SCAN, or HYBRID.
  // Replaces naive `anyPageHasText` so sparse watermarks / metadata do not disable OCR on scanned books.
  const [documentClassification, setDocumentClassification] = useState<PdfDocumentClassification | null>(null);
  // Track OCR availability for the current page to surface a restrained affordance.
  // Full OCR review, run controls, and text corrections live in `OcrWorkspace`.
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrWorkspaceOpen, setOcrWorkspaceOpen] = useState(false);
  const [noticeCollapsed, setNoticeCollapsed] = useState(false);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>("yellow");
  const { enabled: soundEnabled, toggle: toggleSound, playPageTurn } = useSoundToggle();
  const { progress, showCompletionPrompt, advance, startNextRead, dismissCompletionPrompt } = useReadingProgress(bookId);
  const checkpoint = useReadingCheckpoint();
  useRecordBookOpened(bookId);
  useActualReadingTimeHeartbeat(bookId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rawBytes = await invoke<Uint8Array | ArrayBuffer | number[]>("read_book_file_command", { bookId });
      if (cancelled) return;
      const pdf = await pdfjsLib.getDocument(createPdfDocumentLoadingParams(rawBytes)).promise;
      if (cancelled) return;
      // FC-C01/FC-C02: an exact jump takes priority over the resume page.
      // An anchor that fails to parse to a valid in-range page is reported
      // truthfully rather than silently opening at page one.
      let startPage = 1;
      if (initialAnchor?.primary_anchor) {
        const targetPage = parseInt(initialAnchor.primary_anchor, 10);
        const valid = Number.isFinite(targetPage) && targetPage >= 1 && targetPage <= pdf.numPages;
        if (!cancelled) {
          startPage = valid ? targetPage : 1;
          setJumpFailed(!valid);
        }
      } else {
        const saved = await invoke<DocumentLocationDTO | null>("load_reading_location_command", { bookId });
        const savedPage = saved?.primary_anchor ? parseInt(saved.primary_anchor, 10) : NaN;
        startPage = Number.isFinite(savedPage) && savedPage >= 1 && savedPage <= pdf.numPages ? savedPage : 1;
      }

      if (cancelled) return;
      try {
        const page1 = await pdf.getPage(1);
        if (!cancelled) {
          const vp1 = page1.getViewport({ scale: 1.0 });
          page1ViewportRef.current = { width: vp1.width, height: vp1.height };
        }
      } catch {
        // Fallback to default
      }
      if (cancelled) return;

      pdfRef.current = pdf;
      pageDimensionsRef.current = new Array(pdf.numPages).fill(null);
      if (page1ViewportRef.current) {
        pageDimensionsRef.current[0] = { ...page1ViewportRef.current };
      }
      setPageCount(pdf.numPages);
      setPageNumber(startPage);
      const initialActiveRange = computeActivePageRange(startPage, pdf.numPages, 2);
      const initialActiveList: number[] = [];
      for (let p = initialActiveRange.startPage; p <= initialActiveRange.endPage; p++) {
        initialActiveList.push(p);
      }
      setActiveContinuousPages(initialActiveList);
      setPdfDoc(pdf);

      const outline = await pdf.getOutline();
      if (cancelled) return;
      setToc(await pdfOutlineToTocItems(outline, pdf));
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // When continuous mode is active, ensure lightweight unscaled viewport metadata is probed for all pages
  useEffect(() => {
    if (viewMode !== "continuous") return;
    const pdf = pdfDoc || pdfRef.current;
    if (!pdf) return;
    let cancelled = false;

    (async () => {
      let anyNew = false;
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        if (pageDimensionsRef.current[i - 1]) continue;
        try {
          const p = await pdf.getPage(i);
          if (cancelled) return;
          const vp = p.getViewport({ scale: 1.0 });
          pageDimensionsRef.current[i - 1] = { width: vp.width, height: vp.height };
          anyNew = true;
        } catch {
          // ignore
        }
      }
      if (!cancelled && anyNew) {
        setPageDimensionsVersion((v) => v + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewMode, pdfDoc]);

  // Deferred whole-book text extraction into search index and scanned-PDF detection.
  // Runs asynchronously after Reader reaches Ready state to avoid competing with Page 1 paint.
  useEffect(() => {
    if (status !== "Ready" || !pdfDoc) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      const pageSummaries: PageTextSummary[] = [];
      const fullDocSamples: PageScanSample[] = [];

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(i);
        if (cancelled) return;
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
        const textCharCount = textContent.items.reduce((acc, item) => acc + ("str" in item ? (item as { str: string }).str.length : 0), 0);

        let maxImageAreaRatio = 0;
        if (fullDocSamples.length < 10) {
          const sOpList = typeof page.getOperatorList === "function" ? await page.getOperatorList().catch(() => null) : null;
          const sVp = page.getViewport({ scale: 1.0 });
          const imgRects = sOpList ? extractImageRects(sOpList, sVp) : [];
          maxImageAreaRatio = imgRects.length > 0 ? Math.max(...imgRects.map((r) => r.areaRatio)) : 0;
          fullDocSamples.push({ textCharCount, maxImageAreaRatio });
        }

        pageSummaries.push({ textCharCount, maxImageAreaRatio });

        if (pageText.trim()) {
          const anchor: DocumentLocationDTO = {
            book_id: bookId,
            format: "pdf",
            progression_hint: pdfDoc.numPages > 0 ? i / pdfDoc.numPages : 0,
            primary_anchor: String(i),
            fallback_anchors: [],
            context_selector: null,
          };
          await invoke("index_search_text_command", {
            bookId,
            kind: "book_text",
            entryId: String(i),
            content: pageText,
            anchor,
          }).catch(() => {});
        }
      }
      if (!cancelled) {
        const isScanLikeVisual = fullDocSamples.length > 0 ? isScanLikeDocument(fullDocSamples) : false;
        const classification = classifyPdfDocument(pageSummaries, isScanLikeVisual);
        setDocumentClassification(classification);
        setIsScanLikeDoc(classification.isScanLike);
      }
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, pdfDoc, bookId]);

  function refreshOcrText() {
    invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber })
      .then((text) => setOcrText(text))
      .catch(() => {});
  }

  useEffect(() => {
    if (!documentClassification?.ocrEligible) return;
    let cancelled = false;
    invoke<string | null>("get_ocr_effective_text_command", { bookId, pageNumber })
      .then((text) => {
        if (!cancelled) setOcrText(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookId, pageNumber, documentClassification]);

  function saveLocation(page: number, count: number) {
    const fraction = count > 0 ? page / count : 0;
    const location: DocumentLocationDTO = {
      book_id: bookId,
      format: "pdf",
      progression_hint: fraction,
      primary_anchor: String(page),
      fallback_anchors: [],
      context_selector: null,
    };
    invoke("save_reading_location_command", { location }).catch(() => {});
    advance(fraction);
  }

  // Single-page mode: render only the current page.
  useEffect(() => {
    if (viewMode !== "single") return;
    const pdf = pdfDoc || pdfRef.current;
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoomScale });
      const naturalVp = page.getViewport({ scale: 1.0 });
      pageDimensionsRef.current[pageNumber - 1] = { width: naturalVp.width, height: naturalVp.height };
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const pageDiv = canvas.parentElement;
      if (pageDiv && pageDiv.classList.contains("pdf-page")) {
        pageDiv.style.width = `${viewport.width}px`;
        pageDiv.style.height = `${viewport.height}px`;
      }

      const appearanceCanvas = appearanceCanvasRef.current;
      if (appearanceCanvas) {
        appearanceCanvas.width = viewport.width;
        appearanceCanvas.height = viewport.height;
        appearanceCanvas.style.width = `${viewport.width}px`;
        appearanceCanvas.style.height = `${viewport.height}px`;
      }

      renderTask = page.render({ canvasContext: context, viewport, canvas });
      await renderTask.promise.catch(() => {});
      if (cancelled) return;

      // Extract image rects for Page Appearance (Eye Care / Parchment image protection)
      let currentImgRects: PdfImageRect[] = [];
      try {
        if (typeof page.getOperatorList === "function") {
          const opList = await page.getOperatorList();
          if (!cancelled && opList) {
            currentImgRects = extractImageRects(opList, viewport);
            setPageImageRects(currentImgRects);
          }
        }
      } catch {
        // ignore opList error
      }

      if (appearanceCanvas && !cancelled) {
        renderAppearanceOverlay(
          appearanceCanvas,
          viewport.width,
          viewport.height,
          pageAppearance,
          isScanLikeDoc,
          currentImgRects,
          canvas,
        );
      }

      const textLayerDiv = textLayerRef.current;
      if (textLayerDiv) {
        textLayerDiv.replaceChildren();
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.style.setProperty("--total-scale-factor", String(viewport.scale));
        const textContent = await page.streamTextContent();
        if (cancelled) return;
        await new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport }).render();

        // Rehydrate persistent highlights for this page in textLayer
        try {
          const assets = await invoke<Array<{ id: string; kind: string; text: string; orphaned: boolean; anchor?: DocumentLocationDTO }>>(
            "list_reading_assets_command",
            { bookId },
          );
          if (!cancelled && textLayerDiv) {
            const pageAnnotations: PdfAnnotationItem[] = assets
              .filter(
                (a) => a.kind === "annotation" && !a.orphaned && a.anchor?.primary_anchor === String(pageNumber),
              )
              .map((ann) => {
                const details = extractContextDetails(ann.anchor?.context_selector);
                return {
                  id: ann.id,
                  text: ann.text,
                  color: details.color,
                  contextPrefix: details.prefix,
                  contextSuffix: details.suffix,
                };
              });
            applyPdfHighlights(textLayerDiv, pageAnnotations, (assetId, text) => {
              setSelection({ text, page: pageNumber, assetId });
            });
          }
        } catch {
          // ignore highlight rehydration error if assets fail
        }
      }
      if (cancelled) return;

      // Extract and resolve clickable PDF hyperlinks for the page (V2-M4-U4A)
      try {
        const links = await extractPagePdfLinks(page, pdf, viewport);
        if (!cancelled) {
          setPageLinks(links);
        }
      } catch {
        if (!cancelled) {
          setPageLinks([]);
        }
      }
      if (cancelled) return;

      setStatus("Ready");
      saveLocation(pageNumber, pdf.numPages);
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [viewMode, pageNumber, bookId, pdfDoc, zoomScale, isScanLikeDoc]);

  // Reactive Page Appearance update for single-page mode without full PDF canvas re-render
  useEffect(() => {
    if (viewMode !== "single" || !appearanceCanvasRef.current || !canvasRef.current) return;
    const canvas = appearanceCanvasRef.current;
    const baseCanvas = canvasRef.current;
    if (canvas.width > 0 && canvas.height > 0) {
      renderAppearanceOverlay(
        canvas,
        canvas.width,
        canvas.height,
        pageAppearance,
        isScanLikeDoc,
        pageImageRects,
        baseCanvas,
      );
    }
  }, [pageAppearance, isScanLikeDoc, pageImageRects, viewMode]);

  // Text-selection -> Highlight/Excerpt capture (PRODUCT_SPEC.md SS11).
  // Single-page mode only this checkpoint -- continuous mode would need
  // per-page-div selection scoping across many simultaneously mounted text
  // layers, a follow-up, not folded in here. Also covers the OCR result
  // paragraph (`ocrTextRef`) once a scanned page has real OCR text -- it is
  // plain selectable DOM text, so the same selectionchange listener applies
  // without a separate pdf.js TextLayer (SS13's "search/excerpt/annotation
  // jump-back usability" for OCR'd pages, not just extractable-text pages).
  useEffect(() => {
    if (viewMode !== "single") return;
    function handleSelectionChange() {
      const layer = textLayerRef.current;
      const sel = document.getSelection();
      if (!layer || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!layer.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const text = sel.toString();
      if (!text.trim()) {
        setSelection(null);
        return;
      }

      let prefix = "";
      let suffix = "";
      try {
        const preRange = document.createRange();
        preRange.selectNodeContents(layer);
        preRange.setEnd(range.startContainer, range.startOffset);
        prefix = preRange.toString().slice(-20);

        const postRange = document.createRange();
        postRange.selectNodeContents(layer);
        postRange.setStart(range.endContainer, range.endOffset);
        suffix = postRange.toString().slice(0, 20);
      } catch {
        // fallback if range extraction fails
      }

      setSelection({ text, page: pageNumber, prefix, suffix });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [viewMode, pageNumber]);

  async function handleCaptureSelection(kind: "annotation" | "excerpt", selectedColor?: HighlightColor) {
    if (!selection) return;
    const color = selectedColor ?? highlightColor;
    const anchor: DocumentLocationDTO = {
      book_id: bookId,
      format: "pdf",
      progression_hint: pageCount > 0 ? selection.page / pageCount : 0,
      primary_anchor: String(selection.page),
      fallback_anchors: [],
      context_selector: formatContextSelector(selection.text, color, selection.prefix, selection.suffix),
    };

    let targetAssetId = selection.assetId;
    if (kind === "annotation") {
      if (targetAssetId) {
        // Recolor existing highlight by stable assetId
        await invoke("update_reading_asset_anchor_command", {
          assetId: targetAssetId,
          anchor,
        }).catch(() => {});
        if (textLayerRef.current) {
          recolorPdfHighlight(textLayerRef.current, targetAssetId, color);
        }
      } else {
        // Create new highlight
        try {
          const created = await invoke<{ id: string }>("create_reading_asset_command", {
            bookId,
            kind,
            text: selection.text,
            anchor,
          });
          if (textLayerRef.current) {
            applyPdfHighlights(
              textLayerRef.current,
              [
                {
                  id: created.id,
                  text: selection.text,
                  color,
                  contextPrefix: selection.prefix,
                  contextSuffix: selection.suffix,
                },
              ],
              (assetId, text) => {
                setSelection({ text, page: selection.page, assetId });
              },
            );
          }
        } catch {
          // creation fallback
        }
      }
    } else {
      await invoke("create_reading_asset_command", { bookId, kind, text: selection.text, anchor }).catch(() => {});
    }

    document.getSelection()?.removeAllRanges();
    setSelection(null);
    setNotebookRefreshKey((k) => k + 1);
  }

  async function handleRemoveHighlight() {
    if (!selection) return;

    let targetAssetId = selection.assetId;
    if (targetAssetId) {
      await invoke("delete_reading_asset_command", { assetId: targetAssetId }).catch(() => {});
      if (textLayerRef.current) {
        clearPdfHighlights(textLayerRef.current, targetAssetId);
      }
    }

    document.getSelection()?.removeAllRanges();
    setSelection(null);
    setNotebookRefreshKey((k) => k + 1);
  }

  const activeContinuousPagesRef = useRef<Set<number>>(new Set());
  const renderedContinuousScaleRef = useRef<number>(zoomScale);

  // Continuous mode: observe visible / near-visible pages to bound rendering
  // and memory to the active viewport neighborhood with overscan buffer.
  useEffect(() => {
    if (viewMode !== "continuous" || !continuousContainerRef.current) return;
    const container = continuousContainerRef.current;

    const initialRange = computeActivePageRange(pageNumber, pageCount, 2);
    const initialList: number[] = [];
    for (let p = initialRange.startPage; p <= initialRange.endPage; p++) {
      initialList.push(p);
    }
    setActiveContinuousPages((prev) => (isSamePageList(prev, initialList) ? prev : initialList));

    if (typeof IntersectionObserver === "undefined") return;

    const intersectingPages = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const pAttr = entry.target.getAttribute("data-page");
          if (!pAttr) continue;
          const pNum = parseInt(pAttr, 10);
          if (entry.isIntersecting) {
            if (!intersectingPages.has(pNum)) {
              intersectingPages.add(pNum);
              changed = true;
            }
          } else {
            if (intersectingPages.has(pNum)) {
              intersectingPages.delete(pNum);
              changed = true;
            }
          }
        }

        if (changed && intersectingPages.size > 0) {
          const sorted = Array.from(intersectingPages).sort((a, b) => a - b);
          const minP = Math.max(1, sorted[0] - 1);
          const maxP = Math.min(pageCount, sorted[sorted.length - 1] + 1);
          const nextActive: number[] = [];
          for (let p = minP; p <= maxP; p++) {
            nextActive.push(p);
          }
          setActiveContinuousPages((prev) => (isSamePageList(prev, nextActive) ? prev : nextActive));
        }
      },
      {
        root: container,
        rootMargin: "600px 0px",
      },
    );

    const pageDivs = container.querySelectorAll(".pdf-page.continuous-page");
    pageDivs.forEach((div) => observer.observe(div));

    return () => {
      observer.disconnect();
    };
  }, [viewMode, pageCount, zoomScale]);

  // Continuous mode: render active window pages and cancel/release distant pages
  useEffect(() => {
    if (viewMode !== "continuous") {
      for (const task of continuousRenderTasksRef.current.values()) {
        task.cancel();
      }
      continuousRenderTasksRef.current.clear();
      inFlightContinuousPagesRef.current.clear();
      renderedContinuousPagesRef.current.clear();
      return;
    }

    const pdf = pdfDoc || pdfRef.current;
    if (!pdf) return;

    // Zoom change invalidates rendered scale
    if (renderedContinuousScaleRef.current !== zoomScale) {
      for (const task of continuousRenderTasksRef.current.values()) {
        task.cancel();
      }
      continuousRenderTasksRef.current.clear();
      inFlightContinuousPagesRef.current.clear();
      renderedContinuousPagesRef.current.clear();
      renderedContinuousScaleRef.current = zoomScale;
    }

    const currentActiveSet = new Set(activeContinuousPages);
    activeContinuousPagesRef.current = currentActiveSet;

    // Evict distant rendered pages: release canvas backing memory
    for (const pageNum of Array.from(renderedContinuousPagesRef.current)) {
      if (!currentActiveSet.has(pageNum)) {
        renderedContinuousPagesRef.current.delete(pageNum);
        const c = canvasRefs.current[pageNum - 1];
        if (c) {
          c.width = 0;
          c.height = 0;
        }
        const ac = appearanceCanvasRefs.current[pageNum - 1];
        if (ac) {
          ac.width = 0;
          ac.height = 0;
        }
      }
    }

    // Cancel in-flight tasks ONLY for pages that left the active window
    for (const [pageNum, task] of Array.from(continuousRenderTasksRef.current.entries())) {
      if (!currentActiveSet.has(pageNum)) {
        task.cancel();
        continuousRenderTasksRef.current.delete(pageNum);
        inFlightContinuousPagesRef.current.delete(pageNum);
      }
    }

    // Schedule render for active pages not yet rendered or in-flight
    for (const pageNum of activeContinuousPages) {
      if (
        renderedContinuousPagesRef.current.has(pageNum) ||
        inFlightContinuousPagesRef.current.has(pageNum) ||
        continuousRenderTasksRef.current.has(pageNum)
      ) {
        continue;
      }

      const canvas = canvasRefs.current[pageNum - 1];
      const appearanceCanvas = appearanceCanvasRefs.current[pageNum - 1];
      if (!canvas) continue;

      inFlightContinuousPagesRef.current.add(pageNum);

      (async () => {
        try {
          const page = await pdf.getPage(pageNum);
          if (!activeContinuousPagesRef.current.has(pageNum) || viewMode !== "continuous") {
            inFlightContinuousPagesRef.current.delete(pageNum);
            return;
          }

          const viewport = page.getViewport({ scale: zoomScale });
          const naturalVp = page.getViewport({ scale: 1.0 });
          pageDimensionsRef.current[pageNum - 1] = { width: naturalVp.width, height: naturalVp.height };
          const context = canvas.getContext("2d")!;

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          if (appearanceCanvas) {
            appearanceCanvas.width = viewport.width;
            appearanceCanvas.height = viewport.height;
            appearanceCanvas.style.width = `${viewport.width}px`;
            appearanceCanvas.style.height = `${viewport.height}px`;
          }

          const renderTask = page.render({ canvasContext: context, viewport, canvas });
          continuousRenderTasksRef.current.set(pageNum, renderTask);

          await renderTask.promise;
          continuousRenderTasksRef.current.delete(pageNum);
          inFlightContinuousPagesRef.current.delete(pageNum);

          if (!activeContinuousPagesRef.current.has(pageNum) || viewMode !== "continuous") {
            canvas.width = 0;
            canvas.height = 0;
            if (appearanceCanvas) {
              appearanceCanvas.width = 0;
              appearanceCanvas.height = 0;
            }
            return;
          }

          renderedContinuousPagesRef.current.add(pageNum);

          if (appearanceCanvas) {
            try {
              const opList = typeof page.getOperatorList === "function" ? await page.getOperatorList() : null;
              if (activeContinuousPagesRef.current.has(pageNum) && viewMode === "continuous" && appearanceCanvas.width > 0) {
                const imgRects = opList ? extractImageRects(opList, viewport) : [];
                renderAppearanceOverlay(
                  appearanceCanvas,
                  viewport.width,
                  viewport.height,
                  pageAppearance,
                  isScanLikeDoc,
                  imgRects,
                  canvas,
                );
              }
            } catch {
              // ignore opList error
            }
          }

          setStatus("Ready");
        } catch {
          continuousRenderTasksRef.current.delete(pageNum);
          inFlightContinuousPagesRef.current.delete(pageNum);
        }
      })();
    }
  }, [viewMode, activeContinuousPages, zoomScale, pageAppearance, isScanLikeDoc, pdfDoc]);

  // Reactive Page Appearance update for continuous mode (Active pages only)
  useEffect(() => {
    if (viewMode !== "continuous") return;
    const pdf = pdfDoc || pdfRef.current;
    if (!pdf) return;
    let cancelled = false;

    (async () => {
      for (const pageNum of activeContinuousPages) {
        if (cancelled) return;
        const appearanceCanvas = appearanceCanvasRefs.current[pageNum - 1];
        const canvas = canvasRefs.current[pageNum - 1];
        if (!appearanceCanvas || appearanceCanvas.width === 0 || !canvas || canvas.width === 0) continue;

        try {
          const page = await pdf.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: zoomScale });
          const opList = typeof page.getOperatorList === "function" ? await page.getOperatorList().catch(() => null) : null;
          const imgRects = opList ? extractImageRects(opList, viewport) : [];
          if (!cancelled && appearanceCanvas.width > 0) {
            renderAppearanceOverlay(
              appearanceCanvas,
              viewport.width,
              viewport.height,
              pageAppearance,
              isScanLikeDoc,
              imgRects,
              canvas,
            );
          }
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageAppearance, isScanLikeDoc, activeContinuousPages, viewMode, zoomScale]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const pending = pendingContinuousPageRef.current;
    if (pending === null) return;
    const target = continuousContainerRef.current?.querySelector<HTMLElement>(`[data-page="${pending}"]`);
    target?.scrollIntoView({ block: "start", behavior: "auto" });
    pendingContinuousPageRef.current = null;
  }, [viewMode, pageNumber]);

  function handleContinuousScroll() {
    const pdf = pdfRef.current;
    const container = continuousContainerRef.current;
    if (!pdf || !container) return;
    const pendingPage = pendingContinuousPageRef.current;
    if (pendingPage !== null) {
      setPageNumber(pendingPage);
      saveLocation(pendingPage, pdf.numPages);
      return;
    }
    const pageHeights = computePageHeights(pageDimensionsRef.current, page1ViewportRef.current, zoomScale, 16);
    const current = currentPageFromScroll(pageHeights, container.scrollTop);
    setPageNumber(current);
    saveLocation(current, pdf.numPages);

    const visiblePages = computeActivePagesFromScroll(
      pageHeights,
      container.scrollTop,
      container.clientHeight || 800,
      1,
    );
    setActiveContinuousPages(visiblePages);
  }

  function triggerPageTurnAnimation() {
    const container = canvasRef.current?.parentElement;
    if (container) {
      container.classList.remove("page-turn-animating");
      void container.offsetWidth;
      container.classList.add("page-turn-animating");
      setTimeout(() => {
        container.classList.remove("page-turn-animating");
      }, 160);
    }
  }

  function navigatePage(delta: -1 | 1) {
    const nextPage = Math.min(pageCount || 1, Math.max(1, pageNumber + delta));
    if (nextPage === pageNumber) return;
    if (viewMode === "continuous") pendingContinuousPageRef.current = nextPage;
    setPageNumber(nextPage);
    playPageTurn();
    if (viewMode === "single") {
      triggerPageTurnAnimation();
    } else if (pageCount > 0) {
      saveLocation(nextPage, pageCount);
    }
  }

  // V2-M2: a Contents bookmark's href is the 1-based page number produced
  // by `pdfOutlineToTocItems` -- mirrors NotebookPanel's own `onJumpTo`
  // page-jump pattern (validate range, switch to single-page view, set the
  // page directly) rather than routing PDF navigation through any
  // EPUB-specific path.
  // V2-M2 addendum: keeps the editable page field synced with pageNumber
  // regardless of which path changed it (Previous/Next, a bookmark jump,
  // continuous-scroll's own page tracking, ...) -- pageNumber is the one
  // state every navigation path already funnels through.
  useEffect(() => {
    setPageInputText(String(pageNumber));
    setPageJumpInvalid(false);
  }, [pageNumber]);

  function commitPageJump() {
    const result = parsePageJumpInput(pageInputText, pageCount);
    if (result.kind === "empty") {
      setPageInputText(String(pageNumber));
      setPageJumpInvalid(false);
      return;
    }
    if (result.kind === "invalid") {
      setPageJumpInvalid(true);
      return;
    }
    setPageJumpInvalid(false);
    if (result.page === pageNumber) {
      setPageInputText(String(pageNumber));
      return;
    }
    if (viewMode === "continuous") {
      pendingContinuousPageRef.current = result.page;
    }
    setPageNumber(result.page);
    if (viewMode === "single") {
      triggerPageTurnAnimation();
    } else if (pageCount > 0) {
      saveLocation(result.page, pageCount);
    }
  }

  function renderPageJumpField() {
    return (
      <span className="pdf-page-jump">
        Page{" "}
        <input
          type="text"
          inputMode="numeric"
          aria-label="Current page"
          className="pdf-page-jump-input"
          value={pageInputText}
          onChange={(e) => setPageInputText(e.target.value)}
          onBlur={commitPageJump}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitPageJump();
            }
          }}
        />
        {pageCount > 0 ? ` of ${pageCount}` : ""}
      </span>
    );
  }

  function handleTocNavigate(href: string) {
    const page = parseInt(href, 10);
    if (!Number.isFinite(page) || page < 1 || (pageCount > 0 && page > pageCount)) return;
    setViewMode("single");
    setPageNumber(page);
    setTocOpen(false);
  }

  function handlePdfLinkClick(target: PdfLinkTarget) {
    if (target.kind === "internal") {
      const targetPage = target.pageNumber;
      if (targetPage >= 1 && (pageCount === 0 || targetPage <= pageCount)) {
        if (targetPage === pageNumber) return;
        if (viewMode === "continuous") {
          pendingContinuousPageRef.current = targetPage;
        }
        setPageNumber(targetPage);
        playPageTurn();
        if (viewMode === "single") {
          triggerPageTurnAnimation();
        } else if (pageCount > 0) {
          saveLocation(targetPage, pageCount);
        }
      }
    } else if (target.kind === "external") {
      setExternalLinkPromptUrl(target.url);
    }
  }

  async function handleOpenExternalLink(url: string) {
    setExternalLinkPromptUrl(null);
    try {
      await openUrl(url);
    } catch (e) {
      console.error("Failed to open external URL:", e);
    }
  }

  async function applyFit(nextFitMode: Exclude<PdfFitMode, "custom">) {
    const pdf = pdfRef.current;
    const surface = viewMode === "continuous" ? continuousContainerRef.current : singlePageSurfaceRef.current;
    if (!pdf || !surface) return;
    const page = await pdf.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(1, surface.clientWidth - 32);
    const availableHeight = Math.max(1, surface.clientHeight - 32);
    const widthScale = availableWidth / natural.width;
    const nextScale = nextFitMode === "width" ? widthScale : Math.min(widthScale, availableHeight / natural.height);
    setFitMode(nextFitMode);
    setZoomScale(clampPdfScale(nextScale));
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        blocksPdfNavigationShortcut(event.target) ||
        notebookOpen ||
        ocrWorkspaceOpen ||
        showCompletionPrompt ||
        checkpoint.showPrompt ||
        externalLinkPromptUrl !== null ||
        selection !== null
      ) {
        return;
      }
      event.preventDefault();
      navigatePage(event.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pageNumber, pageCount, viewMode, notebookOpen, ocrWorkspaceOpen, showCompletionPrompt, checkpoint.showPrompt, externalLinkPromptUrl, selection, soundEnabled]);

  function switchViewMode(next: PdfViewMode) {
    setFitMode("custom");
    if (next === "continuous") {
      pendingContinuousPageRef.current = pageNumber;
      const initialRange = computeActivePageRange(pageNumber, pageCount, 2);
      const initialList: number[] = [];
      for (let p = initialRange.startPage; p <= initialRange.endPage; p++) {
        initialList.push(p);
      }
      setActiveContinuousPages(initialList);
    }
    setViewMode(next);
  }

  return (
    <ReaderShell
      title={title}
      onBack={() => checkpoint.requestBack(onBack)}
      status={status}
      progressPercent={pageCount > 0 ? (pageNumber / pageCount) * 100 : progress?.active_pass_progress}
      toolbarBottom={
        <div className="pdf-toolbar" role="toolbar" aria-label="PDF Reader Toolbar">
          <div className="pdf-toolbar-row pdf-toolbar-row--config">
            {toc.length > 0 && (
              <div className="pdf-toolbar-group pdf-toolbar-group--document">
                <button type="button" onClick={() => setTocOpen((open) => !open)}>
                  Contents
                </button>
              </div>
            )}
            <div className="pdf-toolbar-group pdf-toolbar-group--view">
              <label className="pdf-toolbar-select-label">
                <span className="pdf-toolbar-field-label">View</span>
                <select
                  aria-label="View mode"
                  value={viewMode}
                  onChange={(e) => switchViewMode(e.target.value as PdfViewMode)}
                >
                  <option value="single">Single page</option>
                  <option value="continuous">Continuous scroll</option>
                </select>
              </label>
              <label className="pdf-toolbar-select-label">
                <span className="pdf-toolbar-field-label">Appearance</span>
                <select
                  aria-label="Page appearance"
                  className="pdf-appearance-select"
                  value={pageAppearance}
                  onChange={(e) => {
                    const next = e.target.value as PdfPageAppearance;
                    setPageAppearance(next);
                    setPdfPageAppearancePreference(next);
                  }}
                >
                  <option value="default">Default</option>
                  <option value="day">Day</option>
                  <option value="eyecare">Eye Care</option>
                  <option value="parchment">Parchment</option>
                  <option value="night">Night</option>
                </select>
              </label>
            </div>
            <div className="pdf-toolbar-group pdf-toolbar-group--geometry">
              <div className="pdf-toolbar-zoom-stepper">
                <button
                  type="button"
                  aria-label="Zoom out"
                  disabled={zoomScale <= MIN_PDF_SCALE}
                  onClick={() => {
                    setFitMode("custom");
                    setZoomScale((scale) => clampPdfScale(scale - PDF_ZOOM_STEP));
                  }}
                >
                  −
                </button>
                <span aria-label="PDF zoom" className="pdf-zoom-value">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  disabled={zoomScale >= MAX_PDF_SCALE}
                  onClick={() => {
                    setFitMode("custom");
                    setZoomScale((scale) => clampPdfScale(scale + PDF_ZOOM_STEP));
                  }}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                aria-label="Fit page"
                aria-pressed={fitMode === "page"}
                onClick={() => void applyFit("page")}
              >
                Fit Page
              </button>
              <button
                type="button"
                aria-label="Fit width"
                aria-pressed={fitMode === "width"}
                onClick={() => void applyFit("width")}
              >
                Fit Width
              </button>
            </div>
          </div>
          <div className="pdf-toolbar-row pdf-toolbar-row--actions">
            <div className="pdf-toolbar-group pdf-toolbar-group--navigation">
              {viewMode === "single" && (
                <>
                  <button
                    type="button"
                    disabled={pageNumber <= 1}
                    onClick={() => navigatePage(-1)}
                  >
                    Previous
                  </button>
                  {renderPageJumpField()}
                  <button
                    type="button"
                    disabled={pageCount > 0 && pageNumber >= pageCount}
                    onClick={() => navigatePage(1)}
                  >
                    Next
                  </button>
                </>
              )}
              {viewMode === "continuous" && renderPageJumpField()}
            </div>
            <div className="pdf-toolbar-group pdf-toolbar-group--tools">
              <button type="button" onClick={() => setNotebookOpen((o) => !o)}>
                Notebook
              </button>
              {documentClassification?.ocrEligible && (
                <button type="button" onClick={() => setOcrWorkspaceOpen(true)}>
                  OCR Workspace
                </button>
              )}
              <button type="button" aria-label="Toggle page-turn sound" onClick={toggleSound}>
                {soundEnabled ? "Sound: On" : "Sound: Off"}
              </button>
            </div>
          </div>
        </div>
      }
      overlay={
        tocOpen ? (
          <TocPanel toc={toc} onNavigate={handleTocNavigate} onClose={() => setTocOpen(false)} />
        ) : notebookOpen ? (
          <NotebookPanel
            key={notebookRefreshKey}
            bookId={bookId}
            bookTitle={title}
            onClose={() => setNotebookOpen(false)}
            onJumpTo={(asset) => {
              if (!asset.anchor) return false;
              const page = parseInt(asset.anchor.primary_anchor, 10);
              if (!Number.isFinite(page) || page < 1 || (pageCount > 0 && page > pageCount)) return false;
              setViewMode("single");
              setPageNumber(page);
              return true;
            }}
          />
        ) : (
          ocrWorkspaceOpen &&
          pdfRef.current && (
            <OcrWorkspace
              bookId={bookId}
              pdf={pdfRef.current}
              currentPage={pageNumber}
              onClose={() => setOcrWorkspaceOpen(false)}
              onOcrUpdated={refreshOcrText}
            />
          )
        )
      }
    >
      {showCompletionPrompt && (
        <CompletionPrompt onStartNextRead={startNextRead} onDismiss={dismissCompletionPrompt} />
      )}
      {checkpoint.showPrompt && (
        <ReadingCheckpointPrompt
          onDismiss={checkpoint.dismiss}
          onSaveNote={async (text) => {
            await invoke("create_reading_asset_command", { bookId, kind: "note", text, anchor: null }).catch(() => {});
          }}
        />
      )}
      {jumpFailed && (
        <p role="alert" className="jump-failed-notice">
          Could not jump to the exact location — opened the Book instead.
        </p>
      )}
      {pageJumpInvalid && (
        <p role="alert" className="pdf-page-jump-invalid-notice">
          Enter a whole page number{pageCount > 0 ? ` between 1 and ${pageCount}` : ""}.
        </p>
      )}
      {documentClassification?.ocrEligible && (
        <div
          className={`pdf-ocr-notice ${noticeCollapsed ? "pdf-ocr-notice--collapsed" : ""}`}
          role="region"
          aria-label="Scanned document notice"
        >
          {noticeCollapsed ? (
            <button
              type="button"
              className="pdf-ocr-notice-expand"
              onClick={() => setNoticeCollapsed(false)}
              title="Expand Scanned PDF Notice"
            >
              Scanned PDF — Expand notice
            </button>
          ) : (
            <div className="pdf-ocr-notice-body">
              <span className="pdf-ocr-notice-badge">Scanned PDF</span>
              <span className="pdf-ocr-notice-text">
                {ocrText
                  ? `OCR text available for Page ${pageNumber}`
                  : "No extractable text found on this page. Visual reading works normally; search and annotations require OCR."}
              </span>
              <div className="pdf-ocr-notice-actions">
                <button
                  type="button"
                  className="pdf-ocr-open-btn"
                  onClick={() => setOcrWorkspaceOpen(true)}
                >
                  {ocrText ? "Open OCR Workspace" : "Run OCR in Workspace"}
                </button>
                <button
                  type="button"
                  className="pdf-ocr-notice-dismiss"
                  onClick={() => setNoticeCollapsed(true)}
                  title="Collapse notice"
                  aria-label="Collapse notice"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {viewMode === "single" && selection && (
        <div className="selection-toolbar" role="toolbar" aria-label="Selection actions">
          <div className="selection-toolbar-colors" aria-label="Highlight color preset palette">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`highlight-swatch highlight-swatch--${c}`}
                aria-label={`${c} highlight`}
                aria-pressed={highlightColor === c}
                onClick={() => {
                  setHighlightColor(c);
                  handleCaptureSelection("annotation", c);
                }}
              />
            ))}
            <button
              type="button"
              className="highlight-swatch highlight-swatch--clear"
              aria-label="Remove highlight"
              title="Remove highlight"
              onClick={handleRemoveHighlight}
            />
          </div>
          <button type="button" onClick={() => handleCaptureSelection("annotation")}>
            Highlight
          </button>
          <button type="button" onClick={() => handleCaptureSelection("excerpt")}>
            Excerpt
          </button>
        </div>
      )}
      {viewMode === "single" ? (
        <div ref={singlePageSurfaceRef} className="reader-surface">
          <div
            className="pdf-page"
            data-appearance={pageAppearance}
            data-scan-like={isScanLikeDoc ? "true" : "false"}
          >
            <canvas ref={canvasRef} />
            <canvas ref={appearanceCanvasRef} className="pdf-appearance-overlay" aria-hidden="true" />
            <div ref={textLayerRef} className="textLayer pdf-text-layer" />
            <div className="pdf-link-layer" aria-label="PDF Links">
              {pageLinks.map((link, idx) => {
                const label =
                  link.target.kind === "internal"
                    ? `Jump to page ${link.target.pageNumber}`
                    : link.target.kind === "external"
                    ? `Open external link: ${link.target.url}`
                    : "Unsupported link";
                return (
                  <a
                    key={idx}
                    role="link"
                    tabIndex={0}
                    aria-label={label}
                    className="pdf-link-item"
                    style={{
                      left: `${link.rect.left}px`,
                      top: `${link.rect.top}px`,
                      width: `${link.rect.width}px`,
                      height: `${link.rect.height}px`,
                    }}
                    title={label}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePdfLinkClick(link.target);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePdfLinkClick(link.target);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={continuousContainerRef}
          className="reader-surface pdf-continuous"
          onScroll={handleContinuousScroll}
        >
          {Array.from({ length: pageCount }, (_, i) => {
            const pNum = i + 1;
            const unscaled = pageDimensionsRef.current[i] || page1ViewportRef.current;
            const continuousPageDims = resolvePageDimension(unscaled, page1ViewportRef.current, zoomScale);
            return (
              <div
                key={i}
                className="pdf-page continuous-page"
                data-page={pNum}
                data-appearance={pageAppearance}
                data-scan-like={isScanLikeDoc ? "true" : "false"}
                style={{
                  width: `${continuousPageDims.width}px`,
                  height: `${continuousPageDims.height}px`,
                  minHeight: `${continuousPageDims.height}px`,
                  marginBottom: "16px",
                }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[i] = el;
                  }}
                />
                <canvas
                  ref={(el) => {
                    appearanceCanvasRefs.current[i] = el;
                  }}
                  className="pdf-appearance-overlay"
                  aria-hidden="true"
                />
              </div>
            );
          })}
        </div>
      )}
      {externalLinkPromptUrl && (
        <PdfExternalLinkModal
          url={externalLinkPromptUrl}
          onConfirm={handleOpenExternalLink}
          onCancel={() => setExternalLinkPromptUrl(null)}
        />
      )}
    </ReaderShell>
  );
}
