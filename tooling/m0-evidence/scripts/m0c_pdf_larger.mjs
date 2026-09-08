// M0 Corrective Evidence - M0-C/M0-6: larger real PDF, all-pages pass
// (renderer-lock sanity check, not full M2 implementation)
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const bytes = fs.readFileSync(process.argv[2]);
const t0 = Date.now();
const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
console.log(`numPages: ${doc.numPages}`);

let totalItems = 0;
for (let i = 1; i <= doc.numPages; i++) {
  const pt0 = Date.now();
  const page = await doc.getPage(i);
  const viewport = page.getViewport({ scale: 1.5 });
  const content = await page.getTextContent();
  totalItems += content.items.length;
  const pdt = Date.now() - pt0;
  console.log(`page ${i}: ${content.items.length} text items, viewport ${viewport.width.toFixed(0)}x${viewport.height.toFixed(0)} @1.5x, ${pdt}ms`);
}
const totalMs = Date.now() - t0;
console.log(`\nTOTAL: ${doc.numPages} pages, ${totalItems} text items, ${totalMs}ms wall (load+parse all pages)`);
console.log(`avg per page: ${(totalMs / doc.numPages).toFixed(1)}ms`);
