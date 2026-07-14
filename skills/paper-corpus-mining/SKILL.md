---
name: paper-corpus-mining
description: >-
  Analyze a corpus of academic papers (5+ papers) as a group to extract
  domain-specific writing patterns — lexicon (acronyms/units/formulas), section
  structure, figure conventions, citation styles, caption patterns, voice
  samples, and AI-writing tells. Use even when the user says "summarize these"
  if 10+ papers are involved in the same domain, since corpus mining catches
  patterns that per-paper summaries miss. Skip for 4 or fewer papers and suggest
  direct reading instead. Especially useful for building domain-specific writing
  tools, forking academic plugins to new fields, generating style guides,
  training prose-polisher agents on a domain, or creating few-shot exemplar
  libraries.
  TRIGGER: the user describes processing multiple papers in the same domain —
  phrases like "100편 논문 분석해서 패턴 추출", "analyze N papers", "extract
  patterns from these papers", "build a domain lexicon", "corpus analysis",
  "what conventions do these papers share", "mine writing style from this
  folder", or "fork plugin Y and adapt it to my domain".
---

# Paper Corpus Mining

A 3-stage pipeline that turns N academic papers into actionable writing-style intelligence: a domain lexicon, section-structure statistics, figure conventions, citation patterns, voice samples, and AI-writing tell candidates.

## When this skill is the right tool

This skill is for jobs where **statistics across many papers** matter, not for reading any single paper. Concrete triggers:

- "I have N papers in domain X, what patterns can we extract?"
- "Build a lexicon / glossary from this paper folder"
- "Analyze 50 papers from Nature Energy to learn the writing style"
- "What AI tells appear in this corpus?"
- "Mine the figure caption conventions in this folder"
- "I want to fork plugin Y and adapt it to my domain — analyze these papers"

If the user only has 1-3 papers, decline corpus mining and recommend reading them directly. The statistics aren't meaningful below 5 papers and no patterns rise above noise.

## Architecture

```
Stage 1: Per-paper extraction  →  reports/<paper-id>.json (one per paper, parallel)
Stage 2: Aggregation           →  aggregated/*.md (stats + merged data)
Stage 3: Synthesis report      →  corpus_report.md (final actionable output)
```

Stages are sequential — Stage 2 cannot start until Stage 1 produces results for the agreed-upon majority of papers. Within Stage 1, papers are extracted in parallel batches (5-10 at a time, never 100+ at once due to context congestion).

## Step 0: Pre-flight interview

Before any extraction, confirm with the user. Never start Stage 1 with ambiguous parameters — re-extracting 100 papers because the template was wrong is a multi-hour mistake.

1. **Paper location**: Where are the PDFs/markdown? Single folder path?
2. **Paper count**: How many papers?
   - ≤4: stop, suggest direct reading instead
   - 5-30: standard pipeline
   - 30-100: extended pipeline + pilot recommended
   - 100+: split into multiple sessions, save state between
3. **Format mix**: Pure PDF / pre-parsed markdown / mixed?
   - Pre-parsed markdown bypasses vision processing — 5-10× faster, much cheaper
   - PDF requires vision; use `model="fable"` on Stage 1 sub-agents
4. **Output target**: What is the corpus analysis for?
   - Generic report → balanced Stage 3
   - Building a domain lexicon → emphasize lexicon section
   - Forking an existing tool/plugin → emphasize comparison vs. tool's current assumptions
   - Training a prose-polisher / style guide → emphasize voice samples + AI tells
5. **Workspace**: Where should outputs go? Default: `<paper-folder>/_corpus_analysis/`
6. **Pilot first?**: Run on 5 papers as a pilot to validate the extraction template before scaling? Strongly recommended for 30+ papers.

If any answer is missing, ask before proceeding.

## Stage 1: Per-paper extraction

For each paper, dispatch a sub-agent with the extraction template from `references/extraction-template.md`. Each agent reads one paper and produces one JSON file at `<workspace>/reports/<paper-id>.json`.

**Model selection**:
- PDF input (vision required) → `model="fable"`
- Pre-parsed markdown → `model="sonnet"` is sufficient and far cheaper (flagship=Fable 5)

**Sub-agent prompt template** (copy and customize):
```
Read the paper at <PAPER_PATH> and extract a corpus analysis JSON following the schema at <SKILL_PATH>/references/extraction-template.md.

Save the output to <WORKSPACE>/reports/<PAPER_ID>.json.

Skip any field you cannot determine confidently — log a `confidence_notes` array describing what was uncertain.

Be conservative on AI tell candidates — only flag phrases that are statistically suspicious in academic prose, not standard domain vocabulary.
```

**Parallelism rules**:
- Dispatch 5-10 sub-agents in one batch, wait for all to complete, then dispatch the next batch.
- Never dispatch 30+ sub-agents at once — context congestion produces flaky results.
- Use `run_in_background: true` only if a single batch will exceed ~10 minutes.

**Failure handling**:
- If a paper extraction fails (PDF corrupt, OCR-only scan, missing sections), log to `<workspace>/failed.json` with reason and skip.
- Don't block the corpus on a single failure. Aim for ≥85% success rate; if below, audit the failures before continuing.

**Pilot stage** (mandatory for ≥30 papers):
- Process the first 5 papers
- Show the user the 5 extracted JSONs
- Ask: "Does the template capture what you needed? Any field to add/remove?"
- Only after confirmation, scale to the full corpus.

## Stage 2: Aggregation

After all (or the agreed-upon majority of) per-paper JSONs are produced, run aggregation. This stage is deterministic and best done with the bundled script:

```bash
python <SKILL_PATH>/scripts/aggregate.py <workspace>/reports/ --out <workspace>/aggregated/
```

If the script is unavailable or the corpus has unusual fields, write a one-off Python script that produces the same outputs. The aggregation should produce these files in `<workspace>/aggregated/`:

- `lexicon.md` — Acronyms ranked by frequency (≥3 papers required to surface), unit standardization summary, chemical/material formula list
- `structure-stats.md` — Section order distribution, word-count percentiles per section, section presence rates, modal "canonical structure"
- `figure-conventions.md` — Figure type distribution, caption length percentiles, per-type caption pattern (with example captions)
- `citation-patterns.md` — Citation density distribution (per 1000 words), first-use citation compliance rate, per-journal differences if metadata varies
- `ai-tells.md` — Candidate phrases ranked by frequency (≥3 occurrences across ≥2 papers), with example contexts
- `voice-samples.md` — Curated representative paragraphs (intros, conclusions, methods) — clustered by tone (active-we / passive / mixed)

**Group statistics by journal/venue when paper count per venue ≥ 5.** Single-venue stats from a 50-paper corpus all from one journal create a misleading "domain pattern" that's actually a "journal pattern."

## Stage 3: Synthesis report

Produce `corpus_report.md` using the structure in `references/report-template.md`. The report must be **actionable**, not just statistical:

- What's the core lexicon for this domain? (top 30 acronyms, top 10 units, formula syntax conventions)
- What's the canonical paper structure? (modal section order, recommended word-count balance)
- What figure types and caption patterns dominate? (with examples)
- What are the journal-specific deviations? (if applicable)
- What AI-writing tells are domain-flagged? (ranked list with rationale)
- Recommended actions for the user's downstream task (writing tool, plugin, style guide).

Always cite which papers contributed to each statistic — traceability matters for the user to verify.

## Decision points to surface to the user

Don't just push through to the final report — surface decisions where user judgment is required:

- **Stop early if pilot reveals a template flaw**. Before scaling beyond 5 papers, show the user the first 5 extraction JSONs and ask for adjustments.
- **Suggest journal grouping** if metadata shows 3+ venues with 5+ papers each.
- **Flag low-confidence extractions** (very short papers, OCR errors, missing sections) for user review rather than silently including them in stats.
- **Recommend incremental disclosure** — don't dump all 6 aggregation files at once. Walk through them in order: lexicon first (most concrete), then structure, then figures, then voice/AI-tells. This lets the user catch issues early.
- **AI tell candidates need user vetting**. Some "AI tells" are genuine domain conventions (e.g., "remarkable" is overused in materials abstracts but isn't an AI artifact). Always present candidates for user approval before claiming them as a domain rule.

## What NOT to do

- Don't process papers serially when they can be parallelized — wastes hours.
- Don't skip the pilot stage for corpora ≥ 30. The pain of recovery is huge.
- Don't silently merge results from different paper formats (vision-extracted vs pre-parsed) without flagging — they have different error profiles.
- Don't write the final report before Stage 2 is complete — partial aggregation produces misleading patterns.
- Don't use this skill for fewer than 5 papers — recommend direct reading instead.
- Don't dispatch all sub-agents in one mass batch for large corpora — batches of 5-10 with explicit waits.

## Output structure

```
<workspace>/
├── reports/
│   ├── paper-001.json
│   ├── paper-002.json
│   └── ...
├── aggregated/
│   ├── lexicon.md
│   ├── structure-stats.md
│   ├── figure-conventions.md
│   ├── citation-patterns.md
│   ├── ai-tells.md
│   └── voice-samples.md
├── failed.json              # papers that couldn't be extracted, with reasons
└── corpus_report.md         # Stage 3 final report
```

## Paragraph-level extraction (build-corpus input)

Beyond the corpus-wide statistics above, this skill can also emit a
**paragraph-level** extraction — one structured record per body paragraph
(voice, hedge level, claim type, rhetorical moves, AI-tell phrases). That output
follows the canonical schema in `references/paragraph_extraction.md` and is the
direct input to `scripts/ingest/build-corpus.mjs`, which reads
`paragraph_reports/*.json` to build the local vector store. When producing
paragraph reports, conform to that schema exactly — the field names are the
contract the ingest step consumes; do not rename them.

## Stage 1V — figure vision 분석 (own/field 전용)

Beyond per-paragraph tagging, this skill also emits a **figure-set** extraction — one
structured record per paper describing every figure, its panels, what it proves, and how
the figures chain into the paper's narrative arc, plus an optional top-level **`methodology`**
block that captures how the paper's analysis techniques (advanced vs standard) were used —
each technique's purpose, the claim it proves (`evidence_target`), and the figures it pairs
with. This is the vision counterpart of the paragraph pass and, like it, feeds
`build-corpus.mjs`.

- **Scope**: own and field papers only. **review** papers are excluded (they need
  domain-knowledge retrieval, not figure exemplars).
- **How**: dispatch a Claude Code sub-agent per paper (5 at a time). It reads the PDF as
  page vision (Read reads PDFs visually, max 20 pages/call — paginate), inspects each
  figure and its panels, judges each figure's narrative role, and assembles the arc.
  Runs on subscription credits → **$0 API cost**, a few minutes per paper.
- **Output**: one `<paper_id>.figures.json` per paper (figures + arc + optional
  `methodology`), saved **next to** the paragraph report in the same `_reports/<group>/`
  directory. `build-corpus.mjs` auto-detects it by the `.figures.json` suffix (paragraph
  reports are `<paper_id>.json`) and loads it into `figures.jsonl` + `figure-arcs.json`
  (plus a methods index from the `methodology` block), queryable via `retrieve.mjs figures`
  / `figure-arcs` / `methods`.
- **Schema + procedure**: follow `references/figure_extraction.md` exactly — it holds the
  canonical figure-report schema **and the optional top-level `methodology` block** (identical
  field names to the copy in `skills/onboarding/references/corpus-build.md`), the 6-step
  extraction procedure, the `narrative_role` (9-value enum) and `figure_type` controlled
  vocab, the `methodology` `category` (advanced/standard) rubric, and the hallucination guards
  (verbatim captions, caption-cross-checked `quantitative_claims`, "(불확실)" for uncertain
  panels, paper-stated techniques only with body-grounded `purpose`/`evidence_target`). Conform
  to that schema exactly — the field names are the contract the ingest step consumes; do not
  rename them.

## Reference files

- `references/extraction-template.md` — Full JSON schema for Stage 1 with field-by-field guidance
- `references/report-template.md` — Stage 3 final report structure
- `references/paragraph_extraction.md` — Canonical paragraph-level extraction schema (input to `build-corpus.mjs`)
- `references/figure_extraction.md` — Canonical figure-vision (Stage 1V) schema + optional `methodology` block + extraction procedure + vocab + hallucination guards (own/field only; input to `build-corpus.mjs`)
- `scripts/aggregate.py` — Stage 2 deterministic aggregation script

## Why this skill exists

Domain-specific writing tools (academic plugins, style guides, prose polishers) need domain-specific knowledge. That knowledge is implicit in the published papers — every domain has its lexicon, structure, conventions, and even its own AI-writing tells. Mining those patterns from a real corpus produces tools that match the field instead of generic academic writing tools that miss the domain. This skill industrializes that mining.
