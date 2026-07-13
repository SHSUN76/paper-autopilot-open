---
name: folder-scaffold
description: |
  Creates new paper folders with the standard 6-folder structure (input/reference/simulations/mockup/experimental_plan/output) plus CLAUDE.md hub and _paper.md tracker. Enforces [YYMMDD_내용] version-management convention from day 1.

  TRIGGER: user invokes `/paper-autopilot-open:paper-autopilot:scaffold <name>`, says "새 논문 폴더", "폴더 만들어줘", "scaffold paper", or paper-autopilot orchestrator detects NEW mode (folder doesn't exist).
---

# Folder-Scaffold Skill

Creates a new paper project folder following the paper-autopilot standard.

## Setup

Read `templates/CLAUDE.md.template` and `templates/_paper.md.template` before scaffolding.

## Standard 6-folder structure

```
{paper_folder}/
├── CLAUDE.md                          ← hub (auto-loaded by Claude Code)
├── _paper.md                          ← YAML tracker
├── input/                             ← user RAW data
│   └── [YYMMDD_내용]/
├── reference/                         ← reference papers + metadata + logic
│   └── [paper-slug]/
├── simulations/                       ← user-staged simulation result data
│   └── (filled by the user's own simulation setup)
├── mockup/                            ← storyline + figure mockup
│   └── [YYMMDD_내용]/
├── experimental_plan/                 ← undergrad-level lab SOP
│   └── [YYMMDD_내용]/
└── output/                            ← final manuscript + figures
    ├── [YYMMDD_내용]/
    └── figures/[YYMMDD_내용]/
```

## Procedure

### Step 1: Get paper name from user

If user said `/paper-autopilot-open:paper-autopilot:scaffold "<name>"`, use that.
Otherwise prompt: "논문 폴더명을 입력해주세요 (예: Sb2S3_NewWork):"

### Step 2: Validate

- No spaces preferred (use underscore)
- Reject if folder already exists
- Reject if name conflicts with reserved words

### Step 3: Run scaffold script

```bash
bash scripts/scaffold.sh "<paper_name>" "<papers_root>"
```

Where `<papers_root>` from config (`papers_root` setting).

### Step 4: Initialize CLAUDE.md hub

Copy `templates/CLAUDE.md.template` to `<paper>/CLAUDE.md` and fill placeholders:
- `{title}` — ask user (or "TBD" initially)
- `{first_author}` — from config `default_first_author`
- `{target_journal}` — ask user (or from config `default_target_journals[0]`)

### Step 5: Initialize `_paper.md`

Copy `templates/_paper.md.template` and fill frontmatter:
- `title`: empty initially or user-supplied
- `journal`: empty or default
- `first_author`: from config
- `created`/`updated`: today (config timezone, 기본 Asia/Seoul)
- `status`: 아이디어
- `progress`: 0
- `verified`: false

### Step 6: Initialize `_README.md` files

Copy each `templates/sub-readmes/<folder>_README.md` to `<paper>/<folder>/_README.md`.

### Step 7: Report to user

```
✅ 폴더 생성 완료: <papers_root>/<paper_name>/

다음 단계:
1. `_paper.md`의 title/journal 채우기
2. CLAUDE.md "다음 액션" 줄 작성
3. /paper-autopilot-open:paper-autopilot 재호출 → research-autopilot V1 시작
```

## Constraints

- **NEVER overwrite existing folder** — abort if folder exists
- **NEVER create folders outside `papers_root`**
- **ALWAYS create all 6 folders + 2 metafiles** — partial scaffolding leaves bad state
- **ALWAYS use [YYMMDD_내용] convention** — placeholder dirs initialized empty (not pre-filled with dummy versions)

## Output

Returns to paper-autopilot orchestrator:
- Path to new folder
- `current_stage = FOLDER_READY`
- Suggested next: research-autopilot Phase 1
