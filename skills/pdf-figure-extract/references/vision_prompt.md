# Vision Profiling Prompt Template

When running pdf-figure-extract v2, the subagent must analyze every rendered page and produce a `pages_analysis.json` file. This document defines what the subagent should extract from each page.

## Context

You will receive a temp directory containing page images (`page_001.png`, `page_002.png`, ...) rendered at 150 DPI from a single PDF. Your job is to produce one JSON that:

1. Infers the paper's **layout profile** (caption format, column layout, header region, section heading style)
2. For each page, identifies all **figures, schemes, and tables** present, with rough bounding boxes

The downstream script (`extract.py extract --pages-analysis`) uses this JSON to do precise caption-anchored extraction at 600 DPI. Your bboxes do not need to be pixel-perfect — they just need to be close enough that the caption detector can lock on.

## Output schema

```json
{
  "pdf_name": "original_filename.pdf",
  "page_count": 7,
  "layout_profile": {
    "caption_pattern": "^Fig\\.\\s+\\d+\\s*\\|",
    "caption_position": "below",
    "column_layout": "two_column",
    "column_split_x_pt": 297,
    "header_y_range_pt": [0, 50],
    "section_heading_regex": "^(\\d+\\.\\d+\\s+[A-Z]|Results|Methods|Discussion)",
    "multi_page_possible": true,
    "notes": "Nature Energy full-article layout with bold pipe captions"
  },
  "pages": [
    {
      "page": 1,
      "page_type": "title",
      "figures": []
    },
    {
      "page": 2,
      "page_type": "content",
      "figures": [
        {
          "fig_id": "fig_1",
          "kind": "Figure",
          "num": 1,
          "rough_bbox_pct": [5, 10, 95, 50],
          "caption_band_pct": [50, 62],
          "multi_page_of": null,
          "confidence": 0.95
        }
      ]
    },
    {
      "page": 3,
      "page_type": "content",
      "figures": [
        {
          "fig_id": "fig_2_part1",
          "kind": "Figure",
          "num": 2,
          "rough_bbox_pct": [5, 10, 95, 100],
          "caption_band_pct": null,
          "multi_page_of": null,
          "continues_on_next_page": true,
          "confidence": 0.90
        }
      ]
    },
    {
      "page": 4,
      "page_type": "content",
      "figures": [
        {
          "fig_id": "fig_2_part2",
          "kind": "Figure",
          "num": 2,
          "rough_bbox_pct": [5, 0, 95, 50],
          "caption_band_pct": [50, 62],
          "multi_page_of": "fig_2_part1",
          "confidence": 0.90
        }
      ]
    }
  ]
}
```

## Field definitions

### `layout_profile`

| Field | What to set |
|---|---|
| `caption_pattern` | Regex matching this paper's caption starts. Escape properly for JSON. Observe the actual caption on page 2-3 and transcribe its format. Common patterns:<br>- `^Figure\\s+\\d+\\.` (ACS, Wiley)<br>- `^Fig\\.\\s+\\d+\\s*\\|` (Nature family)<br>- `^Fig\\.\\s+\\d+\\.` (Elsevier)<br>- `^그림\\s*\\d+\\.` (Korean)<br>- `^Figure\\s+\\d+\\s*\\\|` (some Springer) |
| `caption_position` | `"below"` or `"above"` — where the caption sits relative to the figure body |
| `column_layout` | `"single_column"`, `"two_column"`, `"three_column"`, or `"magazine_variable"` |
| `column_split_x_pt` | If two-column, approximate x-coordinate (in PDF points) where the gutter is. A4 is usually ~297, Letter ~306. |
| `header_y_range_pt` | `[y_min, y_max]` — vertical band where the journal banner/URL header lives. If no header, use `[0, 30]`. |
| `section_heading_regex` | Regex matching this paper's section titles (so extract.py can exclude them from "body text above figure" detection). Examples: `^\\d+\\.\\d+\\s+[A-Z]`, `^(Results\|Methods\|Discussion)$` |
| `multi_page_possible` | Boolean — did you see any figure where the body and caption are on different pages? |
| `notes` | Free-form string, journal name or anything else useful |

### Per-page `figures[]`

| Field | What to set |
|---|---|
| `fig_id` | Unique within the document. For multi-page figures, use `fig_2_part1`, `fig_2_part2`. For simple figures, use `fig_1`, `scheme_1`, `table_2`. |
| `kind` | `"Figure"`, `"Scheme"`, or `"Table"` |
| `num` | Integer. For a figure that spans pages, use the same num on both parts. |
| `rough_bbox_pct` | `[x0, y0, x1, y1]` as percentages of page (0-100). Include the whole figure + any panel labels, but NOT the caption itself (caption_band handles that). |
| `caption_band_pct` | `[y_top, y_bot]` where the caption lives, as % of page height. `null` if this page has no caption (continuation page). |
| `multi_page_of` | `null` if self-contained. Otherwise the `fig_id` of the preceding part. |
| `continues_on_next_page` | True if the figure body continues on the next page. Helps chain multi-page figures. |
| `confidence` | Your confidence 0-1. Below 0.6 means "unsure, human should review". |

### `page_type`

- `"title"` — title/cover/abstract page, usually no figures
- `"toc"` — table of contents
- `"content"` — main content, may have figures
- `"blank"` — completely empty
- `"reference"` — references list, no figures
- `"ad"` — advertisement or news-and-views filler
- `"appendix"` — supplementary

## Detection rules

**What counts as a figure:**
- Anything with a caption of the form matching `caption_pattern` and visible graphic content (plot, diagram, photo, SEM, scheme, chart)
- A figure without a visible caption on this page but clearly a continuation of a figure whose caption is on the next page → mark as `continues_on_next_page=True`, `caption_band_pct=null`

**What does NOT count:**
- Journal logos, banner images, portrait photos of authors, institutional seals
- Tables of numbers without a caption prefix like `Table N.`
- Decorative separators, social-media icons
- Ads or sponsor blocks

**Common pitfalls to avoid:**
- A bold text block that reads `Figure 2 | Title of figure. A, description. B, ...` is a **caption**, not a figure body. Do not set `rough_bbox_pct` to cover only this caption — the actual figure body is above or below it.
- If a page is ONLY a caption with no graphic (because the figure body is on the next/previous page), record the caption in `caption_band_pct` and let `rough_bbox_pct` be `null` or `[0, 0, 0, 0]`.
- Section heading `2.3 Electrochemical performance` looks like a caption but is NOT. Distinguish by style: section headings are usually shorter, bold, and sit at the top of a text column, while captions are below or above figures.

## Example scenarios

### Scenario A: Wiley Advanced Materials (clean case)
- `caption_pattern`: `^Figure\\s+\\d+\\.`
- Each figure is fully on one page, caption below at ~y=85-95%
- `multi_page_possible`: false
- Clean and easy — this is what Chen 2018 looks like.

### Scenario B: Nature Energy (the hard case v1 failed on)
- `caption_pattern`: `^Fig\\.\\s+\\d+\\s*\\|` (note the pipe character after the number)
- Figures often span full page width and sometimes span two pages
- Caption is bold, starts with `Fig. 1 | ` then continues with sentence-case description
- `multi_page_possible`: true
- Vision must identify the figure body carefully to distinguish it from the large bold caption block

### Scenario C: Korean journal magazine (E_Chem 15(2))
- `caption_pattern`: `^그림\\s*\\d+\\.` or similar
- Two-column layout but figures may float across columns
- Captions may appear in different column than figure body
- `multi_page_possible`: true
- Confidence should be lower (0.6-0.8) since layout is unpredictable

### Scenario D: Reviewer manuscript (EST-D, Word document style)
- `caption_pattern`: `^Figure\\s+\\d+\\.`
- `section_heading_regex`: `^\\d+\\.\\d+\\s+[A-Z]` (important — the `3.2 Electrochemical performance` style headings kept bleeding into figure crops in v1)
- Single column usually
- Each figure on its own page, caption below

## Workflow

1. Read `page_001.png` — identify: what journal? what layout? what caption format?
2. Read `page_002.png` and later — refine the `layout_profile` as more evidence accumulates
3. Catalog every figure/scheme/table you see across all pages
4. Chain multi-page figures by setting `multi_page_of` + `continues_on_next_page`
5. Write the final JSON to the requested path

## Output

Write the JSON to the path specified by the parent agent (usually inside the temp directory). Do NOT include page renderings in the JSON — only metadata. Keep the final JSON under 50 KB even for long papers.
