// M0 Corrective Evidence - M0-D: EPUB DocumentLocation stability
// (reopen / resize / typography change / jump-back), run against
// fixtures/alice.epub via foliate-js in a live browser preview.
//
// Reproduction: scaffold `npm create vite@latest -- --template react-ts`,
// `npm install foliate-js pdfjs-dist`, copy alice.epub into public/fixtures/,
// replace src/App.tsx with this file, `npm run dev`, open in a browser and
// read the rendered log (or console). See results/m0d_epub_docloc.txt for
// the captured output this file produced.
import { useEffect, useRef, useState } from "react";

async function loadBook() {
  const resp = await fetch("/fixtures/alice.epub");
  const blob = await resp.blob();
  return new File([blob], "alice.epub", { type: "application/epub+zip" });
}

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | "TIMEOUT"> {
  return Promise.race([
    p,
    new Promise<"TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), ms)).then((v) => {
      console.warn("TIMEOUT on", label);
      return v;
    }),
  ]) as any;
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<string[]>([]);
  const doneRef = useRef(false);
  const append = (s: string) => setLog((l) => [...l, s]);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    (async () => {
      try {
        // @ts-ignore
        await import("foliate-js/view.js");

        const viewA = document.createElement("foliate-view") as any;
        viewA.style.cssText = "width:400px;height:500px;display:block;border:1px solid #ccc";
        hostRef.current?.appendChild(viewA);

        await viewA.open(await loadBook());
        append("[A] opened");

        await viewA.goTo("epubcfi(/6/8!/4/2/1:0)").catch((e: any) => append("goTo error: " + e));
        await settle();
        const savedCfi = viewA.lastLocation?.cfi || "";
        append(`[A] navigated, savedCfi=${savedCfi}`);

        const iframeA = viewA.renderer?.getContents?.()?.[0]?.doc;
        const savedTextSnippet = iframeA ? (iframeA.body?.innerText || "").slice(0, 80) : "";
        append(`[A] text snippet at anchor: ${JSON.stringify(savedTextSnippet)}`);

        // ---------- Typography change ----------
        append("[A] calling setStyles...");
        viewA.renderer?.setStyles?.(`
          @namespace epub "http://www.idpf.org/2007/ops";
          html, body { font-size: 220% !important; line-height: 1.8 !important; }
        `);
        append("[A] setStyles called (sync return), settling...");
        await settle();
        append("[A] settled, calling goTo(savedCfi) after typography change...");
        const r1 = await withTimeout(viewA.goTo(savedCfi), 5000, "goTo after typography");
        append(`[A] goTo after typography returned: ${r1}`);
        await settle();
        const cfiAfterTypography = viewA.lastLocation?.cfi || "";
        append(`[A] after typography change (220% font), re-goTo(savedCfi) -> cfi=${cfiAfterTypography}`);
        append(`[A] section match: ${cfiAfterTypography.split("!")[0] === savedCfi.split("!")[0]}`);

        // ---------- Resize ----------
        viewA.style.width = "220px";
        viewA.style.height = "700px";
        await settle();
        const r2 = await withTimeout(viewA.goTo(savedCfi), 5000, "goTo after resize");
        append(`[A] goTo after resize returned: ${r2}`);
        await settle();
        const cfiAfterResize = viewA.lastLocation?.cfi || "";
        append(`[A] after resize (220x700), re-goTo(savedCfi) -> cfi=${cfiAfterResize}`);
        append(`[A] section match: ${cfiAfterResize.split("!")[0] === savedCfi.split("!")[0]}`);

        // ---------- Reopen: fresh View B instance ----------
        const viewB = document.createElement("foliate-view") as any;
        viewB.style.cssText = "width:400px;height:500px;display:block;border:1px solid #090";
        hostRef.current?.appendChild(viewB);
        await viewB.open(await loadBook());
        await viewB.goTo(savedCfi);
        await settle();
        const cfiInB = viewB.lastLocation?.cfi || "";
        const iframeB = viewB.renderer?.getContents?.()?.[0]?.doc;
        const textB = iframeB ? (iframeB.body?.innerText || "").slice(0, 80) : "";
        append(`[B fresh instance = "reopen"] goTo(savedCfi) -> cfi=${cfiInB}`);
        append(`[B] text snippet at same anchor: ${JSON.stringify(textB)}`);
        append(`[B] jump-back text match vs [A] original: ${textB === savedTextSnippet}`);
        append(`[B] jump-back cfi exact match: ${cfiInB === savedCfi}`);

        append("DONE");
      } catch (e: any) {
        append("ERROR: " + (e?.stack || e?.message || String(e)));
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h3>M0-D corrective: EPUB DocumentLocation stability (reopen/resize/typography/jump-back)</h3>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f5f5f5", padding: 8 }}>
        {log.join("\n")}
      </pre>
      <div ref={hostRef} />
    </div>
  );
}
