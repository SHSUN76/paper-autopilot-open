---
description: "Resume paper-autopilot from last stage in specified or current paper folder"
argument-hint: "[<paper-folder-name>]"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
---

# /paper-autopilot-open:paper-autopilot:resume

Pick up where last session left off. Reads CLAUDE.md "다음 액션" + state, dispatches recommended skill.

## Argument

- No arg: resume current working directory's paper
- `<paper-folder-name>`: resume specific paper

## Procedure

### Step 1: State analysis

Dispatch `pa-state-analyzer` agent.

### Step 2: Read CLAUDE.md "다음 액션"

Get the explicit user-set next action line. This **overrides** state-analyzer's default recommendation if user wrote something specific.

### Step 3: Confirm with user

```
📄 <paper>
🎯 Stage: <stage>
🚦 Last "다음 액션": <line from CLAUDE.md>
🎯 Recommended dispatch: <skill>

진행할까요? (y/n/modify)
```

If user says modify, ask what to do differently.

### Step 4: Dispatch

After confirmation, dispatch `pa-orchestrator` agent with the chosen plan.

### Step 5: Update state

After dispatch completes, `pa-context-keeper` updates CLAUDE.md + _paper.md.

## Differences from /paper-autopilot-open:paper-autopilot main command

| 항목 | /paper-autopilot-open:paper-autopilot | /paper-autopilot-open:paper-autopilot:resume |
|------|------------------|------------------------|
| State analysis | always | always |
| User confirmation before dispatch | gate-based | always (single Y/N) |
| CLAUDE.md "다음 액션" weight | normal | 우선 고려 |

## Examples

```
User: /paper-autopilot-open:paper-autopilot:resume
You:
  📄 Cyclodextrin_Agglomeration
  🎯 Stage: MOCKUP_V_N (mockup/260502_v1 존재)
  🚦 Last "다음 액션": MD 시뮬레이션 완료 후 academic-writing 시작
  🎯 Recommended dispatch: academic-writing WRITE (figure-first)

  진행할까요?
```

## Constraints

- **항상 사용자 확인**: 다른 sub-command와 달리 무조건 confirm 받기 (resume은 의도적 행동)
- **CLAUDE.md "다음 액션" 우선**: 사용자가 명시한 게 있으면 그것
