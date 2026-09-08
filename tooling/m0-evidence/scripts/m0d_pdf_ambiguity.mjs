import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const bytes = fs.readFileSync(process.argv[2]);
const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
const page = await doc.getPage(1);
const content = await page.getTextContent();
const counts = {};
for (const it of content.items) {
  const t = it.str.trim();
  if (!t) continue;
  counts[t] = (counts[t] || 0) + 1;
}
const ambiguous = Object.entries(counts).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
console.log("ambiguous text-quote fragments on page 1 (count > 1):", ambiguous.slice(0, 5));
