---
description: "Report current stage of paper folder(s) without dispatching"
argument-hint: "[<paper-folder-name> | --all]"
allowed-tools: Read, Glob, Grep, Bash, Task
---

# /paper-autopilot-open:paper-autopilot:status

Read-only status report. No skill dispatch.

## Argument

- No arg: report current working directory's paper status
- `<paper-folder-name>`: report specific paper
- `--all`: report all papers under `papers_root`

## Procedure

### Single paper mode

1. Resolve paper folder path
2. Dispatch `pa-state-analyzer` agent (read-only)
3. Format output:

```
📄 Paper: <name>
🏷️  Status: <_paper.md status>, progress <%>%
🎯 Stage: <inferred stage>
📂 Latest:
   - mockup: <path or "none">
   - output: <path or "none">
   - experimental_plan: <path or "none">
   - input: <path or "none">
🚦 Next action (CLAUDE.md): <"다음 액션" line>
🎯 Recommended dispatch: <skill> <args>
⚠️  Warnings: <list or "none">
```

### --all mode

1. Find all paper folders under `papers_root` (folders containing `_paper.md`)
2. For each, run state-analyzer (parallel where possible)
3. Output table:

```
| Paper | Status | Progress | Stage | Next |
|-------|--------|----------|-------|------|
| Cyclodextrin | 초고작성 | 70% | DRAFT_V_N | academic-writing CORRECT |
| JMCA | 초고작성 | 60% | MOCKUP_V_N | academic-writing WRITE |
| ...
```

Sort by deadline (if `_paper.md.deadline` exists), then by progress descending.

## Constraints

- **Read-only**: 절대 file 수정 X
- **No dispatch**: skill 호출 X
- **Fast**: --all mode도 30초 이내 완료 권장 (병렬 처리)

## Examples

```
User: /paper-autopilot-open:paper-autopilot:status
You: [report current folder]

User: /paper-autopilot-open:paper-autopilot:status Cyclodextrin_Agglomeration
You: [report specific paper]

User: /paper-autopilot-open:paper-autopilot:status --all
You: [table of all papers]
```
