#!/usr/bin/env python3
"""
Batch runner — process multiple PDFs in parallel via ThreadPool.

Usage:
  python batch.py --pdfs pdf1.pdf pdf2.pdf ... --outroot ./out
  python batch.py --pdf-dir ./papers --outroot ./out --workers 10

Each PDF gets its own output subfolder named after the PDF stem.
A combined batch_report.md summarizes all extractions.

For heavy parallel workloads (10+ PDFs), prefer launching each PDF
via a separate Claude subagent — that gives full context isolation.
This script is for quick local batch runs.
"""
import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Local import
sys.path.insert(0, str(Path(__file__).parent))
from extract import extract, classify_pages  # noqa: E402
from profile import fingerprint, load_registry, match_profile  # noqa: E402


def process_one(pdf_path: Path, outroot: Path, dpi: int = 600) -> dict:
    """Process a single PDF. Returns summary dict."""
    start = time.time()
    stem = pdf_path.stem
    # ASCII-safe folder name
    safe_stem = "".join(c if c.isascii() and (c.isalnum() or c in "_-") else "_" for c in stem)
    outdir = outroot / safe_stem

    result = {
        "pdf": str(pdf_path),
        "outdir": str(outdir),
        "status": "pending",
    }

    try:
        # Fingerprint + profile match
        fp = fingerprint(str(pdf_path))
        reg = load_registry()
        profile_name, confidence = match_profile(fp, reg)
        profile = None
        if profile_name and confidence >= 0.4:
            profile = reg["profiles"][profile_name].get("layout", {})
            profile["caption_pattern"] = reg["profiles"][profile_name].get("caption_pattern")
            result["profile_used"] = profile_name
            result["profile_confidence"] = round(confidence, 3)
        else:
            result["profile_used"] = "unknown_fallback"
            result["profile_confidence"] = 0.0

        # Classify pages — skip covers/TOC
        classification = classify_pages(str(pdf_path))
        skip_pages = [c["page"] for c in classification
                      if c.get("likely_cover") or c.get("likely_toc") or c.get("is_blank")]
        result["skipped_pages"] = skip_pages
        result["total_pages"] = len(classification)

        # Extract
        ext_result = extract(
            str(pdf_path),
            str(outdir),
            dpi=dpi,
            profile=profile,
            skip_pages=skip_pages,
        )
        result["files_extracted"] = ext_result["count"]
        result["report"] = ext_result["report"]
        result["status"] = "success"

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    result["duration_sec"] = round(time.time() - start, 2)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdfs", nargs="*", help="Explicit PDF paths")
    parser.add_argument("--pdf-dir", help="Directory containing PDFs (non-recursive)")
    parser.add_argument("--outroot", required=True, help="Root output folder")
    parser.add_argument("--dpi", type=int, default=600)
    parser.add_argument("--workers", type=int, default=4, help="Max parallel workers")
    args = parser.parse_args()

    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    pdfs = []
    if args.pdfs:
        pdfs.extend(Path(p) for p in args.pdfs)
    if args.pdf_dir:
        d = Path(args.pdf_dir)
        pdfs.extend(sorted(d.glob("*.pdf")))

    if not pdfs:
        print("No PDFs provided. Use --pdfs or --pdf-dir.", file=sys.stderr)
        sys.exit(1)

    outroot = Path(args.outroot)
    outroot.mkdir(parents=True, exist_ok=True)

    print(f"Batch: {len(pdfs)} PDFs, {args.workers} workers, DPI={args.dpi}")
    results = []

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(process_one, p, outroot, args.dpi): p for p in pdfs}
        for fut in as_completed(futures):
            r = fut.result()
            tag = "OK " if r["status"] == "success" else "ERR"
            print(f"[{tag}] {Path(r['pdf']).name} "
                  f"({r.get('files_extracted', 0)} files, "
                  f"{r['duration_sec']}s, profile={r.get('profile_used', '?')})")
            results.append(r)

    # Combined report
    report_path = outroot / "batch_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"# Batch Extraction Report\n\n")
        f.write(f"Total: {len(results)} PDFs\n\n")
        f.write("| PDF | Status | Files | Profile (conf) | Skipped | Duration | Outdir |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        for r in results:
            f.write(
                f"| {Path(r['pdf']).name} | {r['status']} | "
                f"{r.get('files_extracted', 0)} | "
                f"{r.get('profile_used', '?')} ({r.get('profile_confidence', 0)}) | "
                f"{len(r.get('skipped_pages', []))} | "
                f"{r['duration_sec']}s | "
                f"`{Path(r['outdir']).name}` |\n"
            )
        if any(r["status"] == "error" for r in results):
            f.write("\n## Errors\n\n")
            for r in results:
                if r["status"] == "error":
                    f.write(f"- **{Path(r['pdf']).name}**: {r['error']}\n")

    # JSON for downstream
    with open(outroot / "batch_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nBatch complete. Report: {report_path}")


if __name__ == "__main__":
    main()
