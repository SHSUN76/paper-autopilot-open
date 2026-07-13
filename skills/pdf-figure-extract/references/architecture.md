# Architecture notes

## Why caption-anchored extraction works

PDF text has exact coordinates. When PyMuPDF parses a page with `page.get_text("dict")`, every text block reports its bbox in PDF points. A caption like `Figure 3.` is a text block — once you find it, you have a pixel-precise anchor for where the figure ends vertically. The figure's other boundaries are:

- **Top**: the bottom of the nearest body-text block above (or a conservative fallback above the header region)
- **Left/right**: inferred from the caption's x-extent — a caption wider than 60% of the page points to a 2-column full-width figure; narrower points to single-column

This gives bboxes that are deterministic (same result every run), require no vision calls, and are pixel-accurate. Earlier iterations used vision to guess bbox coordinates; that approach had ±50-100 px errors because vision models do not output pixel-precise coordinates reliably.

## Why A+B hybrid rendering beats whole-page raster

Option A was the original approach: render every page at 200 DPI, crop with PIL. This has three problems:
1. Whole-page render at high DPI wastes memory for regions we throw away
2. 200 DPI is insufficient for the vector content inside figures (plot axes become blurry)
3. Upgrading to 400-600 DPI whole-page makes files huge (~30 MB per page at 600 DPI)

Option B is the fix: once you know the figure bbox in PDF points, call `page.get_pixmap(matrix, clip=bbox, alpha=False)` with a matrix scaled to 600 DPI. PyMuPDF renders only that region directly from PDF vector data, so:
- Text and plot lines are crisp (vector)
- Embedded SEM/photo rasters render at their native resolution (no upsampling blur)
- Memory and disk stay reasonable (~0.5-10 MB per figure)

## Two-tier scanning

Tier 1 is a free PyMuPDF scan over every page. It classifies each page's content type using cheap heuristics — text length, image count, drawing object count, presence of caption regexes, presence of cover/TOC keywords. This finishes in milliseconds for a 100-page document.

Tier 2 is vision profiling, fired only when no profile matches the fingerprint. Render 1-3 representative pages (one near the front to capture header/footer, one figure-bearing page) at 150 DPI and read them. The main thing vision contributes is style profiling: header y-range, column split, figure placement conventions — things that are hard to extract from text alone but cheap to recognize visually.

Vision never outputs pixel coordinates for actual figure bboxes. That is caption-anchored detection's job. Vision is just for layout *style* recognition.

## Progressive profile memorization

Every PDF that goes through the pipeline contributes to the profile registry:

- **First encounter** with a journal: full Tier 1 + Tier 2 scan, new profile generated, saved to registry
- **Second encounter**: fingerprint match, skip Tier 2, go straight to extraction using the saved profile
- **On extraction failure**: verification catches it, profile's `user_corrections` counter increments, after 3 corrections the profile is updated automatically
- **success_rate** tracks a moving average so badly-maintained profiles eventually fail the confidence threshold

The registry is a single JSON file — easy to inspect, edit, or seed. Anyone can hand-write a profile for a niche journal by copying an existing one and tweaking the `match` rules and `layout` values.

## Subagent isolation

Running the pipeline inside a subagent serves two purposes:

1. **Context hygiene**: Tier 2 profiling renders pages to a temp directory. If that happens in main context, the image tokens stay around. In a subagent, the temp files get cleaned up and only the final profile JSON + file list return to main.
2. **Parallelism**: Multiple PDFs can be processed simultaneously by spawning a subagent per PDF. The registry file is the synchronization point; if two subagents both discover a new journal layout, the later one wins (last-write).

For batches of 10+ PDFs, dispatch as a group of parallel subagents, each with its own output directory. After the batch completes, run `profile.py list` to see what got learned.
