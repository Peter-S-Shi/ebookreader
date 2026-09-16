import { describe, it, expect } from "vitest";
import {
  PDFJS_STANDARD_RESOURCE_OPTIONS,
  createPdfDocumentLoadingParams,
} from "./pdfDocumentOptions";

describe("pdfDocumentOptions", () => {
  it("defines required static resource paths for cmaps and wasm decoders", () => {
    expect(PDFJS_STANDARD_RESOURCE_OPTIONS).toEqual({
      cMapUrl: "/cmaps/",
      cMapPacked: true,
      wasmUrl: "/wasm/",
    });
  });

  it("creates complete document loading parameters from Uint8Array", () => {
    const rawData = new Uint8Array([37, 80, 68, 70, 45]);
    const params = createPdfDocumentLoadingParams(rawData);

    expect(params.data).toBe(rawData);
    expect(params.cMapUrl).toBe("/cmaps/");
    expect(params.cMapPacked).toBe(true);
    expect(params.wasmUrl).toBe("/wasm/");
  });

  it("converts number array or ArrayBuffer to Uint8Array while applying standard options", () => {
    const arrayBuffer = new ArrayBuffer(8);
    const params1 = createPdfDocumentLoadingParams(arrayBuffer);
    expect(params1.data).toBeInstanceOf(Uint8Array);
    expect(params1.wasmUrl).toBe("/wasm/");

    const numberArray = [1, 2, 3, 4];
    const params2 = createPdfDocumentLoadingParams(numberArray);
    expect(params2.data).toBeInstanceOf(Uint8Array);
    expect(params2.cMapUrl).toBe("/cmaps/");
    expect(params2.wasmUrl).toBe("/wasm/");
  });

  it("allows extra parameters while preserving standard wasm and cmap configuration by default", () => {
    const rawData = new Uint8Array([37, 80, 68, 70, 45]);
    const params = createPdfDocumentLoadingParams(rawData, {
      stopAtErrors: true,
      maxImageSize: 1024,
    });

    expect(params.data).toBe(rawData);
    expect(params.cMapUrl).toBe("/cmaps/");
    expect(params.wasmUrl).toBe("/wasm/");
    expect(params.stopAtErrors).toBe(true);
    expect(params.maxImageSize).toBe(1024);
  });
});
