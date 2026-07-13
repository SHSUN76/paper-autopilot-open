---
name: pa-forcing-questions
description: |
  paper-autopilot v1.1.0+ G1/G2 게이트 forcing question dispatcher.
  G1 (post-scaffold, pre-PRD)에서 5 universal forcing question으로 PI/학생의 개념구축
  모호성을 강제 노출. push-until-specific 패턴으로 ≥1 specific anchor 충족 시까지
  최대 3 round 재질문, 미달 시 BLOCK surface (P6 User Sovereignty 30초 confirm).
  G2 (post-mockup, pre-WRITE) 는 v1.1.0-alpha 단계 placeholder stub.

  TRIGGER: paper-autopilot orchestrator가 NEW mode에서 folder-scaffold 직후 G1 도달 시
  자동 dispatch. 또는 사용자가 `/pa-forcing-questions G1 <paper-folder>` 명시 호출.
  PRD draft 작성 전에 PI/학생 개념을 specific하게 push하는 것이 목적.
allowed-tools: Read, Write, Edit, AskUserQuestion, Task, Bash
---

# pa-forcing-questions Skill

paper-autopilot의 G1/G2 게이트에서 forcing question을 dispatch하는 skill. Phase 0 paper prototype에서 검증된 PI 워딩 5개를 그대로 wrap. PI/학생이 답하는 동안 anchor judge가 specific anchor 충족 여부 inline 판정, 부족 시 push-until-specific 재질문.

## 작동 원리 (Phase 0 검증됨)

```
paper-autopilot NEW
  ↓ folder-scaffold
  ↓ G1 게이트 (post-scaffold, pre-PRD)
  ↓ pa-forcing-questions dispatch ← (THIS SKILL)
  ↓   ├── config/forcing_questions_G1.md (PI 워딩 5 dim) load
  ↓   ├── Dim 1-5 순차 AskUserQuestion
  ↓   ├── 각 답에 anchor judge (regex Tier 1 → LLM Tier 2 fallback)
  ↓   ├── specific 1 → proceed | 0 → retry (max 3 round) → BLOCK surface
  ↓   └── forcing-q-results-G1-{datetime}.md 저장
  ↓ G2 게이트는 alpha에서 placeholder stub
  ↓ research-autopilot (ra-prd-author) ← capture file을 input으로 받음
```

## 입력

1. Paper folder 경로 (argument or current working dir)
2. `config/forcing_questions_G1.md` (PI 워딩 5 universal dim) — required
3. `config/forcing_questions_G2.md` (G2 placeholder, alpha stub) — optional
4. Gate marker: G1 or G2 (default G1)

## 출력

`{paper_folder}/forcing-q-results-G1-{YYYYMMDD-HHMMSS}.md`:

```markdown
# G1 Forcing Question Results
Paper: {title}
Date: {iso}
Session wall-clock: {minutes}

## Dim 1-5 (각각)
Question: {PI 워딩}
Answer (round 1): {PI 답}
Anchor judge: specific=1|0, regex_hit=[...], LLM_verdict=PASS|BLOCK
(round 2, 3 if retry)
Final: PROCEED | BLOCK_SURFACED

## AMB Capture (PI self or LLM-assisted)
{ambiguity items list}
```

## Workflow

### Step 0: Argument parse
1. Argument 1 = paper folder path (없으면 current dir)
2. Argument 2 = gate ("G1" or "G2", default "G1")
3. `paper_folder/_paper.md` exists 확인 — 없으면 BLOCK ("paper folder가 scaffold되지 않음, /paper-autopilot-open:paper-autopilot:scaffold 먼저 호출하세요")

### Step 1: Load config

```bash
PAPER="$1"
GATE="${2:-G1}"
CONFIG="${PAPER%/}/../config/forcing_questions_${GATE}.md"
# 또는 paper folder 자체에 config 있으면 그것 우선
[ -f "$PAPER/config/forcing_questions_${GATE}.md" ] && CONFIG="$PAPER/config/forcing_questions_${GATE}.md"
```

config 파일에서 5 dim 워딩 추출 (markdown "### PI 작성 영역" 블록 다음 blockquote).

G2가 placeholder stub인 경우: AskUserQuestion으로 "G2는 v1.1.0-alpha에서 placeholder stub. rc1+에서 실제 구현. 게이트 통과로 처리할까요?" → A: 통과 / B: 사용자 manual workflow

### Step 2: Initialize capture file

```bash
TS=$(date +%Y%m%d-%H%M%S)
OUT="$PAPER/forcing-q-results-${GATE}-${TS}.md"
# header write
```

### Step 3: Sequential dispatch 5 dim (G1 actual)

For each dim in [1, 2, 3, 4, 5]:

1. **AskUserQuestion** with PI 워딩 그대로 (single question, no options — open-ended)
   - 다만 AskUserQuestion은 multi-option이 native이므로 단일 open-ended는 "답을 길게 적어주세요" 형식 또는 사용자가 자유 응답 적도록 prompt 안내. alpha = paper prototype에서 했던 dialogue 방식 그대로 wrap.

2. **Anchor judge (round 1)**:

   **Tier 1 — Regex match (cheap, 80% case cover)**:
   ```bash
   # specific anchor type per design doc Definitions:
   #   concept name / measurement type / citation key / target reader / falsifiable claim
   ANSWER="$pi_response_round_1"
   REGEX_HITS=()
   # Citation key pattern
   echo "$ANSWER" | grep -qE '[A-Z][a-z]+\s*(et al\.?)?\s*\(?\d{4}\)?' && REGEX_HITS+=("citation")
   # 숫자 + 단위 (정량 metric)
   echo "$ANSWER" | grep -qE '\d+(\.\d+)?\s*(mA|mAh|V|nm|μm|°C|cm|h|K|cycle|wt%|mol%|%)' && REGEX_HITS+=("quantitative")
   # Technique name (specific measurement type)
   echo "$ANSWER" | grep -qiE 'XRD|XPS|FT-?IR|Raman|FIB-?SEM|TEM|in-?situ|operando|DFT|MD|BET|NMR|GCD|EIS|CV|XAS|Mossbauer' && REGEX_HITS+=("technique")
   # Specific concept noun (heuristic: 4+ char noun + measurable property)
   # alpha 단계 = LLM Tier 2로 위임
   
   [ ${#REGEX_HITS[@]} -ge 1 ] && TIER1_SPECIFIC=1 || TIER1_SPECIFIC=0
   ```

   **Tier 2 — LLM fallback (if Tier 1 = 0)**:
   ```
   Task tool dispatch with sub-LLM:
   prompt: "PI 응답을 보고 specific anchor 포함 여부를 판정.
            specific anchor type = [concept name / measurement type /
            citation key / target reader / falsifiable claim] 중 ≥1.
            output 형식: '0' 또는 '1' + 1-sentence reason.
            Response: {pi_answer}"
   
   Parse: ^[01] regex로 verdict 추출
   ```

3. **Verdict**:
   - specific = 1 → proceed to next dim, capture file에 기록
   - specific = 0 → retry round 2/3
   - 3 round 모두 미달 → BLOCK surface

4. **Push retry message** (round 2/3 시):
   ```
   "답에 specific anchor가 부족합니다. specific anchor type =
    [concept name / measurement type / citation key / target reader /
    falsifiable claim] 중 ≥1을 명시적으로 포함하도록 다시 답해주세요.
    이전 답: {previous}
    Round {N}/3."
   ```

5. **BLOCK surface** (3 round 후도 미달):
   ```
   AskUserQuestion:
   "Dim {N} forcing question에 3 round 모두 specific anchor 미달.
    P6 User Sovereignty per design doc — 사용자가 다음 행동 결정:"
   options:
   - A) "이대로 진행 (BLOCK 인정, PRD draft에서 이 dim 다시 다룰 예정)"
   - B) "round 4 추가 (skill rule 위반, 사용자 명시 override)"
   - C) "G1 abort + paper folder 재설계"
   wait 30초 (P6 confirm window)
   ```

### Step 4: AMB capture

5 dim 완료 후:
1. PI에게 "AMB items capture 방식 선택":
   - **PI self-capture** (PI 도메인 인접 또는 깊게 아는 영역): "내가 직접 PRD-affecting AMB 적겠다"
   - **LLM-assisted capture** (PI 외부 도메인, Phase 0 meta-finding 패턴): "LLM이 답변 분석해서 후보 list 만들면 내가 confirm"
2. Capture file에 "## AMB Capture" 섹션 작성
3. 최소 1 AMB가 PRD/SOP-affecting인지 확인 — Phase 0 wedge proof 기준

### Step 5: Finalize + return

1. capture file에 wall-clock + summary 기록
2. paper-autopilot orchestrator로 control 반환
3. capture file path를 stdout으로 echo (orchestrator가 다음 dispatch에서 사용)

## Regex Pattern Table (Tier 1 cheap match)

| anchor type | regex | 예시 hit |
|---|---|---|
| citation key | `[A-Z][a-z]+\s*(et al\.?)?\s*\(?\d{4}\)?` | "Smith 2024", "Lee et al. (2023)" |
| 정량 metric | `\d+(\.\d+)?\s*(mA|mAh|V|nm|μm|°C|cm|h|K|cycle|wt%|mol%|%)` | "1000 cycle", "80%" |
| technique | `XRD|XPS|FT-?IR|Raman|FIB-?SEM|TEM|in-?situ|operando|DFT|MD|BET|NMR|GCD|EIS|CV|XAS` | "in-situ XRD" |
| (rc1+) target reader | 직책 패턴 | "EV cell engineer" |
| (rc1+) falsifiable claim | "X 발견 → 기각" 패턴 | "SEI 균열 발견 → 기각" |

**alpha**: Tier 1 = citation / 정량 metric / technique 3 pattern. Tier 2 LLM fallback이 나머지 cover. rc1+ 에서 추가 pattern.

## LLM Tier 2 prompt template

```
You are evaluating whether a PI's response to a forcing question contains
≥1 specific anchor. Specific anchor types:
- concept name: 구체적 mechanism noun + measurable property
- measurement type: technique name + measurement target
- citation key: 논문 reference
- target reader: 직책/role + actionable decision
- falsifiable claim: observable outcome + threshold

Forcing question (Dim {N}): {pi_question_wording}
PI response: {pi_answer}

Output format: a single line starting with '0' or '1', followed by a
1-sentence reason. Example: "1 - response contains technique name (in-situ XRD)
and quantitative metric (1000 cycle)".

Strict: response must start with '0' or '1', nothing else first.
```

## Critical invariants

1. **NEVER LLM-generate forcing question wording** — PI 워딩 그대로 사용 (wedge intent 보존, design doc Constraint)
2. **NEVER skip anchor judge** — 모든 dim 답변에 Tier 1 → Tier 2 cascade
3. **NEVER exceed 3 round retry** — design doc P2 + outside voice #7 비용 제한
4. **NEVER auto-override user** on BLOCK surface — P6 User Sovereignty 30초 confirm
5. **ALWAYS save capture file** — paper-autopilot orchestrator + ra-prd-author input dependency
6. **G2 placeholder noop** — alpha에서 G2 dispatch 시 actual question 안 하고 사용자 confirm으로 게이트 통과

## State persistence

- `forcing-q-results-G1-{datetime}.md` (paper folder 내) = source of truth
- paper-autopilot orchestrator는 이 file을 읽어서 다음 dispatch에서 ra-prd-author에 input으로 전달
- 동일 paper folder에 여러 G1 session 가능 (PI가 idea pivot 시) — datetime suffix로 구분
- 최신 session이 active (orchestrator는 newest mtime 우선)

## Edge cases

- **paper folder가 scaffold 안 됨**: BLOCK with "paper-autopilot scaffold 먼저" 메시지
- **config/forcing_questions_G1.md 부재**: BLOCK with "config 작성 필요, design doc P2 5 universal dim 참고"
- **PI 응답이 빈 문자열**: round count++, "답을 적어주세요" push retry
- **anchor judge LLM Tier 2 timeout**: Tier 1 결과로 fallback (`TIER1_SPECIFIC` 값 그대로). 명시 안 됨 시 retry round 처리
- **G2 호출 시 (alpha)**: AskUserQuestion으로 "G2 placeholder, 통과?" → 통과 시 noop, capture file에 "G2 stub passed" 기록

## Integration with paper-autopilot

1. `pa-gate-router` agent at G1: forcing question gate 활성화 시 본 skill dispatch
2. capture file path를 `pa-context-keeper` agent로 전달 → CLAUDE.md hub update
3. `research-autopilot:ra-prd-author` agent가 PRD draft 작성 시 capture file을 input source로 사용
4. `pa-version-enforcer` agent가 capture file 경로 (paper folder 내) version 규칙 검증

## Phase 0 wedge proof reference

본 skill의 mechanism은 Phase 0 paper prototype (2026-05-19, idea-01 Na-ion HC) 에서 검증됨:
- 5 dim 모두 round 1에 ≥1 anchor 충족 (anchor judge 작동 확인)
- N_new=6 ambiguity 발견 (PRD-affecting)
- Meta-finding: PI 외부 도메인에서도 답 추출 작동 (lab use case 시뮬레이션)
- Wall-clock ~30분 (60분 threshold 통과)

상세: `phase0/comparison-retro.md`

## Footer

본 skill은 paper-autopilot v1.1.0+ 의 boil-the-lake 게이트 강화 패턴의 절반 (forcing question). 다른 절반은 `pa-spec-review-loop` (5-dim adversarial review). 두 skill이 함께 작동해야 design doc의 wedge intent 완성.

External docs:
- phase 0 retro: `phase0/comparison-retro.md`
- PI 워딩 source: `config/forcing_questions_G1.md`
- active reviewer config: `config/active_reviewers_alpha.yaml`
