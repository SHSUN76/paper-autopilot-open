# Diff Strategy — mockup-evolver

> mockup V_n → V_n+1 변환 시 어디를 어떻게 바꿀지 결정.

## 입력 비교

| V_n 자료 | V_n+1 결정 시 비교 대상 |
|---------|---------------------|
| `mockup/<v_n>/figure_set.md` | `input/<latest>/` 데이터 (CSV, 이미지, notes.md) |
| `mockup/<v_n>/paper_logic.md` | 새 데이터의 storyline 함의 |
| `mockup/<v_n>/*.png` | 새 데이터로 대체 가능한 figure |
| `_paper.md.blockers` | 새 데이터로 해결되는 blocker |

## 변경 분류 (3-tier)

| Tier | 트리거 | V_n+1 처리 |
|------|-------|----------|
| **Minor** | 1-2 figure 데이터 갱신, storyline 그대로 | 영향 figure만 교체, 나머지 copy forward |
| **Substantial** | 3+ figure 갱신 OR storyline 일부 갱신 | figure_set.md/paper_logic.md 부분 재작성 |
| **Pivot** | 데이터가 V_n hypothesis 반박 | 전면 재구성, 사용자 confirm 필수 |

## Figure-by-figure decision tree

각 figure에 대해:

```
1. figure_set.md에서 required_data 식별
2. input/<latest>/ 에서 매칭되는 real data 검색
3. 매칭 결과:
   a. Real data 충분 → 'replaced: hypothesis → real'
   b. Real data 부분 → 'partial: 일부 real, 나머지 hypothesis 유지'
   c. Real data 없음 → 'unchanged: hypothesis'
   d. Real data가 hypothesis 반박 → 'invalidated: 사용자 confirm 필요'
```

## DIFF.md 형식 (academic-writing CORRECT 입력)

```markdown
# DIFF V_{n+1} ← V_{n}  (date)

## Figures changed

### Fig 2b: hypothesis → real
- 가설값: D_xy = 0.05 Å²/ps
- 측정값: D_xy = 0.061 Å²/ps (input/260510_MD/D_xy.csv)
- 차이: +22% — 가설보다 약간 fast
- Manuscript 영향: §3.2 Bell-curve threshold value 갱신

### Fig 4 (NEW): XPS S/L-NCM ratio
- 측정값: ratio = 3.8× (input/260510_XPS/depth_profile.csv)
- v5.3 narrative §4 Limitation #4 RESOLVED
- Manuscript 영향: §4 Discussion 새 §4.3 추가, Limitations 재정렬

## Storyline impact

- §Bell-curve regime threshold: hypothesis "θ~4 optimum" → empirically supported
- §Limitations §4 (XPS missing): RESOLVED → Validation history로 이동
- §Limitations §3 (polymer network): 새 §3 (이번 데이터로도 검증 안 됨, 후속 작업)

## Manuscript sections to revise

academic-writing CORRECT mode가 다음 단락만 polish:

- Abstract: capacitive XPS validation 추가
- Results §3.2: "hypothesized" → "measured"
- Discussion §4: 신규 §4.3 cross-validation MD ↔ XPS
- Limitations: §4 제거, §3에 "polymer network 후속" 추가
- Conclusion: XPS validation 1줄 추가

## 영향 안 받는 단락 (skip)

academic-writing CORRECT가 건드리지 않을 부분:

- Abstract 첫 2 문장 (motivation 그대로)
- Introduction 전체
- Methods (XPS 추가 외)
- Results §3.1 (이전 데이터, 변경 없음)
- Conclusion 마지막 문장
```

## Provenance 요건

`data_provenance.md`에 매 figure → input 폴더 매핑:

```markdown
# Data Provenance — V_{n+1}

| Figure | 데이터 출처 | 측정일 | 측정자 |
|--------|-----------|------|------|
| Fig 1 (microstructure) | input/260420_초기데이터/CT.csv | 2026-04-20 | 홍길동 |
| Fig 2a (DFT) | mockup/260502_v1/ (no real data, kept hypothesis) | — | — |
| Fig 2b (D_xy) | input/260510_MD/D_xy.csv | 2026-05-10 | 자체 MD |
| Fig 4 (XPS) | input/260510_XPS/depth_profile.csv | 2026-05-10 | 학생 |
```

## Pivot 처리

데이터가 V_n hypothesis 반박:

1. mockup-evolver는 **자동 재작성 X**
2. 사용자에게 다음 보고:
   ```
   ⚠️ V_n 가설 반박:
   - V_n 가설: A
   - 측정값: not-A (확률 X)

   다음 옵션:
   1. paper_logic.md 재작성 (storyline pivot)
   2. 추가 실험 plan (experimental-plan 재호출)
   3. V_n 그대로, V_n+1 보류 (데이터 의심)
   ```
3. 사용자 결정 후에만 V_n+1 생성

## 중요 invariants

- **V_n 폴더 변경 금지** — 무조건 V_n+1 새 폴더
- **DIFF.md 누락 금지** — academic-writing CORRECT 입력
- **data_provenance.md 누락 금지** — reviewer 방어선
- **Limitations history append-only** — 해결된 limitation도 보존 (Validation history로 이동)

## 성능

| Tier | 시간 | RAG calls |
|------|------|---------|
| Minor | 5-10 min | 0 |
| Substantial | 15-25 min | 2-3 |
| Pivot | 30-60 min | 5+ |
