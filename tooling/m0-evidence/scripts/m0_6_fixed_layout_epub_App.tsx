import { useEffect, useRef, useState } from "react";

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

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
        const view = document.createElement("foliate-view") as any;
        view.style.cssText = "width:500px;height:400px;display:block;border:1px solid #ccc";
        hostRef.current?.appendChild(view);

        const resp = await fetch("/fixtures/fixed_layout_sample.epub");
        const blob = await resp.blob();
        const file = new File([blob], "fixed_layout_sample.epub", { type: "application/epub+zip" });

        append(`fetched fixed-layout epub: ${blob.size} bytes`);
        await view.open(file);
        append("view.open resolved");
        append(`book sections: ${view.book?.sections?.length}`);
        append(`rendition layout metadata: ${JSON.stringify(view.book?.rendition)}`);

        await settle();
        append(`lastLocation after open: ${JSON.stringify(view.lastLocation)}`);

        await view.next?.();
        await settle();
        append(`lastLocation after next(): ${JSON.stringify(view.lastLocation)}`);

        append("DONE");
      } catch (e: any) {
        append("ERROR: " + (e?.stack || e?.message || String(e)));
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h3>M0-6 corrective: fixed-layout EPUB sanity check</h3>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f5f5f5", padding: 8 }}>
        {log.join("\n")}
      </pre>
      <div ref={hostRef} />
    </div>
  );
}
