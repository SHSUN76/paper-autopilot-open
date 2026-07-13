---
name: pa-spec-review-loop
description: |
  paper-autopilot v1.1.0+ adversarial spec review loop. 7 active aw-* reviewer
  (alpha) 가 figure_set / SOP / manuscript draft에 5-dim 채점, BLOCK 이슈를
  aw-prose-polisher가 fix, Pass 2 incremental re-review로 변경 라인만 재검토.
  Pass 2 BLOCK 잔존 시 P6 사용자 surface (30초 confirm, Pass 3 없음).

  TRIGGER: paper-autopilot orchestrator가 MOCKUP_V_N → DRAFT_V_N transition 또는
  manuscript draft 완성 직후 자동 dispatch. 또는 사용자가
  `/pa-spec-review-loop <artifact_path>` 명시 호출.
allowed-tools: Read, Write, Edit, AskUserQuestion, Task, Bash
---

# pa-spec-review-loop Skill

paper-autopilot의 adversarial review loop. 9 aw-* reviewer 중 7개 active (config/active_reviewers_alpha.yaml에서 load) 가 병렬 채점, polisher가 fix, Pass 2가 변경 라인만 재검토. boil-the-lake gate enforcer.

## 작동 원리

```
paper-autopilot dispatch
  ↓ pa-spec-review-loop start
  ↓ Step 1: Load config (active_reviewers_alpha.yaml + review_dimensions.yaml)
  ↓ Step 2: Pre-flight polisher schema/format detect
  ↓ Step 3: Pass 1
  │   ├── Parallel dispatch 7 reviewer (claim/move/consistency/ai-tell/hedge/style/technical)
  │   ├── scope_dim_eval() internal logic (mockup hypothetical flag + input mtime)
  │   ├── aggregator-stub.sh → polisher input markdown
  │   └── aw-prose-polisher 호출 → patched artifact (또는 unified diff)
  ↓ Step 4: Pass 2 (incremental re-review)
  │   ├── Bash: pre.md / post.md snapshot + diff hunk 추출
  │   ├── Read: hunk별 ±20 line context slice
  │   ├── Task: 7 reviewer re-dispatch with context inject
  │   └── Pass 2 BLOCK 잔존? → P6 surface (30초 confirm)
  ↓ Step 5: Finalize
      ├── Patched artifact 또는 BLOCK report 저장
      └── retro metric (wall-clock, dim 점수 분포, retry count) capture
```

## 입력

1. Artifact path (PRD draft, mockup figure_set, SOP, or manuscript draft)
2. `config/active_reviewers_alpha.yaml` — 7 active + 2 inactive 명시
3. `config/review_dimensions.yaml` — 5 dim (completeness/consistency/clarity/feasibility/scope) threshold (BLOCK score ≤2, WARN 3-6, PASS ≥7)
4. (optional) prior session capture file (forcing-q-results-G1-*.md) — context

## 출력

1. `{paper_folder}/spec-review-loop-{artifact}-{datetime}/`
   - `pass1-results/` — 7 reviewer JSON results
   - `pass1-aggregated.md` — polisher input
   - `pass1-patched.md` — polisher output
   - `pass2-hunks.diff` — Pass 2 변경 라인 diff
   - `pass2-results/` — 7 reviewer re-review JSON
   - `final-report.md` — 통합 report (wall-clock, dim 점수, BLOCK list, polisher fix log)
2. BLOCK 잔존 시 사용자 surface report (`pass2-blocks.md`)

## Workflow

### Step 1: Load config

```bash
ARTIFACT="$1"
[ -f "$ARTIFACT" ] || { echo "ERROR: artifact not found: $ARTIFACT" >&2; exit 1; }
PAPER_FOLDER=$(dirname "$ARTIFACT")

ACTIVE_REVIEWERS="${CLAUDE_PLUGIN_ROOT}/config/active_reviewers_alpha.yaml"
DIMS="${CLAUDE_PLUGIN_ROOT}/config/review_dimensions.yaml"

# 7 active reviewer 추출 (dispatch set)
# alpha = simple grep, rc1+ = yq parsing
REVIEWERS=(aw-claim-validator aw-move-flow aw-consistency-checker aw-ai-tell aw-hedge-coach aw-style-checker aw-technical-reviewer)

# 출력 디렉토리
TS=$(date +%Y%m%d-%H%M%S)
OUT_DIR="${PAPER_FOLDER}/spec-review-loop-$(basename "$ARTIFACT" .md)-${TS}"
mkdir -p "${OUT_DIR}/pass1-results" "${OUT_DIR}/pass2-results"
```

### Step 2: Pre-flight polisher schema/format detect

```bash
# Mock 9-reviewer JSON 1개 + dummy artifact로 polisher 호출
# polisher 출력이 (a) patched file 인지 (b) unified diff stdout 인지 detect
# 결과 → POLISHER_FORMAT 변수 ("patched" or "unified_diff")

# alpha 단계: detect 실패 시 default "patched" 가정 (aggregator-stub이 보험)
POLISHER_FORMAT=${POLISHER_FORMAT:-patched}
```

만약 polisher가 reviewer aggregation JSON 직접 못 받음 (호환성 issue) → aggregator-stub.sh 경유 (plan-eng-review 1.1A defensive SPOF insurance).

### Step 3: Pass 1 — Parallel dispatch

For each reviewer in $REVIEWERS:

1. **Task tool dispatch**:
   ```
   Task(subagent_type="paper-autopilot-open:aw-{reviewer}",
        description="Review {artifact} for {dim}",
        prompt="<artifact content>\n\nReview on dim={dim}. Output JSON:
                {reviewer, dim, score, verdict, findings: [{severity, location, description}]}")
   ```
   
2. **Result JSON** → `${OUT_DIR}/pass1-results/{reviewer}.json`

3. **Parallel**: 7 reviewer는 상호 독립 — 단일 메시지에서 동시 Task dispatch, 전원 결과 수합 후 scope_dim_eval 진행. (구 alpha sequential 제약은 구모델 concurrency 불확실성 대응이었음 — 해제. 채점 dim/JSON schema는 불변)

4. **Internal scope_dim_eval()** (after all 7 reviewer):
   ```bash
   # mockup figure_set frontmatter parse
   TOTAL=$(grep -c '^figure:' "$ARTIFACT" || echo 1)
   HYPOTHETICAL=$(grep -c 'hypothetical: *true' "$ARTIFACT" || echo 0)
   RATIO=$(echo "scale=2; $HYPOTHETICAL / $TOTAL" | bc 2>/dev/null || awk "BEGIN{print $HYPOTHETICAL/$TOTAL}")
   
   # input/<latest>/ mtime 비교
   INPUT_DIR="${PAPER_FOLDER}/input"
   ARTIFACT_MTIME=$(stat -c %Y "$ARTIFACT" 2>/dev/null || stat -f %m "$ARTIFACT")
   INPUT_NEWER=0
   if [ -d "$INPUT_DIR" ]; then
     find "$INPUT_DIR" -type f -newer "$ARTIFACT" 2>/dev/null | head -1 | grep -q . && INPUT_NEWER=1
   fi
   
   # score_mapping (review_dimensions.yaml#scope.score_mapping)
   if [ "$INPUT_NEWER" = "1" ] && [ "$HYPOTHETICAL" -gt 0 ]; then
     SCOPE_SCORE=2  # BLOCK
   elif [ "$HYPOTHETICAL" = "0" ]; then
     SCOPE_SCORE=10  # PASS
   else
     # mixed: round((1 - ratio) * 10), round-half-up convention
     # banker's rounding (awk %.0f) 대신 int(x + 0.5) 사용 (test scope-dim.test.sh와 일관)
     SCOPE_SCORE=$(awk "BEGIN{print int((1 - $RATIO) * 10 + 0.5)}")
   fi
   
   # JSON 출력
   cat > "${OUT_DIR}/pass1-results/__internal_scope_dim.json" <<EOF
   {"reviewer": "__internal_scope_dim", "dim": "scope", "score": $SCOPE_SCORE,
    "verdict": "$([ $SCOPE_SCORE -le 2 ] && echo BLOCK || [ $SCOPE_SCORE -ge 7 ] && echo PASS || echo WARN)",
    "findings": [{"severity": "info",
                  "location": "frontmatter",
                  "description": "hypothetical_ratio=$RATIO, input_newer=$INPUT_NEWER"}]}
   EOF
   ```

5. **Aggregator stub 호출**:
   ```bash
   bash skills/pa-spec-review-loop/aggregator-stub.sh \
     --input "${OUT_DIR}/pass1-results" \
     --output "${OUT_DIR}/pass1-aggregated.md" \
     --artifact "$ARTIFACT"
   ```

6. **aw-prose-polisher 호출**:
   ```
   Task(subagent_type="paper-autopilot-open:aw-prose-polisher",
        description="Polish {artifact} based on review aggregation",
        prompt="<pass1-aggregated.md content>\n\nApply fixes for BLOCK + WARN findings.
                Output: patched artifact (or unified diff if format=unified_diff)")
   ```

7. **Save polisher output**:
   - format=patched → `${OUT_DIR}/pass1-patched.md`
   - format=unified_diff → polisher stdout을 parser로 변환 + `${OUT_DIR}/pass1-patched.md` 생성 (apply diff to original)

### Step 4: Pass 2 — Incremental re-review (Pass 2 mechanism per design doc)

```bash
# Bash step 1: snapshot + diff
cp "$ARTIFACT" "${TMPDIR:-/tmp}/pa-pre.md"
cp "${OUT_DIR}/pass1-patched.md" "${TMPDIR:-/tmp}/pa-post.md"
diff -u "${TMPDIR:-/tmp}/pa-pre.md" "${TMPDIR:-/tmp}/pa-post.md" > "${OUT_DIR}/pass2-hunks.diff" || true

# Check if any diff exists
if [ ! -s "${OUT_DIR}/pass2-hunks.diff" ]; then
  echo "No changes in Pass 1 → Pass 2 skipped (no incremental re-review needed)"
  FINAL_STATUS="PASS_NO_CHANGES"
else
  # Read step 2: hunk별 ±20 line context slice
  # awk 또는 git apply 사용 (alpha = sed/awk)
  # 각 hunk의 line range 추출 → post.md에서 ±20 line context_snippet
  
  # parse hunks (alpha = naive, rc1+ = proper diff library)
  HUNKS=()
  while IFS= read -r line; do
    if [[ "$line" =~ ^@@ ]]; then
      # @@ -A,B +C,D @@ 형식에서 C, D 추출
      RANGE=$(echo "$line" | grep -oE '\+\d+,\d+' | head -1)
      START=$(echo "$RANGE" | cut -d, -f1 | tr -d +)
      LENGTH=$(echo "$RANGE" | cut -d, -f2)
      HUNK_END=$((START + LENGTH))
      CONTEXT_START=$((START - 20))
      CONTEXT_END=$((HUNK_END + 20))
      [ $CONTEXT_START -lt 1 ] && CONTEXT_START=1
      HUNKS+=("$CONTEXT_START:$CONTEXT_END")
    fi
  done < "${OUT_DIR}/pass2-hunks.diff"
  
  # Task step 3: 각 reviewer를 context_snippet으로 re-dispatch (7개 동시 병렬 — Pass 1과 동일)
  for reviewer in "${REVIEWERS[@]}"; do
    # context_snippets concat
    CONTEXT_BUNDLE=""
    for h in "${HUNKS[@]}"; do
      S=$(echo "$h" | cut -d: -f1)
      E=$(echo "$h" | cut -d: -f2)
      SNIPPET=$(sed -n "${S},${E}p" "${TMPDIR:-/tmp}/pa-post.md")
      CONTEXT_BUNDLE+="\n\n--- hunk lines ${S}-${E} ---\n${SNIPPET}\n"
    done
    
    # re-dispatch
    Task(subagent_type="paper-autopilot-open:aw-${reviewer}",
         description="Pass 2 incremental re-review",
         prompt="${pi_reviewer_original_prompt}\n\n## Changed context (Pass 2 incremental)\n${CONTEXT_BUNDLE}")
    # → ${OUT_DIR}/pass2-results/${reviewer}.json
  done
  
  # scope_dim_eval re-run (artifact mtime 갱신됨)
  # ... (Step 3 #4 동일)
  
  # Step 4: Pass 2 BLOCK 잔존? → P6 surface
  BLOCK_COUNT=$(grep -l '"verdict": *"BLOCK"' "${OUT_DIR}/pass2-results/"*.json 2>/dev/null | wc -l)
  if [ "$BLOCK_COUNT" -gt 0 ]; then
    # P6 surface — AskUserQuestion 30초 confirm window
    # build pass2-blocks.md report
    # 사용자 옵션: A) 이대로 진행 (BLOCK accept) / B) abort + 사용자 수동 fix
    FINAL_STATUS="BLOCK_SURFACED"
  else
    FINAL_STATUS="PASS_AFTER_PASS_2"
  fi
fi
```

### Step 5: Pass 2 fallback (polisher output = unified_diff)

If POLISHER_FORMAT=unified_diff:
- step 1 (snapshot)을 skip
- polisher stdout (unified diff)을 적절한 diff parser로 파싱
- Naive `awk '/^@@/,/^$/'`는 사용 금지 (unified diff 공백 라인 부재 시 hunk 손실 risk per iteration 3 MINOR-K)
- 사용: `git apply --numstat -` 또는 proper python `unidiff` library
- step 2의 ±20 context는 **원본 artifact**에서 slice (post.md 부재)

```bash
if [ "$POLISHER_FORMAT" = "unified_diff" ]; then
  # polisher stdout이 이미 ${OUT_DIR}/polisher-stdout.diff로 저장된 가정
  # apply하여 pass1-patched.md 생성
  cp "$ARTIFACT" "${OUT_DIR}/pass1-patched.md"
  git apply --whitespace=nowarn "${OUT_DIR}/polisher-stdout.diff" \
    --directory="${OUT_DIR}" 2>/dev/null \
    || echo "WARN: git apply failed, manual diff inspection needed" >&2
fi
```

### Step 6: Finalize

```bash
# final-report.md 작성
cat > "${OUT_DIR}/final-report.md" <<EOF
# Spec Review Loop Report

Artifact: $ARTIFACT
Datetime: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Final status: ${FINAL_STATUS}

## Pass 1 results
$(for r in "${REVIEWERS[@]}"; do
  RES="${OUT_DIR}/pass1-results/${r}.json"
  [ -f "$RES" ] && echo "- $r: $(grep -o '"score": *[0-9]*' "$RES" | head -1)"
done)
- scope (internal): score=${SCOPE_SCORE:-?}, hypothetical_ratio=${RATIO:-?}, input_newer=${INPUT_NEWER:-?}

## Pass 2 results (if Pass 1 produced changes)
$([ "$FINAL_STATUS" != "PASS_NO_CHANGES" ] && echo "$(for r in "${REVIEWERS[@]}"; do
  RES="${OUT_DIR}/pass2-results/${r}.json"
  [ -f "$RES" ] && echo "- $r: $(grep -o '"score": *[0-9]*' "$RES" | head -1)"
done)" || echo "(skipped, no changes)")

## Wall-clock
${WALL_CLOCK_SECONDS:-?}s

## Final artifact
${OUT_DIR}/pass1-patched.md

## BLOCK report (if surfaced)
$([ "$FINAL_STATUS" = "BLOCK_SURFACED" ] && echo "${OUT_DIR}/pass2-blocks.md" || echo "(none)")
EOF

echo "DONE: spec-review-loop completed, status=${FINAL_STATUS}, report=${OUT_DIR}/final-report.md"
```

## Critical invariants

1. **Parallel dispatch** — 7 reviewer 동시 Task 호출, reviewer별 JSON 분리 저장 후 수합 (구 sequential alpha 제약과 rc1+ migration 조건은 구모델 한계 대응 — 해제. 7-reviewer 구성/5-dim 채점/BLOCK 판정 규칙은 불변)
2. **2-pass max** — Pass 3 없음. Pass 2 BLOCK 잔존 시 P6 surface
3. **scope_dim_eval internal logic** — agent dispatch 없음 (review_dimensions.yaml#scope.eval_method=internal_logic)
4. **aggregator-stub 경유** — polisher 호환 무관 alpha 진행 보장 (1.1A defensive)
5. **Pass 2 mechanism 4-step** — Bash snapshot+diff → Read ±20 context slice → Task re-dispatch → P6 surface
6. **두 fallback path 모두 구현** — patched file (default) + unified diff stdout (fallback). pre-flight detect 결과로 active path 선택
7. **NEVER auto-override BLOCK** — P6 User Sovereignty, 사용자 30초 confirm
8. **NEVER skip scope_dim_eval** — 5 dim 전체 채점이 wedge proof 본질
9. **Cross-platform path** — `${TMPDIR:-/tmp}` 사용, Windows git-bash 호환

## scope_dim_eval 5-case unit test (plan-eng-review 3.1A)

`tests/scope-dim.test.sh` 별도 파일 참조. 5 case:
1. ratio=0 (모든 figure hypothetical=false) → score=10 (PASS)
2. ratio=1 (모든 figure hypothetical=true) → score=0 (BLOCK)
3. ratio=0.5 (mixed) → score=5 (WARN)
4. input_newer=1 AND hypothetical>0 → score=2 (BLOCK, override mixed)
5. empty input + all hypothetical=false → score=10 (PASS, Reviewer Concerns MINOR-D)

## Edge cases

- **artifact 부재**: BLOCK with "artifact path required"
- **active_reviewers_alpha.yaml 부재**: design doc P3 기본값 (7 active) fallback
- **reviewer agent dispatch 실패** (1개): WARN log, 다음 reviewer 진행. retro에 기록
- **polisher 호출 실패**: BLOCK with "polisher unavailable, Pass 1 aggregation만 출력"
- **Pass 1 = 0 변경** (모든 reviewer PASS): Pass 2 skip, FINAL_STATUS=PASS_NO_CHANGES
- **diff hunk parsing 실패** (Naive awk regression): WARN, fallback to full re-dispatch
- **scope_dim_eval에서 hypothetical 필드 부재**: ratio=0 default (PASS bias, alpha 단계 보수적)

## State persistence

- 산출물 디렉토리: `${PAPER_FOLDER}/spec-review-loop-{artifact}-{datetime}/` (version 규칙 enforced)
- pa-version-enforcer agent가 경로 검증
- final-report.md = source of truth
- 동일 artifact에 여러 review session 가능 (V_n+1 evolution 시) — datetime suffix로 구분

## Integration with paper-autopilot

1. orchestrator가 MOCKUP_V_N → DRAFT_V_N transition 시 본 skill dispatch
2. final-report.md 의 FINAL_STATUS 가 PASS_NO_CHANGES / PASS_AFTER_PASS_2 → 다음 게이트 진행
3. BLOCK_SURFACED → P6 confirm, 사용자 수동 fix 후 재호출 또는 BLOCK accept
4. `pa-context-keeper` agent가 CLAUDE.md hub에 review 결과 update
5. `mockup-evolver` 호출 시 prior review 결과를 input으로 받아 incremental update

## Phase 0 wedge proof reference

본 skill은 Phase 0의 mock test (aggregator-stub.sh + 2개 mock reviewer JSON) 로 SPOF 보험 검증됨. 실제 7 reviewer dispatch + Pass 2 mechanism end-to-end는 T8 dogfood에서 검증 예정.

## Footer

External docs:
- aggregator stub: `aggregator-stub.sh`
- scope_dim unit test: `tests/scope-dim.test.sh`
- review dimensions schema: `config/review_dimensions.yaml`
- active reviewer config: `config/active_reviewers_alpha.yaml`
- companion skill (G1/G2): `pa-forcing-questions/SKILL.md`
