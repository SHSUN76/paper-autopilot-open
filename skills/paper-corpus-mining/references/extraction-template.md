# Extraction Template — Stage 1 Schema

Each paper produces one JSON file conforming to this schema. Save as `<workspace>/reports/<paper-id>.json`. The `<paper-id>` should be a stable identifier — first author surname + year + first noun of title is a reliable choice (e.g., `kim2024nca`).

## Schema

```json
{
  "paper_id": "string — stable identifier",
  "source_file": "string — original PDF/MD path",
  "extracted_at": "ISO 8601 timestamp",
  "extractor_model": "string — fable / sonnet",
  "confidence_notes": ["any uncertain extractions logged here"],

  "metadata": {
    "title": "string",
    "authors": ["array of strings"],
    "first_author": "string",
    "corresponding_author": "string or null",
    "journal": "string — full name",
    "journal_short": "string — standard abbreviation (e.g., J. Power Sources)",
    "year": 0,
    "doi": "string or null",
    "open_access": true,
    "page_count": 0,
    "word_count_estimate": 0
  },

  "structure": {
    "sections": ["array of section names in order"],
    "section_order_signature": "string — single-letter code (e.g., 'I-M-R-D' for Intro-Method-Results-Discussion)",
    "has_abstract": true,
    "has_graphical_abstract": false,
    "has_supplementary": false,
    "section_word_counts": {
      "Abstract": 250,
      "Introduction": 800,
      "Methods": 1200,
      "Results": 2400,
      "Discussion": 600,
      "Conclusion": 400
    },
    "subsection_pattern": "string — describe how sub-headings are organized (e.g., 'Method has 3 numbered subsections: Synthesis / Characterization / Electrochemical Testing')"
  },

  "lexicon": {
    "acronyms": [
      {
        "abbr": "NCM811",
        "expansion": "LiNi0.8Co0.1Mn0.1O2",
        "first_use_section": "Introduction",
        "is_defined_at_first_use": true
      }
    ],
    "units": [
      {"unit": "mAh/g", "context": "specific capacity"},
      {"unit": "Wh/kg", "context": "energy density"},
      {"unit": "Ω·cm²", "context": "area-specific resistance"}
    ],
    "chemical_formulas": ["LiNi0.8Mn0.1Co0.1O2", "Li2CO3"],
    "method_names": [
      {"name": "Galvanostatic cycling", "first_use_section": "Methods", "cited": false}
    ],
    "instrument_names": [
      {"name": "Bruker D8 Advance", "purpose": "XRD", "cited_with_manufacturer": true}
    ]
  },

  "figures": {
    "count": 0,
    "types": [
      {
        "id": "Fig 1",
        "kind": "schematic|XRD|SEM|TEM|EIS|cycling|CV|GITT|Nyquist|histogram|table|other",
        "subfigure_count": 4,
        "caption_length_words": 87,
        "caption_includes_scale_bar": true,
        "caption_includes_conditions": true,
        "caption_first_sentence": "string — verbatim first sentence",
        "interpreted_in_text": true
      }
    ],
    "table_count": 0
  },

  "captions": {
    "median_length_words": 75,
    "always_includes": ["array of elements found in ≥80% of captions, e.g., 'units', 'experimental conditions', 'sample names'"],
    "sometimes_includes": ["array, 30-80% of captions"],
    "rarely_includes": ["array, <30% of captions"],
    "exemplar_caption_id": "Fig 3",
    "exemplar_caption_full_text": "string — paste the best example for downstream use"
  },

  "citations": {
    "total_count": 78,
    "density_per_1k_words": 12.4,
    "first_use_compliance": {
      "named_methods_cited_at_first_use_pct": 95,
      "named_datasets_cited_at_first_use_pct": 100,
      "named_materials_cited_at_first_use_pct": 80
    },
    "style": "Vancouver|Harvard|ACS|Elsevier-numbered|inline-author-year",
    "uses_doi": true,
    "uses_arxiv_only": false
  },

  "voice_samples": {
    "intro_first_paragraph": "string — verbatim opening paragraph of Introduction",
    "intro_last_paragraph": "string — verbatim final paragraph of Introduction (often contains 'In this work...')",
    "method_voice": "active_we|passive|mixed",
    "method_voice_evidence": "string — one sample sentence",
    "results_voice": "active_we|passive|mixed",
    "discussion_voice": "active_we|passive|mixed",
    "conclusion_last_paragraph": "string — verbatim final paragraph of Conclusion",
    "tense_pattern": "string — describe (e.g., 'Methods: past simple. Results: present + past mixed. Discussion: present.')"
  },

  "ai_tell_candidates": [
    {
      "phrase": "remarkable performance",
      "section": "Abstract",
      "context": "string — sentence containing the phrase",
      "rationale": "string — why this is suspicious (overuse, vagueness, etc.)"
    }
  ],

  "domain_signals": {
    "primary_topic_keywords": ["array of 5-10 keywords identifying the domain"],
    "subdomain": "string — e.g., 'Li-ion cathode synthesis', 'solid-state electrolyte interface'",
    "experimental_focus": "synthesis|characterization|performance|mechanism|computational|review|other",
    "uses_dft": false,
    "uses_md": false,
    "uses_ml": false
  }
}
```

## Field-by-field guidance

### `confidence_notes`

Use this freely. Examples:
- `"Could not determine first_author due to OCR error on title page"`
- `"Section word counts approximate; PDF had no clear section breaks"`
- `"AI tell candidates may be incomplete; abstract was scanned-image-only"`

This field is **critical** for downstream filtering. The aggregation script can exclude low-confidence papers from specific stats.

### `lexicon.acronyms.is_defined_at_first_use`

Mark `true` if the paper expands the acronym at first use (e.g., "lithium nickel cobalt manganese oxide (NCM)"). Mark `false` if the acronym is used cold. This is the data backing principle E2 (citation completeness analog for acronyms).

### `figures.types.kind`

Use the controlled vocabulary above. If a figure doesn't fit, add `other` and put the actual type in a free-text field. The aggregator can detect new types if they recur ≥3 papers and suggest adding them to the vocabulary.

### `voice_samples`

These are **verbatim copies**, not summaries. The aggregator builds a corpus of representative paragraphs that downstream tools (prose-polisher, section-drafter) use as few-shot exemplars. Quality of voice samples directly determines quality of the trained tool.

### `ai_tell_candidates`

Be conservative. Flag only:
- Phrases that are vague-superlative ("remarkable", "groundbreaking", "paramount importance")
- Filler that adds no information ("It is worth noting that", "In recent years")
- Mirror phrases (paper restating its own abstract)
- Patterns from the broader AI-writing tell list (B8 in academic-writing principles): "delve", "leverage", "tapestry", "landscape of"

Do NOT flag:
- Standard domain vocabulary even if it sounds buzzwordy ("high-performance" in battery papers is conventional)
- Direct quotes from cited work
- Section labels or boilerplate

## Validation

A complete extraction should have:
- [ ] All `metadata` fields populated (or null with confidence note)
- [ ] At least `sections` array in `structure` (other structure fields can be partial)
- [ ] At least 5 acronyms in `lexicon.acronyms` (papers with fewer are likely review papers — note this)
- [ ] At least 3 figure types described in `figures.types`
- [ ] All 5 voice sample fields populated
- [ ] `confidence_notes` array exists (can be empty if extraction was clean)

If any required field is missing, log to `confidence_notes` and proceed.
