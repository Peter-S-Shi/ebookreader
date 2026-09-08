"""
M0 Corrective Evidence - M0-F: run the full RapidOCR (PP-OCRv4) pipeline
against real, public-domain, redistributable scanned document pages
(fixtures/ocr_real/*.jpg - see fixtures/ocr_real/SOURCE.md for provenance).

Requires: pip install rapidocr-onnxruntime pillow
Run from repo root: python tooling/m0-evidence/scripts/m0f_run_rapidocr_real.py
Writes JSON result files into tooling/m0-evidence/results/.
"""
import sys, io, json, time, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import tracemalloc
from rapidocr_onnxruntime import RapidOCR

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "..", "fixtures", "ocr_real")
RESULTS = os.path.join(HERE, "..", "results")

engine = RapidOCR()

for name in ["ia_100.jpg", "ia_200.jpg"]:
    path = os.path.join(FIXTURES, name)
    tracemalloc.start()
    t0 = time.time()
    result, elapse = engine(path)
    dt = time.time() - t0
    cur, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    out = {
        "fixture": name,
        "wall_time_s": round(dt, 3),
        "engine_reported_elapse": elapse,
        "python_traced_peak_mb": round(peak / 1024 / 1024, 2),
        "num_lines_detected": len(result) if result else 0,
        "lines": [],
    }
    if result:
        for box, text, score in result:
            out["lines"].append({
                "text": text,
                "score": round(float(score), 3),
                "box": [[round(p[0], 1), round(p[1], 1)] for p in box],
            })
    out_path = os.path.join(RESULTS, f"m0f_rapidocr_result_{name.replace('.', '_')}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"=== {name} ===")
    print(f"wall_time_s={out['wall_time_s']} lines={out['num_lines_detected']} peak_mem_mb={out['python_traced_peak_mb']}")
    for line in out["lines"][:8]:
        print(f"  [{line['score']}] {line['text'][:60]}")
    print("...")
