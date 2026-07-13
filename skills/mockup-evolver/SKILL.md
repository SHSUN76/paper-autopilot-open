---
name: mockup-evolver
description: |
  Evolves a mockup from V_n to V_n+1 when new input data arrives. Reads the latest mockup version, the new input data, and produces a differential V_n+1 mockup that replaces hypothetical figure data with real measurements while preserving still-hypothetical sections. Tightly coupled with academic-writing CORRECT mode for downstream manuscript update.

  TRIGGER: paper-autopilot detects new input/[YYMMDD]/ folder newer than mockup/<latest>/, user says "mockup 갱신", "V2 만들어", "새 데이터 반영", or asks "이 데이터 어떻게 figure에 넣지".
---

# Mockup-Evolver Skill

Drives the **feedback loop**: real data progressively replaces hypothetical mockup data, manuscript updates differentially.

This skill exists because `/research-autopilot` only generates V1 mockups (no differential mode). mockup-evolver fills that gap.

## Setup

Read `references/diff-strategy.md` for how to compare V_n mockup figures to new input data.

## Inputs

- `mockup/<latest_version>/` — current V_n mockup files (`paper_logic.md`, `figure_set.md`, `*.png`)
- `input/<latest_version>/` — newly arrived data (CSV, images, notes)
- `_paper.md` — for target_journal, blockers list
- `experimental_plan/<latest>/` — for which experiments produced this data (link metadata)

## Outputs

Creates new versioned mockup folder:

```
mockup/[YYMMDD_v_n+1]/
├── paper_logic.md             ← updated storyline (delta noted)
├── figure_set.md              ← updated figure spec (which data is real now)
├── *.png                       ← updated figures (replaced where data exists)
├── DIFF.md                     ← what changed from V_n
└── data_provenance.md          ← which input/[YYMMDD]/ feeds which figure
```

Plus updates:
- CLAUDE.md "최신 mockup" link
- `_paper.md` `progress` (typically increased by 5-15%)
- `_paper.md` `updated`

## Procedure

### Phase 1: Identify drift

1. Read `mockup/<latest>/figure_set.md` — list all expected data points
2. Read `input/<latest>/` — extract available real data
3. Build matching matrix: figure × data → status (hypothetical / partial / real)

### Phase 2: Decide V_n+1 scope

Three modes:

| Mode | Trigger | Action |
|------|---------|--------|
| **Minor** | 1-2 figures get new data, others unchanged | Update only affected figures, copy rest forward |
| **Substantial** | 3+ figures change OR storyline pivot needed | Full V_n+1 rebuild with explicit DIFF.md |
| **Pivot** | data contradicts V_n hypothesis | Storyline rewrite, may require experimental-plan rerun |

Ask user to confirm mode.

### Phase 3: Generate V_n+1

#### For each figure with new data:
1. Replace placeholder/mockup graphics with real plots
2. Update figure_set.md entry: `status: hypothesis → real`, add data_source link
3. If interpretation changes, mark in `DIFF.md` for downstream academic-writing CORRECT

갱신 대상 figure가 3개 이상(Substantial/Pivot)이면 figure별 갱신을 병렬 subagent로 위임하고, DIFF.md 작성 시 결과를 수합해 figure 간 해석 일관성을 교차 확인한다.

#### For storyline:
1. Update `paper_logic.md`:
   - If pivot: rewrite affected sections
   - If minor: edit-in-place with diff annotations
   - Always preserve §Limitations history (append, not overwrite)
2. Update Bell-curve/regime/threshold values if they depended on hypothetical θ etc.

#### For limitations:
- Move resolved limitations from `Limitations` to `Validation history`
- Add new limitations exposed by new data

### Phase 4: Generate DIFF.md

Required artifact for academic-writing CORRECT to know what manuscript sections to revise:

```markdown
# DIFF V_{n+1} ← V_{n}

## Figures changed
- Fig 2b: hypothesis (D_xy=0.05) → real (D_xy=0.061)
- Fig 4 (NEW): XPS S vs L-NCM ratio = 3.8× (validates θ assumption)

## Storyline impact
- §Bell-curve regime threshold: was θ~4 hypothesis, now empirically supported
- §Limitations §4 (XPS missing): RESOLVED → moved to validation history

## Manuscript sections to revise (for academic-writing CORRECT)
- Abstract: add quantitative XPS support
- Results §3.2: replace "hypothesized" with "measured"
- Discussion §4: add §4.3 cross-validation of MD ↔ XPS
- Limitations: remove §4, add new §4 about polymer network not yet tested
```

### Phase 5: Trigger academic-writing CORRECT

Output to paper-autopilot orchestrator:
- `mockup/[new]/DIFF.md` ready
- Recommend: dispatch `academic-writing` in CORRECT mode with `--from-mockup-diff <path>`

academic-writing reads DIFF.md, uses aw-prose-polisher to update only affected manuscript paragraphs (not full re-draft).

## Constraints

- **NEVER overwrite mockup/<old_version>/** — always create new `[YYMMDD_v_n+1]/`
- **NEVER lose limitations history** — append-only
- **NEVER skip DIFF.md** — academic-writing CORRECT depends on it
- **ALWAYS preserve provenance** — every real figure links back to input/[YYMMDD]/

## Edge cases

- **Data contradicts hypothesis (Pivot mode)**: warn user explicitly. Don't auto-rewrite without confirmation. Suggest experimental-plan rerun.
- **Partial data**: figure may have 50% real + 50% hypothesis. Mark this clearly in figure_set.md.
- **Same-day rerun**: V_n+1 exists for today, user wants V_n+2. Use `_v2`, `_v3` suffix.

## Performance budgets

| Mode | Time | RAG calls |
|------|------|-----------|
| Minor | 5-10 min | 0 (no RAG needed) |
| Substantial | 15-25 min | 2-3 (verify storyline) |
| Pivot | 30-60 min | 5+ (re-justify narrative) |

## Footer

mockup-evolver is the **engine of the feedback loop**. Without it, paper-autopilot is one-shot. With it, every new data point compounds the manuscript's evidential support.

External docs:
- `../../references/version-mgmt-rules.md` — [YYMMDD_v_n+1] naming
- `../academic-writing/SKILL.md` — CORRECT mode that consumes DIFF.md
