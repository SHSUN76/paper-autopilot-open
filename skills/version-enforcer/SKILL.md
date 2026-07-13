---
name: version-enforcer
description: |
  Enforces [YYMMDD_내용] version-management convention across all paper-autopilot outputs. Validates destination paths before any sub-skill writes a new file. Rejects writes to non-versioned locations and reroutes to correct versioned subdirectory.

  TRIGGER: paper-autopilot orchestrator dispatches before any file write. Also user invokes `/paper-autopilot-open:paper-autopilot:version` or asks "버전 어떻게 만들지", "새 버전 시작".
---

# Version-Enforcer Skill

Enforces version-management invariant: **every paper-autopilot output goes to a `[YYMMDD_내용]/` versioned subdirectory**. Old versions are never deleted.

## Setup

Read `../../references/version-mgmt-rules.md` before validating.

## Folders subject to version enforcement

| Folder | Enforcement |
|--------|------------|
| `input/` | ✅ enforced |
| `reference/` | ⚠️ slightly different — `[paper-slug]/` not `[YYMMDD_내용]/` |
| `simulations/` | ❌ not enforced (user-staged data uses its own `_plan/_execution/...` structure) |
| `mockup/` | ✅ enforced |
| `experimental_plan/` | ✅ enforced |
| `output/` | ✅ enforced |
| `output/figures/` | ✅ enforced |

## Naming rules

Format: `YYMMDD_<자유설명>` (date in config timezone, 기본 Asia/Seoul)

Valid examples:
- `260430_v1_초안`
- `260502_지석피드백반영`
- `260515_Acta투고최종`
- `260520_v3_BAI도입`
- `260601_XPS_added`

Invalid examples (must be rerouted):
- `v1` (no date)
- `2026-04-30` (wrong format, use YYMMDD)
- `latest` (semantic name without date)
- `temp/` (no version)

## Validation procedure

### When sub-skill requests file write

Input: target path like `mockup/figure_set.md`

```
1. Determine which top-level folder (mockup/, output/, etc.)
2. If folder is enforced (mockup/output/experimental_plan/input):
   a. Check path includes `[YYMMDD_내용]/` segment after top-level
   b. If missing → REJECT and propose corrected path
3. If folder is reference/:
   a. Check path includes `[paper-slug]/` segment
   b. If missing → REJECT
4. If folder is simulations/:
   a. Pass through (no version enforcement)
```

### Auto-reroute logic

If sub-skill writes to `mockup/figure_set.md` (missing version):
- Determine today's date in config timezone (기본 Asia/Seoul): `YYMMDD`
- Check existing mockup/ subdirs for current version naming pattern
- Propose: `mockup/{YYMMDD}_v{N+1}_{auto-suggest}/figure_set.md`
- Ask user to confirm or override the auto-suggest portion

### Pass-through mode

For `simulations/` writes (user-staged simulation data), version-enforcer does **NOT** intervene. That folder keeps its own structure (`_plan/_execution/...`).

## Constraints

- **NEVER allow overwriting existing files in older [YYMMDD_*] folder**
- **NEVER auto-delete old versions** — append-only
- **NEVER apply version enforcement to `_paper.md`, `CLAUDE.md`, `_README.md`** (these are top-level meta files)

## Output

Returns to caller:
- `valid: true` + canonical path
- OR `valid: false` + corrected path proposal + reasoning

## Edge cases

- **Same-day re-run**: if `260430_v1` exists, propose `260430_v2_<note>` (incremented counter)
- **Custom suffix from user**: respect user's chosen suffix as long as YYMMDD prefix is correct
- **Multiple writes in one stage**: same `[YYMMDD_내용]/` folder, multiple files — OK
- **Non-Korean note**: English note OK (e.g., `260430_v1_initial_draft`)
