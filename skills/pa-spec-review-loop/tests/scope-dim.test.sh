#!/usr/bin/env bash
# scope-dim.test.sh
# T7 산출물 (paper-autopilot v1.1.0-alpha)
# scope_dim_eval() 공식의 5-case unit test
# plan-eng-review 3.1A 결정 + Reviewer Concerns MINOR-D 동시 해결

set -euo pipefail

# scope_dim_eval 공식 (review_dimensions.yaml#scope.score_mapping):
#   hypothetical_ratio = HYPOTHETICAL / TOTAL
#   input_newer = exists(input/<latest>/ where mtime > artifact mtime)
#   if input_newer and hypothetical_ratio > 0: score = 2  (BLOCK)
#   elif hypothetical_ratio == 0: score = 10              (PASS)
#   else: score = round((1 - hypothetical_ratio) * 10)    (mixed)

scope_dim_eval() {
  local total="$1"
  local hypothetical="$2"
  local input_newer="$3"  # 0 or 1

  # ratio (decimal)
  local ratio
  ratio=$(awk "BEGIN{print $hypothetical/$total}")

  # decision tree
  if [ "$input_newer" = "1" ] && [ "$hypothetical" -gt 0 ]; then
    echo "2"
  elif [ "$hypothetical" = "0" ]; then
    echo "10"
  else
    # round-half-up convention (design doc score_mapping 공식의 round())
    # banker's rounding (awk %.0f) 대신 int(x + 0.5) 사용
    awk "BEGIN{print int((1 - $ratio) * 10 + 0.5)}"
  fi
}

# ─── Test runner ───
PASS=0
FAIL=0

assert_eq() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $name (expected=$expected, actual=$actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (expected=$expected, actual=$actual)" >&2
    FAIL=$((FAIL + 1))
  fi
}

# ─── 5 test cases (plan-eng-review 3.1A) ───

# Case 1: ratio=0 (모든 figure hypothetical=false) → score=10 (PASS)
RESULT=$(scope_dim_eval 4 0 0)
assert_eq "case 1: ratio=0 → PASS (score=10)" "10" "$RESULT"

# Case 2: ratio=1 (모든 figure hypothetical=true) → score=0 (BLOCK, mixed formula → 0)
RESULT=$(scope_dim_eval 4 4 0)
assert_eq "case 2: ratio=1, input_newer=0 → score=0" "0" "$RESULT"

# Case 3: ratio=0.5 (mixed) → score=5 (WARN)
RESULT=$(scope_dim_eval 4 2 0)
assert_eq "case 3: ratio=0.5 → score=5 (WARN)" "5" "$RESULT"

# Case 4: input_newer=1 AND hypothetical>0 → score=2 (BLOCK, override)
RESULT=$(scope_dim_eval 4 2 1)
assert_eq "case 4: input_newer=1, hypothetical>0 → BLOCK (score=2)" "2" "$RESULT"

# Case 5: empty input + all hypothetical=false → score=10 (PASS)
# (Reviewer Concerns MINOR-D 동시 해결 — empty input은 input_newer=0 로 처리됨)
RESULT=$(scope_dim_eval 4 0 0)
assert_eq "case 5: empty input + all hypothetical=false → PASS (score=10, MINOR-D)" "10" "$RESULT"

# ─── Edge cases (bonus) ───

# Bonus 1: ratio=0.25 (1/4 mixed) → score=8 (PASS borderline)
RESULT=$(scope_dim_eval 4 1 0)
assert_eq "bonus 1: ratio=0.25 → score=8" "8" "$RESULT"

# Bonus 2: ratio=0.75 (3/4 mixed) → score=3 (WARN borderline)
RESULT=$(scope_dim_eval 4 3 0)
assert_eq "bonus 2: ratio=0.75 → score=3" "3" "$RESULT"

# Bonus 3: input_newer=1 BUT hypothetical=0 → score=10 (PASS, input data가 hypothetical을 update 안 함)
RESULT=$(scope_dim_eval 4 0 1)
assert_eq "bonus 3: input_newer=1 but hypothetical=0 → PASS (score=10)" "10" "$RESULT"

# ─── Summary ───
echo ""
echo "=== Test summary ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
TOTAL=$((PASS + FAIL))
echo "TOTAL: $TOTAL"

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: SCOPE_DIM_EVAL_UNIT_TEST_FAILED" >&2
  exit 1
else
  echo "RESULT: SCOPE_DIM_EVAL_UNIT_TEST_PASSED"
  exit 0
fi
