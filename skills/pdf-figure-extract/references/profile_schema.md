# Profile schema

The registry at `data/profiles.json` holds all layout profiles. Top-level structure:

```json
{
  "version": "1.0",
  "last_updated": "YYYY-MM-DD",
  "profiles": {
    "profile_name_1": { ... },
    "profile_name_2": { ... }
  }
}
```

## Profile fields

| Field | Type | Purpose |
|---|---|---|
| `name` | string | Stable identifier (matches the key in `profiles`) |
| `display_name` | string | Human-readable label |
| `match` | object | Rules to decide whether this profile applies to a PDF fingerprint |
| `layout` | object | Layout parameters used during extraction |
| `caption_pattern` | string (regex) | Matches caption lines (e.g. `^(Figure\|Scheme)\\s+\\d+\\.`) |
| `figure_placement_hints` | array | Free-form hints (informational) |
| `article_starts_at_page` | int (optional) | 1-based page where real content begins (skip cover/TOC) |
| `cover_pages` | array (optional) | Explicit cover page numbers to skip |
| `toc_pages_max` | int (optional) | Max page number containing TOC content |
| `stats` | object | Runtime statistics |
| `notes` | string | Free-form notes for humans |

## `match` rules

Rules are scored; the highest-scoring profile wins with confidence = `passed_weight / total_weight`. Confidence ≥ 0.8 triggers automatic reuse; 0.4–0.8 triggers partial reuse with vision verification; < 0.4 falls back to fresh profiling.

| Rule | Weight | Meaning |
|---|---|---|
| `metadata_producer_regex` | 3.0 | List of regexes matched against PDF producer/creator metadata |
| `header_text_contains` | 2.0 | List of substrings that should appear in page 1 text |
| `page_size_pt` | 1.0 | Expected `[width, height]` in points (tolerance ±5 pt) |
| `language` | 1.0 | `en`, `ko`, or `unknown` |

## `layout` fields

| Field | Type | Used by |
|---|---|---|
| `header_y_range_pt` | `[y_min, y_max]` | Caption anchor top boundary — ignores URL headers in this band |
| `footer_y_range_pt` | `[y_min, y_max]` | Page number / copyright band (currently informational) |
| `column_layout` | `"single_column"` \| `"two_column"` \| `"auto_detect"` | Affects left/right bbox inference |
| `column_split_x_pt` | float | X coordinate separating columns (two-column only) |
| `content_margins_pt` | `{left, right, top, bottom}` | Content area of the page |

## `stats` fields

| Field | Type | Purpose |
|---|---|---|
| `encountered_count` | int | How many PDFs matched this profile |
| `last_seen` | date | ISO date of last match |
| `success_rate` | float [0, 1] | Exponential moving average; 0.3 weight on newest outcome |
| `user_corrections` | int | Number of manual fixes applied; 3+ triggers auto-refinement |

## Adding a new profile manually

1. Copy an existing similar profile from `data/profiles.json`
2. Change `name`, `display_name`, `notes`
3. Update `match` rules to uniquely identify the new document type
4. Tune `layout.header_y_range_pt` using the PDF's actual header position — look at the first page, measure where the journal banner ends
5. Set `caption_pattern` to match that journal's caption format (common variants: `Figure N.`, `Fig. N`, `FIG. N.`, `Figure N |`, `그림 N`)
6. Leave `stats` with zeros and null `last_seen`; these get filled in on first use

Test by running `profile.py fingerprint <pdf> --match` — your new profile should match with confidence ≥ 0.8 on a representative PDF.
