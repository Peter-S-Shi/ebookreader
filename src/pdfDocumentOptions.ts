import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";

/**
 * Shared pdf.js standard runtime resource configuration for static assets.
 * Ensures consistent availability of CJK fonts/cmaps and WASM decoders (JBIG2, OpenJPEG, QCMS)
 * across development and production environments.
 */
export const PDFJS_STANDARD_RESOURCE_OPTIONS = {
  cMapUrl: "/cmaps/",
  cMapPacked: true,
  wasmUrl: "/wasm/",
} as const;

/**
 * Creates full pdf.js getDocument initialization parameters with standard static asset paths.
 */
export function createPdfDocumentLoadingParams(
  data: Uint8Array | ArrayBuffer | number[],
  extraOptions?: Partial<DocumentInitParameters>,
): DocumentInitParameters {
  const uint8Data =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(Array.isArray(data) ? data : (data as ArrayBuffer));

  return {
    data: uint8Data,
    ...PDFJS_STANDARD_RESOURCE_OPTIONS,
    ...extraOptions,
  };
}
