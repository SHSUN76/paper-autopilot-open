#!/usr/bin/env python3
"""
PDF Figure Extractor v2 — vision-first profiling + caption-anchored precision crop.

Subcommands:
  classify <pdf>                Tier 1 page classification (free, fast)
  render-pages <pdf> [--dpi N]  Render all pages for vision analysis
  extract <pdf> [options]       Precise extraction using vision-generated pages_analysis.json
  clean <pdf>                   Remove temp page renders for a PDF
"""
import argparse
import json
import os
import re
import sys
import shutil
import hashlib
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image


# ============================================================================
# Regexes (default fallbacks; profile can override)
# ============================================================================

DEFAULT_CAPTION_REGEX = re.compile(
    r"^\s*(Figure|Fig\.|Scheme|Table|그림|표|도표)\s*(\d+)[\.\:\|\s]",
    re.MULTILINE,
)

HEADER_URL_REGEX = re.compile(
    r"(www\.|\.com|\.de|\.org|ADVANCED|SCIENCE NEWS|MATERIALS|NATURE|IEEE|pubs\.acs\.org|sciencedirect|elsevier|wiley|springer)",
    re.IGNORECASE,
)

# Section heading patterns to EXCLUDE from "body text above figure" detection.
# Typical forms: "3.2 Electrochemical performance", "II. Results", "2 Methods"
DEFAULT_SECTION_HEADING_REGEX = re.compile(
    r"^\s*"
    r"(?:"
    r"\d+(?:\.\d+)*\.?\s+[A-Z]"  # 1., 1.1, 3.2.1 Capitalized
    r"|"
    r"[IVX]+\.\s+[A-Z]"  # I. II. III. Roman
    r"|"
    r"(?:Abstract|Introduction|Results|Discussion|Methods?|Conclusions?|References|Supplementary|Acknowledg(?:e?ments?)?|Experimental)"
    r")",
    re.MULTILINE,
)


# ============================================================================
# Tier 1: Page classification (unchanged from v1)
# ============================================================================

def classify_pages(pdf_path: str) -> list:
    doc = fitz.open(pdf_path)
    results = []

    for i, page in enumerate(doc):
        text = page.get_text()
        images = page.get_images()
        drawings = page.get_drawings()
        first_500 = text[:500]

        cls = {
            "page": i + 1,
            "text_len": len(text),
            "image_count": len(images),
            "drawing_count": len(drawings),
            "is_blank": len(text) < 100 and len(images) == 0,
            "has_figure_caption": bool(DEFAULT_CAPTION_REGEX.search(text)),
            "caption_matches": [
                {"type": m.group(1), "num": int(m.group(2))}
                for m in DEFAULT_CAPTION_REGEX.finditer(text)
            ],
            "likely_cover": any(
                kw in first_500 for kw in
                ["Cover", "Volume", "Issue", "표지", "연구개발과제",
                 "최종보고서", "News & Views"]
            ) and len(text) < 800,
            "likely_toc": (
                first_500.count("...") > 3 or first_500.count("·") > 3
                or ("목차" in first_500) or ("Contents" in first_500 and len(text) < 2000)
            ),
            "page_size_pt": [round(page.rect.width, 1), round(page.rect.height, 1)],
        }
        results.append(cls)

    doc.close()
    return results


# ============================================================================
# Page rendering for vision analysis
# ============================================================================

def temp_dir_for_pdf(pdf_path: str) -> Path:
    """Generate a stable temp directory path based on PDF hash."""
    h = hashlib.sha256(str(Path(pdf_path).resolve()).encode()).hexdigest()[:12]
    return Path.cwd() / "_temp_pages" / f"{Path(pdf_path).stem[:30]}_{h}"


def render_all_pages(pdf_path: str, dpi: int = 150, tmp_dir: Path = None) -> dict:
    """
    Render every page of the PDF at the given DPI into a temp dir.
    Returns dict with tmp_dir path, page count, and page file paths.
    """
    if tmp_dir is None:
        tmp_dir = temp_dir_for_pdf(pdf_path)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    pages = []
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)

    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=mat, alpha=False)
        out_path = tmp_dir / f"page_{i+1:03d}.png"
        pix.save(str(out_path))
        pages.append({
            "page": i + 1,
            "file": str(out_path),
            "size_px": [pix.width, pix.height],
            "size_pt": [round(page.rect.width, 1), round(page.rect.height, 1)],
        })

    doc.close()
    return {"tmp_dir": str(tmp_dir), "page_count": len(pages), "pages": pages, "dpi": dpi}


# ============================================================================
# Caption detection inside a known y-band (from vision analysis)
# ============================================================================

def find_caption_in_band(
    page,
    y_band_pt: tuple,
    caption_pattern_re: re.Pattern,
    expected_num: int = None,
):
    """
    Find caption block inside a specified y band.
    Returns {bbox_pt, text, num} or None.
    """
    y_top, y_bot = y_band_pt
    blocks = page.get_text("dict").get("blocks", [])
    candidates = []

    for block in blocks:
        if block.get("type") != 0:
            continue
        bx0, by0, bx1, by1 = block["bbox"]
        # Must overlap the band
        if by1 < y_top - 5 or by0 > y_bot + 5:
            continue
        text = ""
        for line in block.get("lines", []):
            text += "".join(span["text"] for span in line.get("spans", [])) + "\n"

        m = caption_pattern_re.match(text.strip())
        if m:
            try:
                num_found = int(m.group(2))
            except (IndexError, ValueError):
                num_found = None
            candidates.append({
                "bbox_pt": list(block["bbox"]),
                "text": text.strip()[:400],
                "num": num_found,
            })

    if not candidates:
        return None
    if expected_num is not None:
        for c in candidates:
            if c["num"] == expected_num:
                return c
    return candidates[0]


def find_all_captions(doc, caption_pattern_re: re.Pattern) -> list:
    """Fallback: scan every page for all caption blocks (v1 behavior)."""
    results = []
    for page_idx, page in enumerate(doc):
        blocks = page.get_text("dict").get("blocks", [])
        for block in blocks:
            if block.get("type") != 0:
                continue
            text = ""
            for line in block.get("lines", []):
                text += "".join(span["text"] for span in line.get("spans", [])) + "\n"
            m = caption_pattern_re.match(text.strip())
            if not m:
                continue
            kind_raw = m.group(1)
            kind_norm = normalize_kind(kind_raw)
            try:
                num = int(m.group(2))
            except (IndexError, ValueError):
                continue
            results.append({
                "page": page_idx + 1,
                "kind": kind_norm,
                "num": num,
                "caption_bbox_pt": list(block["bbox"]),
                "caption_text": text.strip()[:400],
            })
    return results


def normalize_kind(raw: str) -> str:
    if raw.lower() in ("fig.",):
        return "Figure"
    if raw in ("그림",):
        return "Figure"
    if raw in ("표", "도표"):
        return "Table"
    if raw == "Scheme":
        return "Scheme"
    return raw.capitalize()


# ============================================================================
# Bbox determination using caption + vision rough_bbox + section heading exclusion
# ============================================================================

def determine_figure_bbox(
    page,
    caption_bbox_pt: list,
    rough_bbox_pt: list = None,
    header_y_range: tuple = (0, 60),
    include_caption: bool = True,
    top_padding_pt: float = 3,
    section_heading_re: re.Pattern = DEFAULT_SECTION_HEADING_REGEX,
):
    """
    Determine figure bbox by combining:
    - Caption as bottom anchor
    - Optional rough_bbox from vision (guides top/left/right)
    - Text blocks above caption to find top boundary (excluding section headings)
    """
    cap_x0, cap_y0, cap_x2, cap_y1 = caption_bbox_pt
    page_w = page.rect.width

    blocks = page.get_text("dict").get("blocks", [])

    body_blocks_above = []
    for block in blocks:
        if block.get("type") != 0:
            continue
        bx0, by0, bx1, by1 = block["bbox"]
        if by1 >= cap_y0 - 0.5:
            continue

        text = ""
        for line in block.get("lines", []):
            text += "".join(span["text"] for span in line.get("spans", [])) + " "
        text = text.strip()

        # Skip tiny panel labels
        if len(text) < 4 and (by1 - by0) < 15:
            continue

        # Skip header URL bar
        if HEADER_URL_REGEX.search(text) and by0 < header_y_range[1] + 25:
            continue

        # Skip section headings — they are figure separators, not body
        if section_heading_re.match(text) and len(text) < 120:
            continue

        # Must be substantial body content
        if len(text) > 40 or (by1 - by0) > 25:
            body_blocks_above.append((by1, text))

    # Determine top boundary
    if rough_bbox_pt is not None:
        # Vision gave us a starting point — use as strong prior
        vision_top = rough_bbox_pt[1]
        if body_blocks_above:
            body_top = max(body_blocks_above)[0] + top_padding_pt
            # Use the larger (lower on page = closer to caption) of vision_top and body_top
            # BUT respect vision's top if it's higher (figure starts above body block)
            fig_top_pt = min(max(body_top, header_y_range[1] + 2), vision_top + 5)
            # Actually the safer choice: vision_top if reasonable, else body-based
            if abs(vision_top - body_top) < 30:
                fig_top_pt = min(vision_top, body_top)
            else:
                fig_top_pt = vision_top
        else:
            fig_top_pt = vision_top
    elif body_blocks_above:
        fig_top_pt = max(body_blocks_above)[0] + top_padding_pt
    else:
        fig_top_pt = header_y_range[1] + 5

    # Bottom boundary
    fig_bottom_pt = (cap_y1 + top_padding_pt) if include_caption else (cap_y0 - 1)

    # Left/right boundary
    if rough_bbox_pt is not None:
        fig_left_pt = max(20, rough_bbox_pt[0] - 5)
        fig_right_pt = min(page_w - 20, rough_bbox_pt[2] + 5)
    else:
        cap_width = cap_x2 - cap_x0
        if cap_width > page_w * 0.6:
            fig_left_pt = max(30, cap_x0 - 10)
            fig_right_pt = min(page_w - 30, cap_x2 + 10)
        else:
            fig_left_pt = max(25, cap_x0 - 5)
            fig_right_pt = min(page_w - 25, cap_x2 + 5)

    return (fig_left_pt, fig_top_pt, fig_right_pt, fig_bottom_pt)


# ============================================================================
# Multi-page figure handling
# ============================================================================

def render_figure_multipage(doc, figure_info: dict, dpi: int = 600):
    """
    Render a figure that spans multiple pages.
    Concatenates pixmaps vertically.
    figure_info should have 'pages' list with {page, bbox_pt}.
    """
    from PIL import Image
    parts = []
    for seg in figure_info["pages"]:
        page = doc[seg["page"] - 1]
        clip = fitz.Rect(*seg["bbox_pt"])
        mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
        parts.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))

    if len(parts) == 1:
        return parts[0]

    # Vertical concat, align widths
    max_w = max(p.width for p in parts)
    total_h = sum(p.height for p in parts)
    canvas = Image.new("RGB", (max_w, total_h), "white")
    y = 0
    for p in parts:
        x_offset = (max_w - p.width) // 2
        canvas.paste(p, (x_offset, y))
        y += p.height
    return canvas


def render_figure_single(page, bbox_pt, dpi: int = 600):
    clip_rect = fitz.Rect(*bbox_pt)
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, clip=clip_rect, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


# ============================================================================
# Filename helpers
# ============================================================================

def safe_filename(s: str, max_len: int = 60) -> str:
    s = re.sub(r"[^A-Za-z0-9_\-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:max_len] or "figure"


def short_desc_from_caption(caption_text: str, pattern_re: re.Pattern) -> str:
    body = pattern_re.sub("", caption_text, count=1).strip()
    words = re.findall(r"[A-Za-z][A-Za-z0-9]*", body)
    return safe_filename("_".join(words[:6]))


# ============================================================================
# Main extraction with pages_analysis.json (v2)
# ============================================================================

def extract_with_analysis(
    pdf_path: str,
    outdir: str,
    pages_analysis: dict,
    dpi: int = 600,
):
    """
    Precise extraction guided by vision-generated pages_analysis.json.

    pages_analysis schema:
    {
      "layout_profile": {
        "caption_pattern": "^Fig\\.\\s+\\d+\\s*\\|",
        "caption_position": "below" | "above",
        "header_y_range_pt": [0, 50],
        "section_heading_regex": "^\\d+\\.\\d+\\s+[A-Z]",
        ...
      },
      "pages": [
        {
          "page": 2,
          "figures": [
            {
              "kind": "Figure",
              "num": 1,
              "rough_bbox_pct": [5, 45, 95, 95],   // [x0,y0,x1,y1] as % of page
              "caption_band_pct": [85, 95],         // [y_top,y_bot] as %
              "multi_page_of": null,                // or fig_id if continuation
              "fig_id": "fig_1"
            }
          ]
        }
      ]
    }
    """
    os.makedirs(outdir, exist_ok=True)
    profile = pages_analysis.get("layout_profile", {})

    # Compile regexes
    cap_pattern_str = profile.get("caption_pattern") or DEFAULT_CAPTION_REGEX.pattern
    try:
        caption_re = re.compile(cap_pattern_str, re.MULTILINE)
    except re.error:
        caption_re = DEFAULT_CAPTION_REGEX

    section_pattern_str = profile.get("section_heading_regex")
    if section_pattern_str:
        try:
            section_re = re.compile(section_pattern_str, re.MULTILINE)
        except re.error:
            section_re = DEFAULT_SECTION_HEADING_REGEX
    else:
        section_re = DEFAULT_SECTION_HEADING_REGEX

    header_y = tuple(profile.get("header_y_range_pt", [0, 60]))

    doc = fitz.open(pdf_path)

    # Collect all figures from pages_analysis, grouped by fig_id for multi-page
    figure_groups = {}  # fig_id -> list of segments
    for pg in pages_analysis.get("pages", []):
        for fig in pg.get("figures", []):
            fid = fig.get("fig_id") or f"{fig['kind']}_{fig['num']}"
            group = figure_groups.setdefault(fid, {
                "kind": fig["kind"],
                "num": fig["num"],
                "segments": [],
                "caption_text": "",
            })
            # Find caption bbox on this page
            page_obj = doc[pg["page"] - 1]
            page_w = page_obj.rect.width
            page_h = page_obj.rect.height

            rough_bbox_pct = fig.get("rough_bbox_pct", [5, 5, 95, 95])
            rough_bbox_pt = [
                rough_bbox_pct[0] / 100 * page_w,
                rough_bbox_pct[1] / 100 * page_h,
                rough_bbox_pct[2] / 100 * page_w,
                rough_bbox_pct[3] / 100 * page_h,
            ]

            cap_band_pct = fig.get("caption_band_pct")
            caption = None
            if cap_band_pct:
                cap_band_pt = (
                    cap_band_pct[0] / 100 * page_h,
                    cap_band_pct[1] / 100 * page_h,
                )
                caption = find_caption_in_band(
                    page_obj, cap_band_pt, caption_re,
                    expected_num=fig["num"]
                )

            # Per-figure caption_position overrides profile default
            cap_pos = fig.get("caption_position") or profile.get("caption_position", "below")

            if caption is None:
                # No caption on this page (continuation page). Use rough bbox directly.
                bbox_pt = tuple(rough_bbox_pt)
            elif cap_pos == "above":
                # Caption is above the figure body.
                # Crop from caption top down to rough_bbox bottom.
                cap_x0, cap_y0, cap_x2, cap_y1 = caption["bbox_pt"]
                fig_top = cap_y0  # include caption in crop
                fig_bot = rough_bbox_pt[3]  # rough bbox bottom (body end)
                fig_left = max(20, rough_bbox_pt[0] - 5)
                fig_right = min(page_w - 20, rough_bbox_pt[2] + 5)
                bbox_pt = (fig_left, fig_top, fig_right, fig_bot)
                if not group["caption_text"]:
                    group["caption_text"] = caption["text"]
            else:
                bbox_pt = determine_figure_bbox(
                    page_obj,
                    caption["bbox_pt"],
                    rough_bbox_pt=rough_bbox_pt,
                    header_y_range=header_y,
                    section_heading_re=section_re,
                )
                if not group["caption_text"]:
                    group["caption_text"] = caption["text"]

            group["segments"].append({
                "page": pg["page"],
                "bbox_pt": list(bbox_pt),
                "has_caption": caption is not None,
            })

    # Render each figure group
    report_rows = []
    saved_files = []

    for fid, grp in figure_groups.items():
        kind = grp["kind"]
        num = grp["num"]
        segments = sorted(grp["segments"], key=lambda s: s["page"])

        try:
            if len(segments) == 1:
                seg = segments[0]
                page = doc[seg["page"] - 1]
                img = render_figure_single(page, seg["bbox_pt"], dpi=dpi)
            else:
                img = render_figure_multipage(doc, {"pages": segments}, dpi=dpi)
        except Exception as e:
            print(f"[FAIL] {kind} {num}: {e}")
            continue

        desc = short_desc_from_caption(grp["caption_text"], caption_re) if grp["caption_text"] else "figure"
        fname = f"{kind}_{num}_{desc}.png"
        fpath = os.path.join(outdir, fname)
        img.save(fpath, "PNG", optimize=True)
        img.close()

        size_kb = Path(fpath).stat().st_size // 1024
        pages_str = ",".join(str(s["page"]) for s in segments)
        print(f"[OK] {fname} ({size_kb} KB) pages={pages_str} multi={len(segments) > 1}")

        saved_files.append(fpath)
        report_rows.append({
            "kind": kind,
            "num": num,
            "pages": [s["page"] for s in segments],
            "file": fname,
            "size_kb": size_kb,
            "multi_page": len(segments) > 1,
            "caption_snippet": grp["caption_text"][:200],
        })

    # Write report
    report_path = os.path.join(outdir, "extraction_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"# Figure Extraction Report (v2, vision-guided)\n\n")
        f.write(f"**Source:** `{os.path.basename(pdf_path)}`\n\n")
        f.write(f"**Render:** {dpi} DPI vector clip (PyMuPDF)\n\n")
        f.write(f"**Extracted:** {len(saved_files)} items\n\n")
        f.write(f"**Layout profile:**\n```json\n{json.dumps(profile, indent=2, ensure_ascii=False)}\n```\n\n")
        f.write("| # | Kind | Num | Pages | Multi | Size KB | Caption |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        for i, r in enumerate(report_rows, 1):
            f.write(
                f"| {i} | {r['kind']} | {r['num']} | {r['pages']} | "
                f"{r['multi_page']} | {r['size_kb']} | {r['caption_snippet'][:80]}... |\n"
            )

    # Also save the profile used
    with open(os.path.join(outdir, "profile_used.json"), "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)

    doc.close()
    return {"files": saved_files, "report": report_path, "count": len(saved_files)}


# ============================================================================
# Legacy v1 extraction (fallback when no vision analysis available)
# ============================================================================

def extract_legacy(
    pdf_path: str,
    outdir: str,
    dpi: int = 600,
    profile: dict = None,
    skip_pages: list = None,
):
    """v1 extraction — caption-anchored only, no vision."""
    skip_pages = skip_pages or []
    os.makedirs(outdir, exist_ok=True)
    profile = profile or {}

    header_y = tuple(profile.get("header_y_range_pt", [0, 60]))
    cap_pat = profile.get("caption_pattern") or DEFAULT_CAPTION_REGEX.pattern
    try:
        caption_re = re.compile(cap_pat, re.MULTILINE)
    except re.error:
        caption_re = DEFAULT_CAPTION_REGEX

    doc = fitz.open(pdf_path)
    all_captions = find_all_captions(doc, caption_re)
    figures = [c for c in all_captions if c["page"] not in skip_pages]

    seen = set()
    unique = []
    for f in figures:
        key = (f["kind"], f["num"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(f)

    saved = []
    for fig in unique:
        page = doc[fig["page"] - 1]
        bbox_pt = determine_figure_bbox(
            page, fig["caption_bbox_pt"],
            header_y_range=header_y,
        )
        try:
            img = render_figure_single(page, bbox_pt, dpi=dpi)
        except Exception as e:
            print(f"[FAIL legacy] {fig['kind']} {fig['num']}: {e}")
            continue
        desc = short_desc_from_caption(fig["caption_text"], caption_re)
        fname = f"{fig['kind']}_{fig['num']}_{desc}.png"
        fpath = os.path.join(outdir, fname)
        img.save(fpath, "PNG", optimize=True)
        img.close()
        saved.append(fpath)
        print(f"[OK legacy] {fname}")

    doc.close()
    return {"files": saved, "count": len(saved)}


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="PDF figure extractor v2")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("classify")
    p1.add_argument("pdf")
    p1.add_argument("--out", default=None)

    p2 = sub.add_parser("render-pages")
    p2.add_argument("pdf")
    p2.add_argument("--dpi", type=int, default=150)
    p2.add_argument("--tmp-dir", default=None)
    p2.add_argument("--out", default=None, help="Write pages index JSON here")

    p3 = sub.add_parser("extract")
    p3.add_argument("pdf")
    p3.add_argument("--outdir", required=True)
    p3.add_argument("--dpi", type=int, default=600)
    p3.add_argument("--pages-analysis", default=None,
                    help="pages_analysis.json from vision profiling (v2 mode)")
    p3.add_argument("--profile", default=None, help="Legacy profile JSON (v1 mode)")
    p3.add_argument("--skip-pages", default="")

    p4 = sub.add_parser("clean")
    p4.add_argument("pdf")

    args = parser.parse_args()

    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    if args.cmd == "classify":
        data = classify_pages(args.pdf)
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"Wrote {args.out} ({len(data)} pages)")
        else:
            print(json.dumps(data, indent=2, ensure_ascii=False))

    elif args.cmd == "render-pages":
        tmp_dir = Path(args.tmp_dir) if args.tmp_dir else None
        result = render_all_pages(args.pdf, dpi=args.dpi, tmp_dir=tmp_dir)
        out_path = args.out or os.path.join(result["tmp_dir"], "pages_index.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Rendered {result['page_count']} pages to {result['tmp_dir']}")
        print(f"Index: {out_path}")

    elif args.cmd == "extract":
        if args.pages_analysis:
            with open(args.pages_analysis, "r", encoding="utf-8") as f:
                pa = json.load(f)
            result = extract_with_analysis(args.pdf, args.outdir, pa, dpi=args.dpi)
        else:
            profile = None
            if args.profile and os.path.exists(args.profile):
                with open(args.profile, "r", encoding="utf-8") as f:
                    profile = json.load(f)
            skip = [int(x) for x in args.skip_pages.split(",") if x.strip().isdigit()]
            result = extract_legacy(args.pdf, args.outdir, dpi=args.dpi,
                                    profile=profile, skip_pages=skip)
        print(f"\nDone: {result['count']} files")

    elif args.cmd == "clean":
        tmp = temp_dir_for_pdf(args.pdf)
        if tmp.exists():
            shutil.rmtree(tmp)
            print(f"Removed {tmp}")
        else:
            print(f"No temp dir for {args.pdf}")


if __name__ == "__main__":
    main()
