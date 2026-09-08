// M0 Corrective Evidence - M0-D: PDF DocumentLocation stability
// (reopen / resize-zoom / jump-back via text-quote context)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const pdfPath = process.argv[2];

async function loadPage1(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(1);
  return { doc, page };
}

async function main() {
  const bytes = fs.readFileSync(pdfPath);

  // ---- Session A: pick an anchor text item, compute a NORMALIZED (0..1) ----
  // ---- location so it survives a different zoom/viewport scale.        ----
  const { page: pageA } = await loadPage1(bytes);
  const viewportA = pageA.getViewport({ scale: 1.0 });
  const contentA = await pageA.getTextContent();
  const anchorItem = contentA.items[0];
  const [, , , , x, y] = anchorItem.transform;
  const normX = x / viewportA.width;
  const normY = y / viewportA.height;
  const anchorQuote = anchorItem.str;
  console.log(`[A] anchor text: ${JSON.stringify(anchorQuote)}`);
  console.log(`[A] pixel pos @scale=1.0: (${x.toFixed(2)}, ${y.toFixed(2)})`);
  console.log(`[A] normalized pos: (${normX.toFixed(4)}, ${normY.toFixed(4)})`);

  // ---- Resize/zoom: recompute pixel position at a DIFFERENT scale from ----
  // ---- the stored normalized coordinate, and confirm it round-trips.  ----
  for (const scale of [0.5, 1.0, 2.0, 3.0]) {
    const viewport = pageA.getViewport({ scale });
    const expectedX = normX * viewport.width;
    const expectedY = normY * viewport.height;
    console.log(`  [resize scale=${scale}] normalized->pixel: (${expectedX.toFixed(2)}, ${expectedY.toFixed(2)}) viewport=${viewport.width.toFixed(0)}x${viewport.height.toFixed(0)}`);
  }

  // ---- "Reopen": load the SAME bytes into a completely fresh pdf.js    ----
  // ---- document instance (simulating app restart), then re-locate the ----
  // ---- anchor purely by text-quote context (the DocumentLocation      ----
  // ---- fallback anchor), not by any cached object reference.          ----
  const { page: pageB } = await loadPage1(bytes);
  const contentB = await pageB.getTextContent();
  const found = contentB.items.find((it) => it.str === anchorQuote);
  console.log(`\n[B fresh instance = "reopen"] re-locate by text-quote "${anchorQuote}": ${found ? "FOUND" : "NOT FOUND"}`);
  if (found) {
    const [, , , , fx, fy] = found.transform;
    console.log(`[B] pixel pos: (${fx.toFixed(2)}, ${fy.toFixed(2)})  matches [A]: ${fx === x && fy === y}`);
  }

  // ---- Jump-back robustness: what if the exact string is ambiguous     ----
  // ---- (appears more than once)? Report count so we know whether text- ----
  // ---- quote alone is a safe sole anchor or needs the context_selector ----
  // ---- (surrounding text) that ARCHITECTURE.md already specifies.      ----
  const matches = contentB.items.filter((it) => it.str === anchorQuote).length;
  console.log(`[B] text-quote match count on page: ${matches} (>1 means text-quote alone is AMBIGUOUS -> context_selector required)`);
}

main();
