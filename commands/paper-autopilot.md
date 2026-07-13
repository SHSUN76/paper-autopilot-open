---
description: "Paper-autopilot 메인 진입점 — 폴더 분석 + 다음 단계 자동 진행"
argument-hint: "[<paper folder> | scaffold <name> | status | resume | <natural language gate instruction>]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---

# /paper-autopilot-open:paper-autopilot

You are dispatching the `paper-autopilot` orchestrator skill. Load that skill via Skill tool, then follow its instructions exactly.

## Argument parsing

User input: $ARGUMENTS

Detect mode:

1. **No arguments** OR **`status`**: Run STATUS mode — analyze current folder, report stage, propose next action without dispatching.

2. **`scaffold <name>`**: Run NEW mode — invoke folder-scaffold skill to create new paper.

3. **`resume`** OR **<paper folder>**: Run RESUME mode — read folder state, infer current stage, propose next dispatch.

4. **Natural language gate instruction** (e.g., "G1-G3 자동, G4부터 물어봐"): Run with parsed gate routing.

5. **`evolve`** OR detected new input data: Run EVOLVE mode — dispatch mockup-evolver.

## Procedure

### Step 1: Skill load

Use Skill tool to load `paper-autopilot` skill from `skills/paper-autopilot/SKILL.md`.

### Step 2: State analysis

Dispatch `pa-state-analyzer` agent (if available) or read directly:
- `_paper.md` frontmatter
- `mockup/` latest version
- `output/` latest version
- `simulations/_execution/status.yaml`
- `experimental_plan/` latest

### Step 3: Gate routing

If user provided natural-language gate instruction, dispatch `pa-gate-router` agent to parse.

### Step 4: Dispatch next skill

Per state-analyzer output, dispatch the right sub-skill:
- NEW → folder-scaffold
- FOLDER_READY → research-autopilot
- MOCKUP_V_N → academic-writing
- DRAFT_V_N → experimental-plan
- EVOLVE_PENDING → mockup-evolver
- SUBMIT_READY → academic-writing CORRECT (cover letter + format)

### Step 5: Always update CLAUDE.md hub + _paper.md

Dispatch `pa-context-keeper` agent at stage end to update:
- CLAUDE.md "다음 액션" line
- CLAUDE.md "변경 이력" table
- `_paper.md` `updated` / `progress` / `status`

### Step 6: Report to user

Concise report (1-3 sentences) on what was done, what's next, what gate is open.

## Examples

### Example 1: Brand new paper
```
User: /paper-autopilot-open:paper-autopilot scaffold "Sb2S3_NewWork"
You: [load paper-autopilot skill] → folder-scaffold → "✅ 폴더 생성. 다음: _paper.md/CLAUDE.md 수동 작성 후 /paper-autopilot-open:paper-autopilot 재호출."
```

### Example 2: Existing paper, status check
```
User: /paper-autopilot-open:paper-autopilot
You: [analyze CWD or current paper] → "현재 stage: MOCKUP_V_N (mockup/260502_v1 존재). 다음 액션: academic-writing WRITE 시작? (G2 게이트)"
```

### Example 3: Auto-progression instruction
```
User: /paper-autopilot-open:paper-autopilot G1-G3까지 자동, G4부터 물어봐줘
You: [parse instruction → auto: G1, G2, G3; ask: G4-G6] → dispatch chain → pause at G4
```

### Example 4: New data evolved
```
User: [drops files in input/260510_XPS]
User: /paper-autopilot-open:paper-autopilot evolve
You: → mockup-evolver → "mockup V2 생성: mockup/260510_v2_XPS_added/. DIFF.md 생성. academic-writing CORRECT 진행?"
```

## Constraints

- **Always invoke paper-autopilot skill first** (never reimplement orchestration)
- **Always update CLAUDE.md hub** at stage end
- **Always enforce version-management** (delegate to version-enforcer agent)
- **Never delete old [YYMMDD_*] folders**
- **Pause at decision gates** unless user explicitly auto-routed
