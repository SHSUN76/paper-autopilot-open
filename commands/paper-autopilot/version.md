---
description: "Create new versioned subdirectory for output/mockup/experimental_plan/input"
argument-hint: "<folder-type> <descriptor>  (e.g., mockup '지석피드백반영')"
allowed-tools: Read, Write, Bash, Task
---

# /paper-autopilot-open:paper-autopilot:version

Manually create a new versioned subdirectory following `[YYMMDD_내용]` convention.

## Arguments

User input: `<folder-type> <descriptor>`

- `<folder-type>`: one of `input`, `mockup`, `experimental_plan`, `output`, `output/figures`
- `<descriptor>`: free-form note (Korean/English)

## Procedure

### Step 1: Validate

- folder-type must be one of allowed values
- descriptor non-empty

### Step 2: Resolve current paper folder

Use CWD or first parent containing `_paper.md`.

### Step 3: Generate path

Today's date in config timezone (기본 Asia/Seoul): `YYMMDD`

Check existing dirs in `<paper>/<folder-type>/`:
- If `YYMMDD_*` exists → increment counter (`YYMMDD_v2_<descriptor>`, `_v3_`, ...)
- Else → `YYMMDD_<descriptor>`

### Step 4: Dispatch pa-version-enforcer to verify

```bash
node <plugin>/agents/pa-version-enforcer.md  # via Task
```

If valid → mkdir; else → propose correction to user.

### Step 5: Create directory + optional README

```bash
mkdir -p "<paper>/<folder-type>/<YYMMDD_descriptor>"
```

Optionally write `_README.md` with 1-line description from user input.

### Step 6: Report

```
✅ 생성: <path>
📝 다음: 이 폴더에 작업물 추가 후 /paper-autopilot-open:paper-autopilot 재호출
```

## Examples

```
User: /paper-autopilot-open:paper-autopilot:version mockup 지석피드백반영
You: → 생성: mockup/260430_지석피드백반영/

User: /paper-autopilot-open:paper-autopilot:version output v2초안
You: → 생성: output/260430_v2초안/
   (만약 같은 날 v1 폴더 있으면) → output/260430_v2_v2초안/

User: /paper-autopilot-open:paper-autopilot:version input 홍길동_EIS_데이터
You: → 생성: input/260430_홍길동_EIS_데이터/
```

## Constraints

- **simulations/ 폴더에는 사용 X** — 사용자 시뮬레이션 데이터 영역
- **reference/ 사용 시 [paper-slug]/ 컨벤션 따르기** (날짜 prefix 선택적)
- **descriptor에 path-unsafe char (`/`, `\`, `:`) 거부**
- **descriptor가 너무 길면 (50자 이상) 사용자 confirm**
