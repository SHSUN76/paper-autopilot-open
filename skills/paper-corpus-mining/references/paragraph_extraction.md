# Paragraph-Level Extraction Prompt (canonical schema)

Deep paragraph extraction turns each body paragraph of a paper into a
structured record for corpus mining. The output of this stage is the **input
to `scripts/ingest/build-corpus.mjs`** (which reads `paragraph_reports/*.json`),
so the field names below are the canonical contract — do not rename them.

Extract every body paragraph from the paper. Skip references, figure captions
(handled separately), table content, and metadata blocks. Start from the
Introduction; skip the abstract (handled at paper level).

## Output object

Emit a single JSON object per paper:

```json
{
  "paper_id": "{{paper_id}}",
  "paragraphs": [ /* one object per body paragraph, in reading order */ ]
}
```

## Paragraph object — required fields (canonical)

Each paragraph object MUST carry these fields (this is the exact set the
downstream store consumes):

```json
{
  "section_name": "string — match the section heading verbatim",
  "position_in_section": 0,
  "text": "string — verbatim copy of the paragraph",
  "voice": "active_we|passive|mixed",
  "hedge_level": "none|mild|moderate|strong",
  "primary_claim_type": "motivation|contribution|evidence|mechanism|interpretation|caveat|method_description|comparison|bridge",
  "has_active_we": false,
  "ai_tell_phrases": ["remarkable", "paving the way"],
  "moves": [
    {"move_type": "state_goal", "position": 0, "text_span": "first sentence quoted verbatim"},
    {"move_type": "present_evidence", "position": 1, "text_span": "..."},
    {"move_type": "interpret", "position": 2, "text_span": "..."}
  ]
}
```

Field notes:

- `section_name` — verbatim section heading (e.g. `Introduction`, `2.3 Results`).
- `position_in_section` — 0-based index of the paragraph within its section.
- `text` — verbatim paragraph text; no paraphrasing.
- `voice` — one of `active_we`, `passive`, `mixed`.
- `hedge_level` — one of `none`, `mild`, `moderate`, `strong`.
- `primary_claim_type` — the dominant claim type; pick exactly one from the
  claim taxonomy below even if the paragraph mixes several.
- `has_active_we` — `true` only when first-person plural pronouns appear.
- `ai_tell_phrases` — array of suspicious vague-superlative or content-empty
  phrases found in this paragraph (may be empty).
- `moves` — array of move objects (see the move taxonomy). Each move is
  `{"move_type": "...", "position": <int>, "text_span": "..."}` where
  `position` is the 0-based order of the move within the paragraph and
  `text_span` is the verbatim sentence/clause the move covers.

## Paragraph object — optional supplementary fields

These are useful for richer aggregation but are not required by the store and
may be omitted:

```json
{
  "word_count": 142,
  "tense_pattern": "string — short description (e.g. 'past simple, methods style')",
  "cites_count": 3,
  "refs_figures": ["Fig 1a", "Fig 3"],
  "refs_equations": ["Eq 2"],
  "refs_tables": [],
  "refs_prior_work": 5
}
```

## Claim-type taxonomy (`primary_claim_type`)

- `motivation` — why the problem matters / what gap motivates the work
- `contribution` — restates what THIS paper adds
- `evidence` — reports an observation, measurement, or simulation result
- `mechanism` — proposes a mechanistic/causal account
- `interpretation` — converts evidence into a broader claim or reading
- `caveat` — acknowledges a limitation or alternative explanation
- `method_description` — describes the approach / procedure
- `comparison` — contrasts with prior work or an alternative
- `bridge` — connects to the next paragraph or section

## Move-type taxonomy (`moves[].move_type`)

- `state_goal` — declares the purpose of the section / paper
- `cite_gap` — identifies what prior work missed
- `propose_method` — introduces the approach
- `present_evidence` — reports observation, measurement, or simulation result
- `interpret` — converts evidence into a mechanistic claim
- `caveat` — acknowledges a limitation or alternative explanation
- `bridge` — connects to the next paragraph or section
- `contribution` — restates what THIS paper adds
- `future_work` — hints at next steps
- `hedge_alternative` — proposes another reading of the data ("alternatively…")

## Output rules

1. Output a single JSON object: `{"paper_id": "{{paper_id}}", "paragraphs": [...]}`.
2. Verbatim quotes only — never paraphrase the body text.
3. Be conservative on `ai_tell_phrases` — flag only vague-superlative or
   content-empty phrases, not standard domain vocabulary.
4. `has_active_we` is `true` only when first-person plural pronouns appear in
   the paragraph.
5. `primary_claim_type` is the single dominant claim type — choose one even if
   the paragraph is mixed.
6. `moves` should cover the whole paragraph; every sentence maps to ≥1 move.
7. Skip the abstract (handled at paper level); start from the Introduction.
8. Skip the references list, figure captions, and supporting-information pointers.
9. For long sections, paginate if needed but keep paragraph order intact.
