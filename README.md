# paper-autopilot-open

**[English](README.md)** · [한국어](README.ko.md)

A battery / materials-science paper-writing **feedback-loop orchestrator** for Claude Code. Give it an idea and a figure set, and it scaffolds a standard paper folder, drafts a figure-first mockup, writes and reviews the manuscript against a corpus of real papers, plans the bench experiments that would fill the figure data slots, and re-evolves everything as new data arrives — with a `CLAUDE.md` hub in each paper folder so any session can pick up where the last one left off. This is the **open edition**: no private vault, no shared/proprietary corpus, and no hard dependency on any other plugin.

## Key features

- **Figure-first pipeline** — the paper is designed around its figures. A figure set becomes a mockup, the mockup drives the manuscript, and new measurements re-evolve both.
- **G1–G6 decision gates** — the orchestrator pauses at named gates (post-scaffold, post-mockup, post-plan, post-simulation, post-evolve, pre-submit). You choose per-gate `ask` / `auto` / `mixed` routing in plain language.
- **Adversarial spec review (alpha)** — `pa-forcing-questions` pushes vague concepts until they are specific; `pa-spec-review-loop` scores figure sets / SOPs / drafts across dimensions and loops fixes. (Alpha: skill logic + mock dogfood verified; live reviewer-dispatch verification is still deferred.)
- **Dual RAG with a self-built corpus** — you build the retrieval corpus from your *own* papers, plus field papers and an optional **review-paper group** (≤5, for fast domain grounding — tagged/embedded for knowledge retrieval only, excluded from the style profile and figure vision). The build emits two profiles automatically: an **own writing-style profile** (voice / hedge / phrasing exemplars) and a **field-knowledge profile** (year range, top journals, recent trends via a `--since` filter). Backend is `local` (on-disk vector store, no external DB) by default, `supabase` (bring-your-own project) optional, or `disabled`.
- **Vision-based paper + figure analysis** — for each own/field paper, a Claude Code sub-agent reads the PDF as page vision (subscription credits, $0 API cost) and extracts a structured figure report: per-panel content, each figure's proven message, its narrative role, how the figures chain into the paper's story arc, and an optional `methodology` block on how the paper used its analysis techniques.
- **Figure-set + methodology RAG** — those reports build a searchable figure index (`figures.jsonl`), an arc library (`figure-arcs.json`), and a methods index of how each analysis technique (advanced vs standard) was used — its purpose, the claim it proves (`evidence_target`), and the figures it pairs with. The writer retrieves exemplar figure arcs *and* the usage context of advanced techniques from your field via `retrieve.mjs figures` / `figure-arcs` / `methods` when designing a new paper's figure set and analysis plan.
- **Corpus relationship report** — the onboarding build renders a single self-contained `corpus-report.html` visualizing own↔field relationships and section / claim / move distributions.
- **Bundled toolchain** — `ppt-image` (Gemini figure mockups), `docx` (pandoc export), `parse` (PDF parsing, optional STORM), `review-paper` (6-agent referee report), `submission-prep` (cover letter + submission checklist). No external plugin required.
- **Materials Project integration** — real crystal-structure + materials-property data grounding via the `materials-project` skill (optional `materials_project` API key).
- **Hands-off onboarding wizard** — `/paper-autopilot-open:onboard` installs Node + Python dependencies, installs the Playwright MCP on consent (`claude mcp add playwright …`, loads after a Claude Code restart), writes config, auto-creates the corpus folders, semi-automatically registers your institution library proxy (you log in in the browser; credentials never touch the session), and builds the corpus + profiles + report. Your only manual step is dropping ~5 own + ~5 field PDFs (plus an optional ≤5 review PDFs) into a folder — you never hand-edit a JSON file.
- **Version management** — every output lands in a `[YYMMDD_content]` versioned folder; old versions are never overwritten.

## Pipeline

```
[ idea / figure set ]
        │
        ▼
   scaffold ............... 6-folder structure + CLAUDE.md hub + _paper.md tracker
        │
        ▼
   PRD / SOP ............. research plan (research-autopilot Phase 1)
        │
        ▼
   figure mockup ......... figure_set.md → ppt-image → 4K mockup PNGs
        │
        ▼
 experimental plan  <──>  academic writing
 (undergrad SOP,          (figure-first draft +
  gap analysis,            claim/hedge/move/AI-tell
  target metrics)          reviewers, corpus-grounded)
        │
        ▼ (loop: each new input/ dataset → mockup V_n+1 → manuscript V_n+1)
        │
        ▼
   submission ............ cover letter + format + bibliography audit
```

## Quick start

In Claude Code:

```
/plugin marketplace add SHSUN76/paper-autopilot-open
/plugin install paper-autopilot-open@paper-autopilot-open-marketplace
/paper-autopilot-open:onboard
```

The onboarding wizard handles pre-check, dependency install, the config file, corpus build, and verification. See [INSTALL.md](./INSTALL.md) for details and the manual path.

## Requirements

| Item | Required? | Used for |
|------|-----------|----------|
| Claude Code (latest) + Fable 5 access | **Required** | Plugin host; 13 writing agents pin `model: fable` |
| Node.js 18+ | **Required** | RAG helper scripts (`retrieve.mjs`, `build-corpus.mjs`) |
| `git` | **Required** | Plugin install / update |
| Gemini API key | **Required** | Figure mockups + default embeddings (`gemini-embedding-001`) |
| OpenAI API key | Optional | Alternate embedding provider (`text-embedding-3-large`) |
| Anthropic API key | Optional | API-path corpus mining (default path is subagent = free) |
| STORM API key | Optional | High-quality PDF parsing (`parse`) |
| Tavily API key | Optional | Web reference search (`ppt-image --ref`) |
| Materials Project API key | Optional | Crystal-structure / materials-property data (`materials-project` skill) |
| pandoc | Optional | Markdown → docx (`docx`) |
| Python 3.10+ | Optional | PDF parsing / figure extraction / docx (`pip install -r scripts/requirements.txt`: PyMuPDF, Pillow, python-docx, requests) |
| Playwright MCP | Optional | Institutional subscription access + semi-auto proxy registration (`paper-access`) |
| Supabase project | Optional | `rag.mode=supabase` cloud vector store |

## RAG architecture (two layers)

The retrieval system pairs a **fixed statistical prior** with **your own exemplars**:

1. **Bundled aggregate statistics (108 papers).** `skills/academic-writing/references/corpus-evidence.md` holds quantitative distributions (claim types, hedge levels, rhetorical-move transitions, AI-tell thresholds) mined from a 108-paper battery/materials survey. This is *statistics only* — no source text — and it grounds the review rules.
2. **User-built local corpus.** You tag your own ~5 papers + ~5 field papers (plus an optional ≤5 review papers) into paragraph reports and embed them into an on-disk vector store (`~/.claude/paper-autopilot-open/corpus`). This layer powers exemplar retrieval and voice grounding via `retrieve.mjs`. The build also emits two profiles — `style-profile.json` (your **own** writing voice / hedge / phrasing) and `field-profile.json` (**field** year range, top journals) — queryable via `retrieve.mjs style-profile` / `field-profile`, with `paragraphs --since <year>` to pull only recent field work. On top of the paragraph layer, own/field papers get a **vision figure pass**: a per-paper figure report (panels, per-figure key message, narrative role, story arc) that builds a searchable `figures.jsonl` + `figure-arcs.json`, queryable via `retrieve.mjs figures` / `figure-arcs`. A `corpus-report.html` visualizes the own↔field relationship map. (The **review** group is paragraph-tagged for knowledge retrieval only — excluded from the style profile and the figure pass.)

The prior says *what is normal*; your **own** corpus says *how you write* and your **field** corpus says *how your field actually writes*. Once your corpus passes ~30 papers, recalibrating the statistics on it is recommended. **Supabase** is an optional swap for the local store (`rag.mode=supabase` + `scripts/setup/corpus-schema.sql` + `ingest-supabase.mjs`); `disabled` turns RAG off for a reduced-quality offline mode.

## Cost transparency

| Operation | Cost | Notes |
|-----------|------|-------|
| Corpus embedding | **< $0.5 per 10 papers** (OpenAI) / **$0** (Gemini free tier) | One-time per paper; incremental afterwards |
| Figure image | **~$0.03/image** (flash) / **~$0.24/4K** (pro) | Pro reserved for 3D scheme figures |
| Corpus mining (PDF → tags) | **$0** | Runs on Claude Code subagents (subscription credits), not the API |

Cost-incurring steps announce the estimate and ask for consent before running.

## Commands & skills

**Commands** — full invocation is `/paper-autopilot-open:<name>`. Rows below are name-only.

| Command (name) | Purpose |
|---------|---------|
| `onboard` | First-run setup wizard (pre-check → install → config → corpus → verify) |
| `paper-autopilot` | Main orchestrator entry point (analyze folder, dispatch next stage) |
| `paper-autopilot:scaffold` | Create a new paper folder |
| `paper-autopilot:status` | Read-only stage report (no dispatch) |
| `paper-autopilot:resume` | Resume from last recorded action |
| `paper-autopilot:version` | Create a new `[YYMMDD_content]` versioned subfolder |
| `ppt-image` | Gemini figure/slide mockups (pro/flash routing, `--ref`) |
| `docx` | Markdown → Word via pandoc |
| `parse` | PDF parsing (+ figure extraction, optional STORM) |
| `review-paper` | 6-agent pre-submission referee report |
| `submission-prep` | Cover letter + submission readiness |

**Skills** (13): `onboarding`, `paper-autopilot`, `folder-scaffold`, `research-autopilot`, `academic-writing`, `experimental-plan`, `mockup-evolver`, `version-enforcer`, `pa-forcing-questions`, `pa-spec-review-loop`, plus three top-level research skills — `paper-access`, `paper-corpus-mining`, `pdf-figure-extract`. These coordinate **32 specialized agents** (orchestrators, phase writers, and reviewers).

## Language notice

Internal instructions and generated artifacts are in **Korean**. This English README is provided for orientation; full i18n is planned. The Korean guide is [README.ko.md](./README.ko.md).

## Documentation

- [INSTALL.md](./INSTALL.md) — install + setup (Korean, with an English summary)
- [WORKFLOW.md](./WORKFLOW.md) — workflow mental model + state model
- [references/style-guide.md](./references/style-guide.md) — writing style enforced by the reviewer agents
- [references/version-mgmt-rules.md](./references/version-mgmt-rules.md) — `[YYMMDD_content]` naming rules
- [CHANGELOG.md](./CHANGELOG.md) — release history

## License

MIT — see [LICENSE](./LICENSE). The RAG corpus is built from your own papers and is not redistributed.
