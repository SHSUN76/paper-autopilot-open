# Troubleshooting

## Journal header/banner showing up at top of Figure 1

Cause: the profile's `header_y_range_pt` is too narrow — the URL banner at the top of the page extends below the configured range.

Fix: open the PDF, measure the header end position (usually 45-65 pt from top), update `header_y_range_pt` in the profile. If the profile did not match and `unknown_fallback` was used, that fallback already uses a conservative 85 pt top band; consider whether the PDF needs its own profile.

## Cover page extracted as "Figure 1"

Cause: the cover page contains a figure caption pattern like `그림 1` in Korean reports, but it is actually decorative artwork.

Fix: set `cover_pages: [1]` or `article_starts_at_page: N` in the profile. The extraction script will filter captions on those pages when `--skip-pages 1,2,3,4` is passed (or the profile's values are honored automatically in a future version).

## Multi-panel figure (a-h) only captures a few panels

Cause: text blocks between panels (like panel labels `a`, `b`, `c`) were classified as body text by the top-boundary detector, causing the figure region to get cropped too tightly.

Fix: the current code ignores single-character text blocks, but tight panel labels like `(a)` with punctuation may slip through. If you see this, examine the block text in the transcript; add the pattern to the body-block skip rule in `extract.py::determine_figure_bbox`.

## Axis label or caption cut off at bottom

Cause: `include_caption=True` but the caption's bbox doesn't extend to the true end of the caption (multi-line captions sometimes have the last line as a separate block).

Fix: extend the bottom bound by a few points: tune `top_padding_pt` or adjust caption detection to merge adjacent caption blocks before computing `caption_y1`.

## Same figure extracted twice

Cause: two blocks on the same page start with a caption-matching pattern — common when a figure is referenced in body text as "Figure 1 shows..." and that sentence starts its own block.

The code already deduplicates by `(kind, num)` keeping the first occurrence. If the wrong one wins (e.g., the body reference is listed before the real caption), sort candidates by bbox y1 ascending (caption usually sits below the figure on a page).

## PyMuPDF cannot open the PDF (encrypted or corrupt)

`fitz.open()` raises an exception. The script exits with the error. For password-protected PDFs, modify `fingerprint()` and `extract()` to accept `password=...` and pass it through. For truly corrupt PDFs, try `qpdf --decrypt --password= <input> <output>` to repair first.

## Vision verification says "body text intrusion" but caption-anchored says OK

The two layers sometimes disagree on small margins. Caption-anchored is more trustworthy for precise coordinates, but vision can catch cases where the PDF has text floating over an image (watermarks, annotation layers). Inspect the PNG directly — if the text is actually there in the output, extend `top_padding_pt` slightly negative or bump `header_y_range_pt[1]`.

## Korean caption regex not matching

The `caption_pattern` in the Korean profile is `^(그림|표|도표)\s*\d+[\.:\s]`. If your Korean report uses `[그림 N]` (bracket-wrapped) instead, change the pattern to `^\[?(그림|표|도표)\s*\d+\]?`. Test with `python -c "import re; print(re.match(r'<pattern>', '그림 3. 제목'))"`.

## Everything works but files have weird names

Filename generation uses `short_desc_from_caption()` which ASCII-safes the caption words. If the caption is non-English, the result may be empty, leading to `Figure_3_figure.png`. Acceptable; consider adding a Korean-safe version if you need readable Hangul filenames.

## Scheme or Table missed

The regex supports `Scheme` and `Table` (and `그림`/`표`/`도표`). If a paper uses `Chart N` or `Equation N` or `Box N`, extend `CAPTION_REGEX` in `extract.py` — add the new kind there and to the normalization map right below.

## Extraction works but verification step takes a long time

Vision verification reads every extracted PNG. For papers with 8-10 figures at 600 DPI, each PNG is 1-5 MB. Consider downscaling for verification (600 → 200 DPI), or running verification only on a random sample of 2-3 figures per paper when doing batch runs.
