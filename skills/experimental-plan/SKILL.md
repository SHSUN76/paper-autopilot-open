---
name: experimental-plan
description: |
  Battery / materials science experimental SOP designer. Bridges mockup figures and real data
  by generating undergrad-level lab-bench protocols. THREE modes:
  (1) GAP — analyze mockup vs current input data, identify missing experiments,
  (2) PLAN — design step-by-step SOP grounded in RAG corpus + open-access reference papers + downloaded SI,
  (3) TARGET — recommend target journal numerical metrics based on mockup outcomes and corpus statistics.

  TRIGGER: editing experimental_plan/ folder, asking "design experiment SOP", "what data is missing",
  "how should the student run this", "target metrics for journal X", "gap analysis", or whenever
  paper-autopilot enters Phase B (post-mockup, pre-experiment). Output is undergrad-level
  step-by-step instructions that fill mockup figure data slots.
---

# Experimental Plan Designer (battery / materials)

You are the orchestrator for `/experimental-plan`. This skill produces the **lab-bench SOP** that
bridges a mockup (figure 가안) and real experimental data. Output goes to
`<paper_folder>/experimental_plan/[YYMMDD_<note>]/` per the standard 6-folder structure
(see the `folder-scaffold` skill).

## Setup — load these references

Before deploying:

1. `references/sop-template.md` — undergrad-level SOP structure with timing, materials, safety
2. `references/source-priority.md` — data source ranking: local corpus → Supabase RAG → OA web → SI download
3. `references/battery-target-metrics.md` — per-journal numerical target ranges (corpus-derived)

## Three modes

| Mode | Trigger | Output | Time |
|------|---------|--------|------|
| **GAP** (default first run) | "what data is missing", "gap analysis" | `gap_analysis.md` | 5-10 min |
| **PLAN** | "design SOP", "experimental plan", "how to run" | `SOP.md` + `materials_list.md` + `reference_protocols/` | 20-40 min |
| **TARGET** | "target metrics", "what numbers for journal X" | `target_metrics.md` | 5-10 min |

A typical first-time run executes all three: GAP → TARGET → PLAN.
GAP과 TARGET은 상호 독립 — full run 시 병렬로 진행하고 두 결과를 PLAN 입력으로 수합한다.

---

## Standard output structure

```
<paper_folder>/experimental_plan/[YYMMDD_<note>]/
├── gap_analysis.md          ← 어떤 mockup figure가 데이터 부족인지
├── target_metrics.md        ← target journal 통계 기반 수치 목표
├── SOP.md                   ← step-by-step 실험 protocol (메인)
├── materials_list.md        ← 시약 + 장비 + 공급사
└── reference_protocols/     ← 다운로드한 SI + Methods 발췌
    ├── Wang2023_SI.pdf
    ├── Kim2024_methods_extracted.md
    └── source_log.md         ← 어디서 어떻게 가져왔는지 추적
```

날짜 prefix는 config timezone (기본 Asia/Seoul) 기준 `YYMMDD`. note는 자유 (예: `260430_v1초안`, `260510_홍길동피드백반영`).

---

## Mode 1 — GAP: mockup vs input data 분석

### Inputs
- `<paper_folder>/mockup/<latest>/figure_set.md` (필수)
- `<paper_folder>/mockup/<latest>/paper_logic.md`
- `<paper_folder>/input/*/` (모든 버전)
- `<paper_folder>/_paper.md` (target journal 추론용)

### Steps
1. **Mockup figure inventory**: figure_set.md를 파싱해 각 figure가 요구하는 데이터 종류 추출
2. **Input data inventory**: input/ 하위 모든 폴더에서 보유 중인 데이터 카탈로그 작성
3. **Gap matching**: figure × required_data 매트릭스에서 input에 매칭되지 않는 cell 식별
4. **Priority ranking**:
   - 🔴 Critical: figure 자체가 없음 (실험 필수)
   - 🟡 Partial: 일부 데이터만 있음 (보강 실험)
   - 🟢 Complete: 데이터 충분 (실험 불필요)

### Output: `gap_analysis.md`
```markdown
# Gap 분석 (YYYY-MM-DD)

## Mockup이 요구하는 데이터 vs 보유 데이터

| Figure | Required data | Current input | Gap | Priority |
|--------|--------------|---------------|-----|----------|
| Fig 2a | EIS Nyquist (formation) | input/260420/EIS_full.csv | — | 🟢 |
| Fig 2b | EIS @ cycle 100 | — | 🔴 | Critical |
| Fig 3 | XPS depth profile | input/260415/XPS.txt (only top 5nm) | 🟡 | Partial |

## 이번 실험 plan에서 채워야 할 것
1. Fig 2b — EIS @ cycle 100 (전체 protocol 필요)
2. Fig 3 — XPS depth profile 외부 의뢰 또는 추가 etching
```

---

## Mode 2 — PLAN: lab-bench SOP 작성

### Inputs (GAP의 출력 + 추가)
- `gap_analysis.md`의 Critical/Partial 항목
- `<paper_folder>/reference/*/`의 metadata 및 logic
- (선택) `target_metrics.md` (TARGET 모드 결과)

### Steps

**Phase 2.1 — RAG 코퍼스에서 Methods 단락 검색**

local corpus(config `rag.local_corpus_dir`)에서 직접 검색:
```bash
# section_name이 "Experimental", "Method", "Synthesis" 포함한 paragraph 추출
# OR primary_claim_type == "method_description"
# 측정 기법 키워드(EIS, XPS, GITT 등)로 필터
```

또는 retrieve.mjs로 검색 (local/supabase 모드 공통):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs \
  --query "EIS Nyquist after cycling" \
  --section "Experimental" \
  --claim "method_description" \
  --k 5
```

`references/source-priority.md`에 우선순위 정의 — 항상 local corpus 먼저 시도.

**Phase 2.2 — Open-access reference paper 확보**

local corpus에 충분한 protocol이 없으면 OA web 검색:
- Priority sources (battery 분야): `references/source-priority.md` §3 참조
- 사용 도구: `WebSearch` → 후보 식별 → `/paper-access` 스킬로 PDF 확보
- SI가 필요하면 paper-access의 `--include-si` 옵션 또는 별도 다운로드

`reference_protocols/` 폴더에 저장 + `source_log.md`에 출처 기록.
후보 paper가 여러 편이면 확보 작업(WebSearch → /paper-access → SI 저장)을 paper별 병렬 subagent로 위임하고 결과만 source_log.md에 수합한다.

**Phase 2.3 — User confirmation gate (MANDATORY)**

다음을 사용자에게 제시하고 승인 받음:
- 식별한 reference protocol 3-5개 목록 (제목, 출처, 차용 부분)
- 각 실험의 예상 소요 시간, 비용, 위험도
- 학생/공동작업자에게 전달할 형태 (1저자가 학생인 경우)

승인 후에만 Phase 2.4로 진행.

**Phase 2.4 — SOP 작성 (학부생 수준)**

`references/sop-template.md` 형식 따름. 핵심 요소:
1. **목적** — "이 SOP를 따르면 mockup의 Fig X 데이터를 채울 수 있다" 1줄
2. **참조 protocol** — Phase 2.2에서 확보한 paper의 어느 부분을 차용했는지
3. **사전 준비** — 시약 (`materials_list.md`), 장비, 안전 (PPE, 폐기물)
4. **단계별 절차** — 각 step에 시간, 온도, 농도, 주의사항. 학부생도 따라할 정도.
5. **데이터 수집** — 측정 항목, 형식 (CSV column), 저장 위치 (`input/[YYMMDD_실험내용]/`)
6. **종료 조건** — target_metrics.md 참조한 성공 기준

**Phase 2.5 — Materials list 분리**

`materials_list.md`에 시약/장비/공급사 정보 분리 저장 — 학생이 주문할 때 직접 사용.

### Output: `SOP.md`, `materials_list.md`, `reference_protocols/`

---

## Mode 3 — TARGET: 저널별 수치 목표 추천

### Inputs
- `<paper_folder>/_paper.md`의 `journal:` 필드 (또는 사용자 입력)
- `<paper_folder>/mockup/<latest>/figure_set.md` (어떤 metric이 figure에 들어가는지)

### Steps

1. **Target journal 후보 식별**: `_paper.md`에 명시되어 있으면 사용. 없으면 mockup 결과를 보고 후보 3개 제안
2. **Corpus 통계 추출**: 해당 저널 또는 비슷한 IF의 논문에서 핵심 metric 분포
   - local corpus의 Results 단락에서 capacity, retention, CE, energy density 등 추출
   - `references/battery-target-metrics.md`의 사전 정리된 통계 활용
3. **3-tier 목표 설정**:
   - **평균값** (그 저널 평균 수준) — pass
   - **상위 25%** (top journal 진입 가능 수준) — strong
   - **최소 통과 기준** (이 값 미만이면 reject 예상) — minimum
4. **Mockup 가설값과 비교**: 사용자의 mockup이 가정한 값이 어느 tier인지 표시

### Output: `target_metrics.md`
```markdown
# Target Metrics — Adv. Energy Mater. (target journal)

## 핵심 지표 (corpus 분석 기반, n=8 papers)

| Metric | 평균 | 상위 25% | 최소 | Mockup 가설값 |
|--------|------|---------|------|--------------|
| Capacity retention @ 100 cyc | 82% | 91% | 70% | 88% (상위 25% 근접) |
| Coulombic efficiency | 99.4% | 99.7% | 99.0% | 99.5% (평균 이상) |
| Energy density (Wh/kg) | 245 | 280 | 210 | 230 (평균 이하 ⚠️) |

## 출처
- Corpus: aem-128, aem-129, aem2025-060, aem2026-019 (4편)
- Web: Wang2024, Kim2025 (2편 OA)
- Manual: Zhao2023 (Acta Mat, 비교용)
```

---

## Common quality rules

1. **항상 출처 명시**: 모든 protocol step은 `(Wang2023 SI Section 3.2)` 같이 출처 표시
2. **학부생 수준 강제**: "그냥 측정한다" 같은 모호한 문구 금지. 시간·온도·농도·반복 횟수 명시
3. **OA 우선**: WebSearch 결과 중 open access만 다운로드. 구독 paper는 reference만 인용
4. **Cell 일관성**: 비교 실험은 동일 cell, 동일 측정 조건. SOP에 명시
5. **재현성 체크**: 학부생이 SOP만 보고 실행 가능한지 self-review
6. **safety first**: 위험 시약/조건은 별도 ⚠️ 박스로 강조
7. **local corpus 우선**: 매번 원격 Supabase 호출하기 전에 local corpus(config `rag.local_corpus_dir`) 먼저 검색
8. **SI는 paper-access 스킬로**: 절대 임의로 URL 추측해서 다운로드하지 않기
9. **재료 물성 기준값은 materials-project 스킬(MP API)**: 이론용량·밀도·몰질량·상안정성 등 재료 고유 기준값이 필요하면 `materials-project` 스킬로 조회(DFT 계산값, mp-id 인용). protocol 출처(P1~P4)와는 별개의 보조 소스이며, source-priority 순위를 대체하지 않는다.

## Constraints

- **Read-only by default for input/, mockup/**. 절대 수정하지 않음. SOP가 요구하는 새 데이터는 학생이 `input/[새 YYMMDD]/`에 추가하도록 안내
- **Output 폴더는 experimental_plan/만**. simulations/, output/, mockup/ 침범 금지
- **paper-access 호출 시 institution proxy 우선** — config `paper_access.institution_proxy_url`가 설정돼 있으면 사용
- **모든 시간 config timezone (기본 Asia/Seoul)**: 폴더명 `YYMMDD`도 동일 기준
- **Korean primary**: 사용자에게는 한국어 출력. SOP 본문은 학생 언어 (보통 한국어). 인용 metadata만 영어
- **Materials list separate**: 시약/장비는 SOP 본문에 묻어두지 않고 `materials_list.md`로 분리 (학생이 발주서로 사용)

## Performance budgets

| Mode | Typical time | Bottleneck |
|------|-------------|-----------|
| GAP only | 5-10 min | input/ 디렉토리 스캔 + mockup 파싱 |
| TARGET only | 5-10 min | corpus 통계 추출 |
| PLAN only | 20-40 min | OA web search + SI download |
| Full pipeline (GAP → TARGET → PLAN) | 30-60 min | PLAN의 web/SI 단계 |

## Footer

이 스킬은 paper-autopilot 플러그인의 Phase B (post-mockup, pre-experiment) 핵심 컴포넌트입니다.
- 폴더 표준: `folder-scaffold` 스킬의 표준 6폴더 구조
- academic-writing 스킬과 데이터 흐름: mockup → experimental-plan → 학생 실험 → input → mockup V_n+1 → academic-writing
