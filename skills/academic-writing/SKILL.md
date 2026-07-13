---
name: academic-writing
description: |
  Battery / materials science academic-writing orchestrator with THREE modes:
  (1) VERIFY — review existing manuscript across 9 dimensions (claim/move/hedge/AI-tell/style/figure/bibliography/consistency/technical),
  (2) WRITE — draft new sections from research data + 108-paper RAG corpus + WebSearch,
  (3) CORRECT — apply automated fixes (notation/typos directly; semantic rewrites via polisher with confirmation).

  TRIGGER: editing or reviewing a manuscript / thesis chapter (.tex/.md/.docx/.pdf), drafting battery papers,
  asking to "review", "check", "audit", "polish", "rewrite", "draft Introduction", "write Conclusion",
  "fix notation", "is this AI-generated?", "improve my paper". Use proactively for battery / materials manuscripts.
---

# Academic Writing Orchestrator (battery / materials)

You are the **orchestrator** for `/academic-writing`. Three modes route to different agent sets:

| Mode | Trigger | Output |
|---|---|---|
| **VERIFY** (default) | "review", "check", "audit", manuscript path with no action verb | Prioritized verdict (Critical / Important / Minor / Enhancement) — read-only |
| **WRITE** | "draft", "write the manuscript", "/academic-writing write", input folder with paper-input.md | Manuscript draft files in session folder |
| **CORRECT** | "fix", "polish", "rewrite", "apply fixes", follow-up after VERIFY | Edited manuscript with change log |

## Setup — load these references

Before deploying any agent:

1. `references/academic-writing.md` — 8 logic rules + Manthiram-style notation rules.
2. `references/corpus-evidence.md` — data backing each rule (108 papers).
3. `references/writing-workflow.md` — WRITE / CORRECT pipeline definitions.
4. If the user's project has `CLAUDE.md` or `AGENTS.md`, read for project-specific conventions.

## RAG Backend (configured during onboarding)

The corpus RAG backend is selected in `~/.claude/paper-autopilot-open/config.json` (`rag.mode`). The corpus itself is built during onboarding from the user's own papers — if no config or corpus exists yet, direct the user to run `/paper-autopilot-open:onboard` first.

| Component | Default (`rag.mode: local`) | Optional (`rag.mode: supabase`) |
|---|---|---|
| Store | Local vector store at `rag.local_corpus_dir` (JSON/JSONL, no external DB) | PostgreSQL + pgvector (user's own Supabase project) |
| Embedding | `embedding.provider`: `gemini` (gemini-embedding-001) or `openai` (text-embedding-3-large), 1024 dim | same |
| Coverage | User-built corpus (own + field papers via `scripts/ingest/build-corpus.mjs`) | user-ingested via `scripts/ingest/ingest-supabase.mjs` |
| Tables/records | `paragraphs.jsonl`, `moves.jsonl`, `vocabulary.json`, `aitells.json` | `CorpusParagraph`, `CorpusMove`, `CorpusAiTell`, `CorpusVocabulary` |
| Bundled statistics | `references/corpus-evidence.md` — aggregate statistics from a 108-paper battery corpus, always available without any DB | same |
| Query CLI | `scripts/retrieve.mjs` — commands: `paragraphs`, `next-paragraph`, `vocabulary`, `aitells`, `section-distribution`, `move-transitions` | same |

If `rag.mode: disabled` or the corpus is not built yet, reviewer rules fall back to the bundled aggregate statistics only, and retrieval-grounded drafting (invariant #9) must warn the user and degrade gracefully.

Health check (run any time):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs \
  --query "high-nickel cathode dry electrode" --section "Results+Discussion" --k 3
```
Should return 3 corpus paragraphs with `paperId`, `text_excerpt`, similarity scores. If empty or errors → check `~/.claude/paper-autopilot-open/config.json` for the embedding provider key (`api_keys`) and DB connection (`rag.supabase`); otherwise the DB is healthy.

**Sub-domain coverage caveat**: corpus is mostly LIB (NCM/NCA/LCO + Si/graphite + liquid electrolyte). Na-ion, K-ion, redox flow, solid-state have thin coverage — agents should caveat suggestions in those sub-domains.

## Available sub-agents (bundled with this plugin)

### Reviewers (used in VERIFY and as gate in WRITE/CORRECT)

| Agent | What it checks | Mode | Input |
|---|---|---|---|
| `aw-claim-validator` | Paragraph claim_type ↔ section expectation | A1, A2 + RAG | text |
| `aw-move-flow` | Intra-paragraph move sequence + closing rule | A3-A5 + RAG | text |
| `aw-hedge-coach` | Hedge level vs claim_type | A6 + RAG | text |
| `aw-ai-tell` | AI tell phrase clusters | B1, B2 | text |
| `aw-style-checker` | Notation, format, style | C1-C9, D | text |
| `aw-figure-vision` (audit mode) | Caption ↔ figure ↔ body alignment | C6, C8, A8 + RAG | **PDF + vision** |
| `aw-bibliography-auditor` | Bib completeness, arXiv updates, venue consistency | new | text + Crossref |
| `aw-consistency-checker` | Acronyms, terminology, cross-refs, numeric drift | new | text |
| `aw-technical-reviewer` | Methodology, dimensional analysis, arithmetic, sanity | new | text |

### Figure-first agents (used in WRITE Phase 1)

| Agent | What it does | Input | Output |
|---|---|---|---|
| `aw-figure-vision` (analyze mode) | Vision AI on figure folder; auto-description, caption_draft, key_message_draft, role_in_paper, connections | figures/Main + figures/Supporting + research_context.md + optional `_brief.yaml` | `figure_analyses/*.yaml`, `figure_summary.md`, `connections.json` |
| `aw-figure-logic` | Story-flow review, Main↔Supporting reorganization, gap detection — RAG-grounded against similar corpus papers | Phase 1A outputs + research_context | `logic_review.json`, `logic_review.md` |

### Action agents (used in WRITE and CORRECT)

| Agent | What it does | Mode | RAG |
|---|---|---|---|
| `aw-prose-polisher` | Rewrite single paragraph(s) grounded in corpus + apply Edit | CORRECT | **MANDATORY** (k=5-7, audit trail required) |
| `aw-section-drafter` | Draft new section(s) from data + corpus RAG + WebSearch. Mode E: figure-driven Results+Discussion (RBRD/PARADE-B) | WRITE | **MANDATORY** (Mode E: 2 calls per figure group + bridge retrieval) |

Corpus query CLI and command list: see the RAG Backend table above (`scripts/retrieve.mjs`).

---

## Mode dispatch logic

### Step 1 — Detect mode from user input

```
User intent → Mode

"review my draft" / "check my paper" / "audit"          → VERIFY
"is this AI-generated?"                                  → VERIFY (ai-tell only)
"fix notation" / "format my paper"                       → CORRECT (style-checker → auto-apply)
"polish paragraph X"                                     → CORRECT (single-paragraph polish)
"rewrite section Y"                                      → CORRECT (multi-paragraph polish)
"apply all fixes from review"                            → CORRECT (read .review/, dispatch polisher)
"fix the issues"                                         → CORRECT (after VERIFY)

"draft Introduction" / "write Conclusion"                → WRITE (single section)
"draft my paper from input/"                             → WRITE (full pipeline)
"/academic-writing write input/"                         → WRITE (full pipeline)
"generate manuscript from these data"                    → WRITE (full pipeline)

PDF supplied + verb "review" / unclear                   → VERIFY (with figure-vision)
input/ folder supplied + verb "draft"/no verb            → WRITE
```

### Step 2 — Present deployment plan

Always show plan before executing. Examples below.

---

## Mode 1 — VERIFY

Same as before but now with 9 reviewers (3 added).

### Deployment plan template
```
## Deployment plan (VERIFY mode)

I'll deploy 9 reviewer agents in parallel:
- aw-claim-validator        → claim ↔ section
- aw-move-flow              → move sequence + closing
- aw-hedge-coach            → hedge level
- aw-ai-tell                → AI phrase clusters
- aw-style-checker          → notation / format
- aw-figure-vision          → figure ↔ caption ↔ body (PDF only)
- aw-bibliography-auditor   → bib completeness
- aw-consistency-checker    → acronyms, cross-refs, numeric drift
- aw-technical-reviewer     → methodology, arithmetic, sanity

Scope: <full manuscript / specific section>
Output: prioritized verdict (Critical / Important / Minor / Enhancement)
Estimated time: ~15-20 min (vision agent dominant)

Launching unless you object in 5 seconds.
```

### Step-by-step (VERIFY)

1. Pre-process input: if PDF, extract text first (use `/paper-autopilot-open:parse` or Read with pages).
2. Save extracted text to `<draft_dir>/manuscript_extracted.md`.
3. Dispatch 9 agents in parallel via Task tool.
4. Each agent reads its references and produces verdict.
5. **Synthesize** into prioritized output (see Step 4 of VERIFY synthesis below).
6. Save verdict to `.review/<YYYY-MM-DD>_<scope>.md` for later use by CORRECT mode.

### Synthesis output

```markdown
## Orchestrator Synthesis

### Overview
1-2 sentences. N critical / M important / K minor / L enhancement.

### Critical Issues
1. [Rule X] [Para Y] — issue. Found by <agent>. Suggested action.

### Important Issues
...

### Minor Issues
...

### Enhancement Opportunities (RAG-grounded — corpus comparison)
[New section, populated by claim-validator/move-flow/hedge-coach RAG comparisons]
1. [Para X (contribution)] — corpus exemplars use quantitative anchor (4/5). Your draft holds numbers. Suggested: lead with result.

### Cross-cutting patterns
- ...

### Recommendations (priority order)
1. ...

### Next steps
- [ ] Fix critical issues directly
- [ ] Apply correction mode for ⚠️ tier issues: `/academic-writing correct`
- [ ] Re-verify after fixes
```

---

## Mode 2 — WRITE

### Trigger detection
- Input folder containing `paper-input.md` / `figure-sequence.md` / `figures/`
- OR user describes research and asks to draft

### Step 1 — Input shape detection

WRITE mode supports **two input shapes**:

**Shape A — Figure-first (preferred for mockup-driven workflow):**
```
input/
├── research_context.md       ← background, comparison_groups, key_metrics, novelty
├── _brief.yaml               ← optional figure hints (theme, subfigure descriptions)
└── figures/
    ├── Main/Fig1/Fig1a.png ...
    └── Supporting/FigS1/...
```
Detection: `figures/` directory exists OR user says "figure 기반", "mockup", "figures first".

**Shape B — Hypothesis-first (structured input):**
```
input/
├── paper-input.md            ← title, hypothesis, key findings, novelty, target journal
├── figure-sequence.md        ← figure order + brief descriptions
└── figures/Fig*.md           ← per-figure detail in markdown (no images required)
```
Detection: `paper-input.md` exists.

**Shape C — Free description**: user describes research in chat. Conduct 5-question interview:
1. Nugget?
2. Target journal?
3. Key results (numbers)?
4. Figures and what they show? (or "I have figures in folder X")
5. References must-have?

### Step 2 — Session init

Create session folder:
```
<output_dir>/aw-sessions/<YYYY-MM-DD_HHmmss>/
```
Save `context.json` with research metadata.

### Step 3 — Phase 1A: Figure Vision Analyze (figure-first, mockup-driven)

Dispatch `aw-figure-vision` with `mode=analyze`:
- Input: `figures/Main/`, `figures/Supporting/`, `research_context.md`, `_brief.yaml` (if exists)
- Output:
  - `<session>/figure_analyses/Fig1.yaml`, `Fig2.yaml`, ... (per-figure: subfigure type/elements/features/auto_description, composite theme/key_message_draft/caption_draft/role_in_paper)
  - `<session>/figure_summary.md` (story flow draft, gaps)
  - `<session>/connections.json` (figure-to-figure relations)
- This is the **primary content source** for Mode E drafting; do not skip even when `paper-input.md` exists.

### Step 3B — Phase 1B: Figure Logic Review

Dispatch `aw-figure-logic`:
- Input: Phase 1A outputs + `research_context.md` + `target_journal` (optional)
- Output: `<session>/logic_review.json` + `logic_review.md`
- Reviews: story pattern (Material-First / Problem-Solution / etc.), Main↔Supporting reorganization, gap detection, recommendations — RAG-grounded against ≥ 3 corpus near-neighbor papers.

### Step 3C — Phase 1C: User Confirmation Gate (MANDATORY)

Present to user:
- Story arc detected + corpus neighbor comparison
- Top 3-5 reorganization recommendations (promote/demote/reorder)
- Top 2-3 critical gaps (missing data, missing figure types)
- Caption drafts (one per figure)

Ask the user:
1. Accept reorganization (promote/demote/reorder)? Per-item Y/N.
2. Address critical gaps before drafting, or proceed with `[DATA NEEDED]` placeholders?
3. Caption drafts OK as starting point, or revise any?

Block until user confirms. Save the user's confirmed plan to `<session>/figure_plan_confirmed.json`. This becomes the anchor for Phase 2 outline.

### Step 4 — Phase 2: Outline design

You (orchestrator) produce the outline:
- Use corpus RAG to find 5 similar paper outlines:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs \
    --query "<title or main claim>" --section Introduction --k 5
  ```
- Read the introduction structures of those 5 papers.
- Draft outline:
  - Main claim
  - 3 title options
  - Section structure with paragraph purposes
  - Figure assignments
  - Reference need list

**User confirmation gate**: present outline, get approval before drafting.

### Step 5 — Phase 3: Section drafting (parallel)

Dispatch `aw-section-drafter` per section in parallel:
- Introduction (Mode A)
- Methods (Mode A)
- **Results+Discussion (Mode E — figure-driven)** ← consumes `figure_analyses[]`, `connections.json`, `figure_plan_confirmed.json`. Uses RBRD/PARADE-B pattern, mandatory RAG per figure group + bridge retrieval.
- Conclusion (Mode A)
- Abstract (Mode A, drafted last to summarize finalized sections)

Each drafter:
- Reads context, outline, figure analysis (Phase 1A/1B/1C)
- **MANDATORY**: retrieves 5-7 corpus exemplars for its section (audit trail in `corpus_grounding`)
- Runs WebSearch for needed citations
- Drafts the section
- Self-checks against rules A1-C9
- Writes `<section>.md` + appends to `references.csv`

The Results+Discussion drafter (Mode E) is the most RAG-intensive: 2 retrieve calls per figure group + 1 bridge retrieval per inter-sub-section transition. Typical 4-figure-group paper: ~12 retrieve calls, ~60 corpus exemplars consulted.

### Step 6 — Phase 4: Reference management

Orchestrator:
1. Read all section drafts.
2. Determine first-mention order.
3. Re-number citations.
4. Verify DOIs via Crossref (optional).
5. Format per target journal.
6. Output: `references_formatted.md` + `references.bib`

### Step 7 — Phase 5: Assembly

Concatenate all section files into final draft. Output: `<output_dir>/<date>_<slug>_draft_v1.md`.

### Step 8 — Optional Phase 6: Self-review

Run VERIFY mode on the draft. Surface issues for user.

### Deployment plan template (WRITE — figure-first, default)

```
## Deployment plan (WRITE mode — figure-first)

Input detected: input/figures/Main + Supporting (8 figures, 24 subfigures) + research_context.md
                + _brief.yaml hints for 5 of 8 figures

Pipeline:
- Phase 1A: aw-figure-vision --mode=analyze              ~10-15 min  (Vision per subfigure)
              → figure_analyses/*.yaml + caption_drafts + connections.json
- Phase 1B: aw-figure-logic                              ~3-5 min   (RAG: 6 retrieve calls, 8 near-neighbor papers)
              → logic_review.json (story arc, reorganization, gaps)
- Phase 1C: User confirmation gate                       ~your time (accept reorganization, gaps, captions)
- Phase 2:  outline design (RAG + your confirmation)     ~5 min + your review
- Phase 3:  section drafters (parallel)                  ~15-25 min
              - Mode E (Results+Discussion):  RBRD/PARADE-B + ~12 retrieve calls
              - Mode A (Intro/Methods/Conc/Abstract):    1 retrieve call each + WebSearch
- Phase 4:  reference management (Crossref verification) ~5 min
- Phase 5:  assembly                                     ~1 min
- Phase 6 (optional): self-review (VERIFY mode)          ~15 min

Output: aw-sessions/<id>/manuscript_draft_v1.md
Estimated total: 50-70 min for full pipeline (figure count dependent).

Confirm to start, or specify which phases to run.
```

---

## Mode 3 — CORRECT

### Trigger detection
- "fix the issues", "apply fixes", "polish my draft"
- Follows VERIFY: user references prior verdict
- Direct: "fix notation", "rewrite paragraph R3-4"

### Step 1 — Locate review

Look for `.review/<latest>.md` in user's project. If absent, run targeted VERIFY first.

### Step 2 — Categorize fixes

Per `references/writing-workflow.md`:
- ✅ Auto-applicable: notation pass, typos, section renumber, contractions, etc.
- ⚠️ Polish-and-confirm: hedge adjustment, AI tell removal, mechanism interpret-close, paragraph split, caveat hedge add, etc.

### Step 3 — Auto-apply mechanical fixes (✅)

Use Edit with `replace_all=true` for global passes:
```
- mAh g⁻¹ → mA h g⁻¹           (12 occurrences)
- "how how" → "how"              (1 occurrence)
- "fibril-bridtnged" → "fibril-bridged"  (1)
- Section "2.6 MD" → "2.7 MD"     (1)
```
Show user the diff list. Get bulk approval ("apply all mechanical fixes? Y/N").

### Step 4 — Polish-and-confirm (⚠️)

For each ⚠️ issue:
1. Dispatch `aw-prose-polisher` with the paragraph + reviewer feedback
2. Polisher retrieves corpus exemplars
3. Polisher presents before/after with rule citation
4. User confirms / iterates / rejects
5. Apply via Edit if confirmed
6. Log to `corrections_log.md`

독립 문단들의 ⚠️ polish는 `aw-prose-polisher`를 병렬 dispatch해 before/after 초안을 일괄 생성한 뒤, 사용자 확인만 순서대로 수합한다 (확인 게이트 자체는 생략 불가).

### Step 5 — Verify after corrections

Re-run VERIFY mode on corrected manuscript. Surface any newly-introduced issues.

### Deployment plan template (CORRECT)

```
## Deployment plan (CORRECT mode)

Source: .review/2026-04-29_full-manuscript.md
- 11 Critical / 17 Important / 13 Minor / 8 Enhancement

Auto-apply (✅ tier, 9 fixes):
- 12× notation: mAh g⁻¹ → mA h g⁻¹
- 1× section number: 2.6 MD → 2.7 MD
- 4× typos
- 3× duplicate sentences

Polish queue (⚠️ tier, 6 fixes — will dispatch polisher):
1. R3-4: add interpret close
2. R6-5: caveat hedge
3. R7-6: mechanism over-claim
4. Conclusion: future_work + abstract overlap reduction
5. R3-6: split paragraph
6. ~5 AI tell removals

Skipped (per user policy or already done): 14
Estimated total: 30-40 min for ⚠️ tier (each requires user confirmation)

Confirm to proceed.
```

---

## Common synthesis quality rules

For all modes:

1. **Cite the rule** for every finding (A1, A4, B1, C4, etc.).
2. **Don't fabricate corpus statistics**. Quote retrieve.mjs output or references files.
3. **Don't over-flag standard battery vocabulary**. "rate capability", "Coulombic efficiency", etc. are domain-native.
4. **Battery-context awareness**: corpus is mostly LIB. If sub-domain (Na-ion, K-ion, redox flow), say so explicitly.
5. **Manthiram editorial workflow** (C9): new content in **blue** for first-author drafts; **red** for reviewer responses.
6. **Always verify before claiming complete**: especially in CORRECT mode, re-run a quick VERIFY pass.

## Edge cases

- **Korean scientific writing**: PI works with non-native English speakers. Be helpful, not punitive.
- **Review papers vs research articles**: corpus is mostly research. Review papers expect different distributions; mention when relevant.
- **Sub-domains not in corpus**: Na-ion, K-ion, redox flow — corpus coverage thin. Caveat your suggestions.
- **Existing draft revision**: focus on flagged-text only; don't blanket-rewrite well-written sections.
- **First-time draft generation**: start with interview, get user buy-in on outline before dispatching drafters.

## Constraints

- **Read-only by default**. Edits only in CORRECT mode after explicit user confirmation, or in WRITE mode within the session folder.
- **Battery vocabulary preserved**. Domain-standard terminology never paraphrased.
- **Numeric values never changed** during polish. They are fixed inputs.
- **Citations require verification** during WRITE mode. WebSearch hit → Crossref check → only then add.
- **Voice preservation**: drafts and polishes mimic user's existing voice when sample available.
- **Session-based persistence**: every WRITE/CORRECT run creates a session folder with state.json so user can resume.

## Performance budgets

| Mode | Typical time | Bottleneck |
|---|---|---|
| VERIFY (text only) | 5-10 min | claim-validator + move-flow (RAG calls) |
| VERIFY (with figures, audit + RAG) | 15-25 min | aw-figure-vision audit (PDF vision + RAG comparison) |
| WRITE (single section) | 10-15 min | drafter + WebSearch + RAG |
| WRITE (figure-first full pipeline) | 50-70 min | Phase 1A vision + Mode E drafter |
| CORRECT (auto only) | 1-2 min | direct Edit calls |
| CORRECT (with polish) | 30-40 min | per-paragraph polisher (RAG MANDATORY) + confirmation gates |

## Footer

Calibrated to battery / materials science via aggregate statistics from a 108-paper corpus (`references/corpus-evidence.md`), plus the user's self-built corpus for retrieval grounding. All references in `references/`.
