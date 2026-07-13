---
name: pdf-figure-extract
description: >-
  Extract figures, schemes, and tables from academic journal PDFs as
  high-quality PNG files using vision-first page analysis plus caption-anchored
  600 DPI vector rendering. Validated on Wiley, Nature family, ACS, Elsevier,
  Science (AAAS), Joule, and similar single/two/three-column journal layouts
  (90-100% PASS). The vision-first approach means every PDF gets analyzed by
  vision upfront to learn its specific caption format, column layout, section
  heading style, and multi-page figure handling, so the skill adapts to the
  document. Not recommended for magazine-style publications with variable
  per-article layouts, scanned PDFs without a text layer (needs OCR), or
  government reports with heavy front matter. Produces publication-grade output
  along with an extraction report and the layout profile used.
  TRIGGER: the user wants to pull images out of peer-reviewed papers, preprints,
  or SI/Supplementary PDFs — keywords include "figure 추출", "그림 뽑아줘",
  "scheme 추출", "논문 figure", "PDF에서 이미지만", "extract figures from paper",
  "pull schemes out of PDF".
---

# PDF Figure Extractor (v2, vision-first)

Extract figures/schemes/tables from PDF documents with high quality across diverse journal layouts. The skill first uses Fable 5 vision to analyze every page of the target PDF, building a document-specific layout profile, then does deterministic caption-anchored extraction at 600 DPI vector clip quality.

## Why vision-first

Earlier versions (v1) used pre-baked profiles in a registry and tried to match incoming PDFs by fingerprint. This worked for Wiley Advanced Materials but failed catastrophically on Nature Energy (caption format was `Fig. 1 |` not `Figure 1.`), on magazine layouts (columns varied per page), on reviewer manuscripts (section headings bled into figure crops), and on multi-page figures (body on page N, caption on page N+1).

The root cause: every PDF has small but important layout quirks, and pre-built profiles cannot anticipate them. v2 flips the approach — spend one vision pass upfront to learn the paper's idiosyncrasies, then use that knowledge for precise extraction. This costs ~$0.30-0.60 per paper in vision tokens but raises PASS rate from ~50% to an expected 85%+ across heterogeneous corpora.

## Workflow

The skill runs five phases per PDF. Most of the work belongs in a subagent since Phase 2 requires vision Read calls on page images.

All bundled scripts live under the plugin root. Set this once so every command
below resolves to the packaged script regardless of the current directory:

```bash
SKILL_DIR="${CLAUDE_PLUGIN_ROOT}/skills/pdf-figure-extract"
```

### Phase 0: Preparation

Classify every page cheaply and render all pages at 150 DPI to a temp directory:

```bash
python "$SKILL_DIR/scripts/extract.py" classify "<pdf>" --out classification.json
python "$SKILL_DIR/scripts/extract.py" render-pages "<pdf>" --dpi 150
```

`render-pages` creates `_temp_pages/<pdf-stem>_<hash>/page_001.png ... page_NNN.png` and a `pages_index.json` listing them. For long documents (>30 pages), consider restricting rendering to pages flagged by classify as `has_figure_caption` or having images/drawings.

### Phase 1: Vision page analysis (the core step)

A subagent reads the page images and produces `pages_analysis.json` with the layout profile and per-page figure map. The full prompt for this step lives in `references/vision_prompt.md` — read that file before running the vision analysis to see the exact schema and detection rules.

The subagent should:
1. Read `page_001.png` first to identify the journal style and caption format
2. Read subsequent pages, cataloging every Figure/Scheme/Table with rough bbox percentages
3. Chain multi-page figures using `multi_page_of` and `continues_on_next_page`
4. Identify section headings specific to this paper (e.g. `2.3 Results`) so the extractor can exclude them
5. Output a single `pages_analysis.json` conforming to the v2 schema

See `references/vision_prompt.md` for the JSON schema and detection rules. Accuracy of this step determines overall quality — if the caption_pattern is wrong, everything downstream fails.

### Phase 2: Precise extraction

```bash
python "$SKILL_DIR/scripts/extract.py" extract "<pdf>" \
  --outdir "<output>" \
  --pages-analysis pages_analysis.json \
  --dpi 600
```

This reads the vision analysis, and for each figure it:
- Uses `rough_bbox_pct` as spatial prior
- Locates the caption in the specified `caption_band_pct` using the paper's `caption_pattern` regex
- Refines the bounding box by looking for body text blocks above the caption, skipping section headings (via `section_heading_regex`) and header URL bars
- Renders with `page.get_pixmap(matrix, clip=bbox, alpha=False)` at 600 DPI — vector content stays crisp, embedded rasters render at native resolution
- For multi-page figures, renders each segment and concatenates vertically

Output: one PNG per figure named `{Kind}_{Num}_{short_desc}.png`, plus `extraction_report.md` and `profile_used.json`.

### Phase 3: Cleanup

```bash
python "$SKILL_DIR/scripts/extract.py" clean "<pdf>"
```

Removes the `_temp_pages/<pdf-stem>_<hash>/` directory. Do not skip this — 150 DPI page renders add up for long docs.

### Phase 4: Registry update (optional)

If the paper's layout looks stable and commonly encountered, save the generated profile:

```bash
python "$SKILL_DIR/scripts/profile.py" save <(echo '{"name":"<journal_name>_auto", ...}')
```

The registry at `$SKILL_DIR/data/profiles.json` is now used as a fingerprint-based fast path only — `python "$SKILL_DIR/scripts/profile.py" fingerprint <pdf> --match` can pre-check whether a PDF matches an existing profile with confidence ≥ 0.85, in which case Phase 1 (vision analysis) can be skipped. This makes repeat processing of the same journal fast.

## When to skip vision

Vision analysis costs ~$0.30-0.60 per paper. Skip it when:

- A fingerprint match with confidence ≥ 0.85 already exists in the registry (fast path)
- The user specifies `--legacy` mode for a well-known easy case like Wiley AM
- Batch-processing a homogeneous corpus where the first paper's profile can be reused for the rest

Do NOT skip vision for: Nature family journals, magazines, reviewer manuscripts, multi-page figures, unknown journals, any corpus where you do not have a validated profile.

## Subagent delegation (required for vision)

Phase 1 requires vision calls, so run the whole pipeline inside a subagent:

```
Agent(
  subagent_type="general-purpose",
  prompt="""
  Run pdf-figure-extract v2 on <pdf_path>, with
  SKILL_DIR="${CLAUDE_PLUGIN_ROOT}/skills/pdf-figure-extract":
  1. python "$SKILL_DIR/scripts/extract.py" classify + render-pages
  2. Read each page_NNN.png in _temp_pages/..., produce pages_analysis.json
     following the schema in references/vision_prompt.md
  3. python "$SKILL_DIR/scripts/extract.py" extract --pages-analysis pages_analysis.json
  4. python "$SKILL_DIR/scripts/extract.py" clean
  Return summary with figure count, any failures, profile generated.
  """
)
```

For batches of 5+ PDFs, spawn one subagent per PDF — they run independently and each handles vision for its own document. This is the intended usage pattern.

## Output contract

Per successful PDF in `<outdir>`:
- `Figure_N_{desc}.png` (600 DPI, often 4000-5000 px wide)
- `Scheme_N_{desc}.png`, `Table_N_{desc}.png` when present
- `extraction_report.md` — per-figure bbox, pages spanned, caption snippet, multi-page flag
- `profile_used.json` — the layout profile (generated or loaded) for reproducibility

Filenames are ASCII-safe (underscores only) so Obsidian `![[...]]` embeds work without escaping.

## Cost and timing expectations

- **Typical paper (5-15 pages)**: ~$0.30-0.60 in vision tokens, 1-3 minutes per PDF
- **Short Nature paper (3-5 pages)**: ~$0.10-0.20, 30-90 seconds
- **Long document (50+ pages, dissertation)**: ~$1-3, 5-10 minutes (with Tier 1 page filtering)
- **Batch of 10 papers, parallel subagents**: ~$3-6 total, 5-15 minutes wall clock

Registry fast-path eliminates vision cost for repeat journals after the first successful profile is saved.

## Scope and validated quality

**In scope (high quality, 90-100% PASS verified)**:
- Wiley Advanced Materials / Angewandte / etc. (two-column)
- Nature family (Nature Energy, Nature etc. — `Fig. N |` pipe captions, multi-page figures)
- ACS journals (JACS, JCTC, Chem. Mater., ES&T) — `Figure N.` captions
- Elsevier ScienceDirect (Nano Energy, Joule via Cell Press)
- Science/AAAS (3-column with side-caption layout)
- arXiv preprints (single-column)
- SI/Supplementary PDFs from the above

**Out of scope (low quality expected, ~30-50% PASS)**:
- Magazine-style publications with per-article variable layouts (e.g. 대한전기화학회 잡지, trade magazines). rough_bbox detection struggles when body text tightly wraps figures with varying column counts per page.
- Korean government R&D reports with extensive front matter. Phase 1 classify can skip cover/TOC but article boundaries may need manual skip-pages.
- Scanned PDFs without text layer. Caption detection fails. OCR integration (pytesseract) is a future extension.
- Dissertations with heavy appendix figures that span pages in non-standard ways.

For out-of-scope documents, expect partial success — most captured figures are usable but may include some body-text intrusion at top. Manual review/re-crop is recommended.

## Failure modes

- **Scanned PDF with no text layer**: caption detection fails. OCR integration (pytesseract) is a future extension, not currently included.
- **Caption format unseen**: vision usually handles this — describe what it sees and write the regex correctly. If vision also fails, the paper may have non-standard captions (e.g. `Image 1:` instead of `Figure 1.`); update the paper's `pages_analysis.json` manually and re-run Phase 2.
- **Multi-page figure with no visual continuation cue**: vision must guess based on caption being on a page with no graphic. The `continues_on_next_page` flag and `multi_page_of` chain handle this once detected.
- **Corrupt or encrypted PDF**: PyMuPDF raises on open. Decrypt first with `qpdf --decrypt` if needed.

See `references/troubleshooting.md` for more cases.

## Dependencies

- Python 3.10+
- PyMuPDF (`pip install PyMuPDF`)
- Pillow (`pip install Pillow`)

Vision calls use Claude's in-session Read tool — no API key needed when running inside Claude Code.

## Files in this skill

- `SKILL.md` — this file
- `scripts/extract.py` — all PyMuPDF/PIL work (classify, render-pages, extract, clean)
- `scripts/profile.py` — fingerprint, registry, atomic profile save
- `scripts/batch.py` — local batch runner (registry-only, no vision; legacy use)
- `data/profiles.json` — profile registry (seeded with Wiley AM and a few others)
- `references/vision_prompt.md` — schema and detection rules for Phase 1 vision analysis
- `references/architecture.md` — design rationale
- `references/profile_schema.md` — profile JSON schema
- `references/troubleshooting.md` — known failure modes and fixes
