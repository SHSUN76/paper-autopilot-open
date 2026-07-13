# Writing & Correction Workflows

> Two automated modes that go beyond the read-only review mode. Both modes preserve the corpus-RAG grounding that makes /academic-writing battery-domain calibrated.

---

# Figure-Driven Authoring (the canonical WRITE path)

> Battery / materials papers most often start from **figures**: experimental results are plotted,
> mockup figures are arranged into a story, then text is written around the figure narrative.
> This workflow honors that real-world process.

## Author's mental model
```
mockup figures → story arc → text drafting → polish
     ↑                                          │
     └───── revise figures based on text ←──────┘
```

Most academic-writing tools assume "hypothesis → text → figures appended." Battery / materials
authors don't work that way. The figures are the primary artefact; the text is the wrapper that
turns figures into a publishable paper.

## End-to-end pipeline

```
[Phase 0] Input prep
  ├── input/research_context.md       (background, novelty, comparison_groups, key_metrics)
  ├── input/_brief.yaml               (optional: per-figure theme + subfigure descriptions)
  └── input/figures/
      ├── Main/Fig1/Fig1a.png ...
      └── Supporting/FigS1/...

       │
       ▼
[Phase 1A] aw-figure-vision --mode=analyze
  - Vision per subfigure (type / elements / features / auto_description)
  - Merge user_hint when provided
  - Composite per figure: theme + key_message_draft + caption_draft + role_in_paper
  - Connections inference (sequential / comparison / mechanism / evidence)
  - RAG role validation (~5 retrieve calls)
  → figure_analyses/<id>.yaml + figure_summary.md + connections.json

       │
       ▼
[Phase 1B] aw-figure-logic
  - Story-pattern classification (Material-First / Problem-Solution / etc.)
  - Main↔Supporting promotion/demotion/reorder
  - Gap detection (missing canonical figures, missing comparison groups)
  - Recommendations ranked by priority/effort/impact
  - RAG: 6 retrieve calls → 8 corpus near-neighbor papers' figure arcs
  → logic_review.json + logic_review.md

       │
       ▼
[Phase 1C] User confirmation gate (BLOCKING)
  ┌─────────────────────────────────────────────────────────┐
  │ "I detected story pattern X. Top recommendations:        │
  │  1. Promote FigS3 to Main as Fig 2 (rationale: ...)     │
  │  2. Add XPS data before drafting?                       │
  │  3. Caption drafts for all figures — review and edit.    │
  │  Approve / modify / reject each?"                       │
  └─────────────────────────────────────────────────────────┘
  → figure_plan_confirmed.json (anchor for all subsequent phases)

       │
       ▼
[Phase 2] Outline design (orchestrator)
  - Read figure_plan_confirmed.json — outline anchors at confirmed figures
  - RAG: 5 retrieve calls for similar Introduction structures
  - Section assignments: figure → sub-section mapping
  - Reference need list (which paragraph cites what kind of source)
  - User confirmation gate

       │
       ▼
[Phase 3] Section drafting (parallel)
  ├── aw-section-drafter Mode E (Results+Discussion)  ← figure-driven, RBRD/PARADE-B
  ├── aw-section-drafter Mode A (Introduction)         ← from outline, corpus RAG, WebSearch
  ├── aw-section-drafter Mode A (Methods)
  ├── aw-section-drafter Mode A (Conclusion)
  └── aw-section-drafter Mode A (Abstract — last)

  Each drafter has MANDATORY corpus RAG (audit trail in corpus_grounding).

       │
       ▼
[Phase 4] Reference management
  - First-mention order
  - Crossref verification of every citation
  - Output: references_formatted.md + references.bib

       │
       ▼
[Phase 5] Assembly
  → manuscript_draft_v1.md

       │
       ▼
[Phase 6 optional] Self-review (VERIFY mode on the just-drafted manuscript)
```

## `_brief.yaml` schema

```yaml
project:
  title: "<paper title or working title>"
  comparison_groups: [<group A>, <group B>, ...]
  key_metrics: [<metric 1>, <metric 2>, ...]
  novelty: "<one-line novelty statement>"
  target_journal: "<Journal name>"   # optional

hints:
  Fig1:
    theme: "<unifying topic>"
    subfigures:
      a: "<one-line description>"
      b: "<one-line description>"
      g: "<quantitative result, e.g. 'GIDE 3.889 vs CDE 1.832 kgf/mm²'>"
  Fig2:
    theme: "..."
    subfigures: {...}
  FigS1:
    theme: "..."
    subfigures: {...}
```

`hints` is optional but **strongly recommended** — vision can misclassify mockups, and a one-line
hint per figure (or per critical subfigure) anchors the analysis. Hints are treated as authoritative
unless vision detects a hard conflict.

## `research_context.md` minimum content

```markdown
# Research context

## Topic
<One paragraph: what the work is about, what was done, what was found>

## Comparison groups
- <Group A>: <one-line description>
- <Group B>: <one-line description>

## Key metrics
- <metric 1>: <unit, expected range>
- <metric 2>: ...

## Novelty
<2-3 sentences: what's new, why it matters>

## Target journal (optional)
<Journal name and any specific requirements>
```

This file (`research_context.md`) is the figure-first input; the hypothesis-first `paper-input.md`
(Shape B in SKILL.md Step 1) is still supported as an alternative.

## When to skip Phase 1A

If the user is revising a published manuscript or already has well-developed captions and just
wants text help, they can skip Phase 1A and feed `figure_plan_confirmed.json` directly. But for
mockup-driven new papers — which is the majority — Phase 1A is the entry point.

---

---

# Mode 1 — WRITE (자동화 작성 모드)

Generate a full manuscript draft from user-provided research data + corpus RAG + live web search.

## Trigger
- User says: "draft my paper", "write the manuscript", "/academic-writing write", "generate paper from input"
- OR explicit: "draft Introduction", "write Abstract" (single-section mode)

## Inputs required

User provides one of these input shapes:

### A. Structured input (hypothesis-first)
```
input/
├── paper-input.md          ← title, hypothesis, key findings, novelty, target journal
├── figure-sequence.md      ← Figure order + brief descriptions
└── figures/
    ├── Fig1.md             ← per-figure detail (optional)
    ├── Fig2.md
    └── ...
```

### B. Free-form description
- 1-page summary of research (key findings, mechanism, target journal)
- Folder of figure images
- Existing data (electrochemistry CSV, characterization images, etc.)

If input shape is unclear, conduct a brief 5-question interview:
1. **Nugget**: in 1-2 sentences, what is the paper's central claim?
2. **Audience**: target journal? (Joule, AEM, JPS, JES, ...)
3. **Key results**: 3-5 bullet points with numbers
4. **Figures**: which figures support which claim?
5. **Existing literature**: 2-3 references the user already knows must be cited

## Pipeline (5 phases)

### Phase 0 — Session init
1. Read user's input file(s).
2. Construct `context.json`:
   ```json
   {
     "session_id": "YYYY-MM-DD_HHmmss",
     "title": "...",
     "key_claims": ["...", "..."],
     "novelty": "...",
     "target_journal": "...",
     "figures": [...],
     "experimental": {...}
   }
   ```
3. Create session folder: `<output_dir>/sessions/<session_id>/`
4. Initialize `references.csv` (empty).

### Phase 1 — Figure analysis (vision)
Delegate to existing **aw-figure-vision** agent (yes — same agent used in review mode for figure audit can also analyze user's figures for drafting context).

Input: figure files + figure-sequence.md
Output: `figure_analysis.json` per figure:
```json
{
  "id": "Fig 2g",
  "type": "stress-strain curve",
  "extracted_data": {"CDE_strain": 7.4, "GIDE_strain": 23.6, "stress": 0.6},
  "key_message": "GIDE shows 230% greater toughness via extended ductile regime"
}
```

### Phase 2 — Outline design
Orchestrator (or dedicated outliner sub-agent) produces:
- Main claim
- 3 title options
- Section structure:
  - Abstract: bullet points
  - Introduction: 4-5 paragraph purposes (motivation, comparison, contribution arc)
  - Results: sub-section list with figure assignments
  - Discussion: 3-4 topics (or merged with Results as Results+Discussion)
  - Conclusion: contribution recap + future_work bullet
- Reference need list (which paragraph needs which kind of cite)

**Use corpus RAG**: query for similar paper outlines:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs \
  --query "<title or main claim>" --section Introduction --k 5
```
This shows you 5 real intro paragraphs from similar papers — use them to template the section structure.

User confirmation gate: present outline, get approval before proceeding.

### Phase 3 — Section drafting (parallel)
Dispatch **aw-section-drafter** agents (one per section) in parallel:
- aw-section-drafter (Abstract)
- aw-section-drafter (Introduction)
- aw-section-drafter (Methods)
- aw-section-drafter (Results) — possibly multiple, one per sub-section
- aw-section-drafter (Discussion) — if separate from Results
- aw-section-drafter (Conclusion)

Each drafter:
1. Receives section assignment + context.json + outline
2. Retrieves 5-7 corpus exemplars of section's dominant claim type
3. Runs WebSearch for needed citations (heavy in Intro, light in Conclusion)
4. Drafts the section per corpus structural patterns
5. Self-checks against rules A1-C9
6. Writes `<section>.md` to session folder
7. Updates `references.csv` with new entries

### Phase 4 — Reference management
Orchestrator or dedicated agent:
1. Reads all section drafts.
2. Determines citation order (first-mention).
3. Re-numbers citations (or assigns BibTeX keys).
4. Verifies DOIs via Crossref (optional).
5. Formats reference list per target journal style.
6. Output: `references_formatted.md` + `references.bib`

### Phase 5 — Assembly
Orchestrator concatenates:
```markdown
# <title>
[authors / affiliations]

## Abstract
<abstract.md>

## 1. Introduction
<introduction.md>

## 2. Experimental Methods
<methods.md>

## 3. Results and Discussion
### 3.1 ...
<results-discussion sub-files>

## 4. Conclusion
<conclusion.md>

## References
<references_formatted.md>

## Figure Captions
<figure_captions.md>
```

Output: `<output_dir>/<date>_<slug>_draft.md`

### Optional Phase 6 — Self-review
Run review mode (5-6 reviewer agents) on the just-drafted manuscript. Surface issues for user to fix before submission.

---

# Mode 2 — CORRECT (자동화 수정 모드)

Apply automated fixes based on review-mode findings.

## Trigger
- User says: "fix the issues", "/academic-writing correct", "polish the draft"
- OR follows up after a review verdict: "apply all critical fixes"
- OR per-issue: "fix the section number bug", "rewrite paragraph R3-4"

## Pipeline

### Phase A — Read prior review (if available)
Check for `.review/<date>-<scope>.md` from previous review run. Use it as the issue list.

If no prior review: run review mode first (or run targeted reviewers based on user's hint).

### Phase B — Categorize fixes by type

| Fix type | Agent | Auto-applicable? |
|---|---|---|
| Notation (mA h g⁻¹, etc.) | aw-style-checker → orchestrator Edit | ✅ direct sed-style |
| Section number bug | orchestrator Edit | ✅ direct |
| Typos / duplicate words | orchestrator Edit | ✅ direct |
| Caption swap | orchestrator Edit | ⚠️ user verify before apply |
| Acronym definition missing | aw-prose-polisher | ⚠️ user verify |
| Hedge adjustment | aw-prose-polisher | ⚠️ user verify (semantic shift) |
| AI tell removal | aw-prose-polisher | ⚠️ user verify |
| Mechanism interpret-close | aw-prose-polisher | ⚠️ user verify |
| Conclusion future_work add | aw-section-drafter (small) | ⚠️ user verify |
| Paragraph split (R3-6) | aw-prose-polisher | ⚠️ user verify |
| Caveat hedge add | aw-prose-polisher | ⚠️ user verify |
| Bibliography entry update | aw-bibliography-auditor | ⚠️ user verify |

### Phase C — Auto-apply mechanical fixes (✅ tier)

For ✅ tier, batch apply directly:
- Global notation pass via Edit tool with `replace_all=true`
- Single-line typo fixes
- Section renumber

Show the user a summary of what was changed:
```
Auto-applied fixes:
- 12× mAh → mA h (notation)
- 1× section "2.6" → "2.7" (numbering)
- 1× "how how" → "how" (typo)
- 3× duplicate sentences removed
```

### Phase D — Polish-and-confirm (⚠️ tier)

For each ⚠️ tier issue, dispatch **aw-prose-polisher** agent:
1. Polisher retrieves corpus exemplars
2. Drafts before/after
3. Presents to user with rule citation
4. Awaits user confirmation
5. Apply via Edit if confirmed

User can:
- Approve each individually
- Approve all at once ("apply all")
- Iterate ("modify para 5: keep the first sentence")
- Reject ("skip para 7")

### Phase E — Verify
Re-run review mode on the corrected manuscript. Surface remaining issues.

---

# Mode 3 — VERIFY (검증 모드)

This is the original review mode (no changes from existing setup). 6-9 reviewer agents in parallel:

- aw-claim-validator
- aw-move-flow
- aw-hedge-coach
- aw-ai-tell
- aw-style-checker
- aw-figure-vision
- aw-bibliography-auditor (new)
- aw-consistency-checker (new)
- aw-technical-reviewer (new)

Output: prioritized verdict (Critical / Important / Minor).

This mode does **not** edit the manuscript. It only diagnoses.

---

# Cross-mode workflow

```
User invokes /academic-writing
   │
   ├─ Verify mode (default) ─→ 9 reviewers ─→ verdict
   │
   ├─ Write mode (--write or "draft") ─→ Phase 0-5 pipeline ─→ draft_v1.md
   │     └─→ optional Phase 6 ─→ self-review verdict
   │
   └─ Correct mode (--fix or "polish") ─→ Phase A-E pipeline ─→ corrected.md
         └─→ Phase E re-verify
```

A common full sequence:
```
1. /academic-writing write input/         (Mode 1: draft from scratch)
2. /academic-writing                      (Mode 3: verify the draft)
3. /academic-writing correct              (Mode 2: apply fixes)
4. /academic-writing                      (Mode 3: verify again)
```

---

# Sessions and persistence

Each invocation creates/uses a session folder:
```
<output_dir>/aw-sessions/<session_id>/
├── state.json              ← which phase, which agents ran
├── context.json            ← user's research data
├── figure_analysis.json
├── paper_outline.json
├── abstract.md
├── introduction.md
├── methods.md
├── results.md
├── discussion.md
├── conclusion.md
├── figure_captions.md
├── references.csv
├── references_formatted.md
├── references.bib
├── manuscript_draft_v<N>.md
├── review_v<N>.md
└── corrections_log_v<N>.md
```

Resume: `/academic-writing --resume <session_id>` re-enters the pipeline at the saved phase.

---

# What this skill DOES NOT do

- **Conduct research / experiments**: it drafts text from data the user provides.
- **Replace authorship**: every section is a first draft for the user to revise.
- **Generate figures from raw data**: figure creation is out of scope (use Origin / IGOR Pro / Python plotting).
- **Submit to journals**: it produces draft files; submission is manual.
- **Detect plagiarism**: it doesn't compare against published literature for similarity (use Turnitin / iThenticate).
- **Cite without verification**: every WebSearch hit is verified via Crossref or DOI before becoming a citation.
