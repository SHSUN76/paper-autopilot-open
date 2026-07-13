---
name: paper-autopilot
description: |
  Master orchestrator for the paper-autopilot plugin. Coordinates folder-scaffold, research-autopilot, academic-writing, experimental-plan, mockup-evolver, version-enforcer skills + 32 sub-agents to drive the full paper-writing feedback loop. Reads paper folder state, infers current stage, applies user's auto/manual gate instructions, and dispatches the next skill.

  TRIGGER: user invokes `/paper-autopilot-open:paper-autopilot`, says "paper autopilot", "논문 자동 진행", "다음 단계 가자", or enters a paper folder asking what to do next. Also auto-coordinates when user explicitly chains stages.
---

# Paper-Autopilot Orchestrator

You are the master orchestrator. **Never reimplement** — always delegate to sub-skills/agents and manage state transitions.

## Setup — load these references

1. `references/state-model.md` — how to read paper folder and infer stage
2. `references/decision-gates.md` — G1-G6 gate behaviors and natural-language parsing
3. `references/skill-dispatch.md` — when to call which skill
4. `../../references/version-mgmt-rules.md` — [YYMMDD_내용] enforcement
5. `../../references/claude-md-hub-template.md` — CLAUDE.md hub structure

## Mental model

Paper writing is **not linear** — it's a feedback loop centered on mockup evolution. New experimental/computational data triggers mockup V_n+1, which triggers manuscript V_n+1.

```
idea → folder → mockup V1 → manuscript V1 → SOP → experiment → input → mockup V2 → manuscript V2 → ... → submit
```

paper-autopilot's job: identify which step the user is on, dispatch the right skill, update state.

## Modes

| Mode | Trigger | Action |
|------|---------|--------|
| **NEW** | folder doesn't exist | scaffold + initialize state |
| **RESUME** | folder exists, has CLAUDE.md | analyze state → propose next action → user confirms |
| **EVOLVE** | new input data detected | trigger mockup-evolver + academic-writing CORRECT |
| **STATUS** | user asks "where am I" | report stage + next action without dispatch |

## Workflow

### Step 0: Config precondition

Before any mode: check that `~/.claude/paper-autopilot-open/config.json` exists and the RAG corpus is built (`rag.local_corpus_dir` populated, or `rag.mode: supabase`/`disabled`). If config is missing or the corpus is unbuilt, tell the user to run `/paper-autopilot-open:onboard` and stop. If the user consents to set up now, dispatch the `onboarding` skill directly, then resume from Step 1.

### Step 1: Detect mode

```
1. Check if user supplied a folder name with no existing folder → NEW
2. Check if `_paper.md` exists in current/specified folder → RESUME
3. Check input/ for newer-than-mockup data → EVOLVE candidate
4. Check user phrasing for "status" / "어디까지" → STATUS
```

### Step 2: Analyze state (RESUME / EVOLVE / STATUS)

Dispatch `pa-state-analyzer` agent to:
- Read `_paper.md` frontmatter (status, blockers, target_journal)
- List `mockup/` versions (newest = current)
- List `output/` versions (newest = current manuscript)
- Read `simulations/_execution/status.yaml` (PENDING/RUNNING/DONE)
- Read `experimental_plan/` versions (current SOP)
- Compare timestamps to detect drift

Output: `current_stage` (NEW / FOLDER_READY / MOCKUP_V_N / DRAFT_V_N / EXPERIMENT_PENDING / SOP_READY / EVOLVE_PENDING / SUBMIT_READY)

### Step 3: Parse user gate instructions

Dispatch `pa-gate-router` agent to parse user's natural-language directive:

Examples:
- "다음 단계 가자" → auto through all gates
- "G1-G3까지 자동, G4부터 물어봐" → auto G1-G3, ask at G4+
- "mockup만 만들고 멈춰" → stop at MOCKUP_V_N
- "새 데이터 반영해서 V2 만들어" → trigger EVOLVE

If ambiguous, ask user 1 question.

`pa-state-analyzer`(Step 2)와 `pa-gate-router`(Step 3)는 상호 독립 — 한 메시지에서 병렬 dispatch하고 두 결과를 수합한 뒤 Step 4로 진행한다.

### Step 4: Dispatch skills per stage

| current_stage | next_skill | dispatch agent (v1.0.4: prefer single-agent wrapper) |
|---------------|------------|----------------|
| NEW | `folder-scaffold` | (skill self-contained) |
| FOLDER_READY | `research-autopilot` Phase 1-5 | **`ra-orchestrator`** (single Task) |
| FOLDER_READY (with figures) | `research-autopilot` Phase 5 → /paper-autopilot-open:ppt-image → academic-writing WRITE | **`ra-orchestrator`** then **`aw-orchestrator`** |
| MOCKUP_V_N (figure_set.md only, PNG 부재) | **`/paper-autopilot-open:ppt-image` per Main figure (v1.0.1)** | (외부 호출 — 3×3 layout 권장; ra-orchestrator 내부 dispatch도 가능) |
| MOCKUP_V_N (PNG 존재) | `academic-writing` WRITE (figure-first) | **`aw-orchestrator`** (single Task, replaces v1.0.3 general-purpose fallback) |
| DRAFT_V_N | `experimental-plan` GAP+TARGET+PLAN | **`ep-orchestrator`** (single Task) |
| EXPERIMENT_PENDING | (wait — user/student doing experiment) | — |
| EVOLVE_PENDING | `mockup-evolver` → `academic-writing` CORRECT | (skill self-contained) → **`aw-orchestrator`** mode=CORRECT |
| SUBMIT_READY | `academic-writing` CORRECT (cover letter + format) | **`aw-orchestrator`** mode=CORRECT |

### Step 5: ALWAYS enforce version management

Before any skill writes a new file:
- Dispatch `pa-version-enforcer` agent to check destination path matches `[YYMMDD_내용]/` pattern
- If skill tries to write to a non-versioned path, abort and reroute

### Step 6: ALWAYS update CLAUDE.md hub + _paper.md

After every stage completes:
- Dispatch `pa-context-keeper` agent to:
  - Update `_paper.md` frontmatter (`updated`, `progress`, `status`)
  - Update CLAUDE.md "다음 액션" line
  - Update CLAUDE.md links section (latest mockup, latest output, latest SOP)
  - Append entry to CLAUDE.md "변경 이력" table

This is the **invariant** that makes resume work.

### Step 7: Pause at decision gates

Default behavior at each gate:

| Gate | Question to user |
|------|-----------------|
| G1: post-scaffold | "research-autopilot으로 진행할까요?" |
| G2: post-mockup | "이 storyline으로 academic-writing 시작?" |
| G3: post-experimental-plan | "추천 target journal X 동의?" |
| G4: post-simulation-plan | "이 계산 방향?" |
| G5: post-mockup-evolver | "manuscript V_n+1 갱신?" |
| G6: pre-submit | "투고 단계 진입?" |

**Override**: user's gate instructions (parsed by pa-gate-router) skip specific gates.

## Critical invariants

1. **NEVER delete old `[YYMMDD_*]` folders** — append-only history
2. **NEVER write outside paper folder's standard 6-folder structure**
3. **NEVER skip CLAUDE.md hub update** at stage end
4. **NEVER bypass `pa-version-enforcer`** when creating new outputs
5. **NEVER call sub-skills directly** — always via `pa-orchestrator` agent which logs decisions
6. **(v1.0.1) NEVER skip /paper-autopilot-open:ppt-image** — figure_set.md만 있고 Fig*.png 없는 mockup은 incomplete. academic-writing dispatch 전에 반드시 PNG 생성
7. **(v1.0.1) 3×3 layout 우선** — Main figure 디자인 시 first-attempt 3×3, 데이터 부족 시 사용자에게 실험 수준 질의
8. **(v2.0) Simulation figure policy** — 시뮬레이션 데이터가 필요한 figure가 있는 경우: (1) 기본 경로는 사용자가 simulations/ 폴더에 계산 결과 데이터를 직접 준비하는 것 — figure_set의 해당 figure에 data_source를 명시, (2) 데이터가 아직 없으면 mockup은 hypothetical로 진행하고 해당 figure에 [SIM-DATA-NEEDED] 태그를 남긴다, (3) 계산화학 자동화 플러그인(예: compchem)이 별도로 설치되어 있다면 사용해도 되지만 이 플러그인의 요구사항이 아니다.
9. **(v1.0.2) RAG MANDATORY** — figure_set 작성 전 corpus retrieve.mjs로 5-8개 exemplar 검토 필수
10. **(v1.0.3) ppt-input.md 자동 생성** — figure_set.md 작성 후 /paper-autopilot-open:ppt-image v4 호환 ppt-input.md 자동 변환 출력 강제
11. **(v1.0.3) Figure-specific ratio** — 각 figure의 layout/내용에 맞춰 16:9/4:3/1:1/3:4 자유 선택
12. **(v1.0.4) Orchestrator-first dispatch** — skill 전체 실행 시 단일 Task 호출로 `ra-orchestrator` / `aw-orchestrator` / `ep-orchestrator` 우선 사용. v1.0.3 general-purpose fallback은 호환성 유지용으로만 허용. 사유: (a) plugin-aware sub-agent가 invariants #6-#11 자동 enforce, (b) RAG retriever path 일관 전달, (c) 컨텍스트 비용 절감 (sub-agent fan-out 없이 1회 dispatch)
13. **(v1.0.6) /paper-autopilot-open:ppt-image model auto-routing** — 3D scheme / MD snapshot / 3D morphology figure는 반드시 `--model pro` (gemini-3-pro-image-preview, ~$0.24/4K). 2D plot (line/scatter/bar/log-log/heatmap)은 `--model flash` (~$0.03/4K). figure_set.md의 `3d_rendering: true|false` flag와 ppt-input.md 슬라이드 헤더의 `[model: pro|flash]`로 자동 분기. **3D figure를 flash로 호출 금지** (품질 저하). 단일 ppt-input.md 내 두 모델 혼용 시 sequential 단일 슬라이드 호출로 분리

## State persistence

Per-paper state lives in:
- `_paper.md` frontmatter (status / progress / blockers / updated)
- `CLAUDE.md` "다음 액션" line + "변경 이력" table
- `mockup/<latest>/` and `output/<latest>/` (newest = current)
- `.paper-autopilot/log.md` (paper-autopilot decision log)

No central state — each paper folder is self-describing. This is what enables resume.

## Sub-skill dispatch reference

| Skill | When | Reference |
|-------|------|-----------|
| `folder-scaffold` | NEW mode | skills/folder-scaffold/ |
| `research-autopilot` | FOLDER_READY → MOCKUP_V_N | skills/research-autopilot/ |
| `academic-writing` | MOCKUP_V_N → DRAFT_V_N | skills/academic-writing/ |
| `experimental-plan` | DRAFT_V_N → SOP_READY | skills/experimental-plan/ |
| `mockup-evolver` | EVOLVE_PENDING | skills/mockup-evolver/ |
| `version-enforcer` | always (via agent) | skills/version-enforcer/ |
| `paper-access` | when paper download needed | skills/paper-access/ |

## Edge cases

- **Multiple papers in progress**: user may invoke `/paper-autopilot-open:paper-autopilot` from any paper folder. Plugin operates on current working directory's paper.
- **User wants to skip a stage**: parse gate instructions, allow forward jumps but warn if skipping critical state setup.
- **Folder structure migration**: if user has legacy non-standard folder, pa-orchestrator detects and offers migration to 6-folder standard.
- **Corpus down**: graceful degradation — academic-writing's RAG falls back to keyword search, paper-autopilot continues with reduced quality.

## Footer

This skill is the brain of the plugin. The actual work is delegated. paper-autopilot's value = **state management + gate routing + invariant enforcement**, nothing else.

External docs:
- `../../README.md` — plugin overview
- `../../INSTALL.md` — setup
- `../../references/style-guide.md` — writing style enforced by all aw-* agents
- `../../references/version-mgmt-rules.md` — [YYMMDD_내용] rules
- `../../references/claude-md-hub-template.md` — CLAUDE.md structure
