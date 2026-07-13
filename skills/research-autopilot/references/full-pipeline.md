# /research-autopilot - 논문 기반 연구 기획 → 검증 → 논문 초안 자동화 Agent (v3.0)

> 논문 PDF에서 시작하여 아이디어 구체화 → PRD/SOP → 검증 → 시뮬레이션 설계 → 검증 → Figure Set → 논문 초안 → .docx까지 **한 파이프라인**으로 실행합니다.
> **v3.0**: v2.0 실전 테스트 기반 개선. 플랜 모드 도입, 누락 방지 체크리스트, 세션 분할 가이드, Gate 수정 반영 강제화.

## 사용자 입력
$ARGUMENTS

---

## v3.0 변경사항 (v2.0 실전 테스트 기반)

| 변경 | 내용 | 이유 |
|------|------|------|
| **플랜 모드** | 실행 전 전체 계획표를 사용자에게 제시 → 승인 후 실행 | Phase/Gate 누락 방지 |
| **Phase 3 인프라** | parameters.yaml, pilot_gate, dependency_graph, status.yaml 생성 명시 | `simulation-data staging` 인프라 누락 방지 |
| **Phase 5 분리** | 5A (Figure .md) → 5B (/paper-autopilot-open:ppt-image 4K) 명시적 2단계 | 이미지 생성 누락 방지 |
| **Gate 수정 반영** | Gate에서 Required Action 나오면 즉시 수정 실행 (별도 Step) | 수정 지시만 하고 미반영 방지 |
| **세션 분할** | Phase 0-4 (세션 1) / Phase 5-7 (세션 2) 권장 | context 소진 방지 |
| **완료 체크리스트** | 각 Phase 완료 시 필수 파일 존재 확인 | 파일 미생성 방지 |
| **Paper Writing Tips 참조** | 모든 writing agent가 연구실 writing style guide 필수 참조 | PI 스타일 가이드 위반 방지 |

---

## 🎯 PAPER WRITING STYLE GUIDE — MANDATORY REFERENCE

> **모든 논문 작성 에이전트 (Phase 6.0~6.5)는 아래 문서를 반드시 읽고 준수한다.**
>
> **파일**: `${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md`
>
> 이 문서는 연구실 PI의 논문 작성 가이드라인(7 pages)으로, 모든 섹션(Abstract, Introduction, Results & Discussion, Experimental, Conclusion)은 이 스타일 규칙을 100% 준수해야 한다.

### 핵심 스타일 규칙 요약 (writing agent 내부 참조용)

**문장/단락**:
- 긴 문장 금지 — 독자가 메시지를 놓치지 않도록 짧고 명료하게
- 한 단락은 double-spaced 기준 1페이지를 초과하지 않음
- 단락 사이 연결 phrase 활용: `however`, `in contrast to`, `on the other hand`, `interestingly`, `importantly`

**수치/단위 포맷**:
- 숫자 소수점 앞 공백: `x = 0.5` (O) / `x=0.5` (X)
- 근사: `~ 15` (공백 포함)
- 단위 공백: `150 nm`, `mA h g⁻¹` (NOT `mAh/g`), `m² g⁻¹` (NOT `m²/g`)
- 부등식 공백: `0 ≤ x ≤ 1`, `x < 1`
- 비율 공백: `Mn: Ni = 3: 1`
- 시간 단위: `5 h` (NOT `5 hours`), `40 s` (NOT `40 seconds`), `24 h` (NOT `24 hours`)
- C-rate 공백 없음: `5C` (NOT `5 C`) — 반드시 `5C rate`로 표기
- 용량값 소수점 제거: `321 mA h g⁻¹` (NOT `321.7 mA h g⁻¹`)

**참고문헌 포맷**:
- 일반 저널 (superscript): `it has been studied.¹` (period가 ref 앞)
- 일반 저널 (bracket/paren): `it has been studied [1].` (period가 ref 뒤)
- **Nature 저널**: `it has been studied¹` (period 없음, ref 앞)
- 자동 번호 매기기 금지 — 수동 입력만

**쉼표 규칙 (Oxford comma)**:
- 2항목: `x and y` (쉼표 없음)
- 3항목 이상: `x, y, and z` (반드시 Oxford comma)
- `respectively` 위치: `x, y, and z give, respectively, a, b, and c.`

**축약어/단어 선택**:
- Contractions 금지: `it is` (O) / `it's` (X)
- `using` → `with`: `carried out with XPS` (NOT `using XPS`)
- 소유격 회피: `the larger size of lithium` (NOT `lithium's larger size`)
- 복합어 하이픈: `lithium-metal anode` (NOT `lithium metal anode`)
- 모든 abbreviation은 본문 첫 등장 시 정의 (abstract에 정의되어 있어도 intro에서 재정의)

**Figure 규칙**:
- Caption 레이블 위치: `cyclability of (a) LiCoO₂ and (b) LiNiO₂` (NOT `LiCoO₂ (a) and LiNiO₂ (b)`)
- 큰 폰트, 대비되는 기호/색상
- 각 figure caption은 별도 페이지, 각 figure도 별도 페이지

**내용 규칙**:
- Abstract와 Conclusion에 **동일한 문장 금지**
- 데이터 정확성·재현성 책임은 작성자 — 불확실하면 포함하지 않음
- 인용구 복사 금지 (표절)
- **US English dictionary 사용**

**일반 포맷**:
- Margins: 1-inch all sides
- Font: Times New Roman 12pt (저널 템플릿 우선)
- Paragraph indent: 0.375 inch
- Page numbers: 하단 중앙
- Subheading auto-numbering 금지 (수동 번호)

### 적용 시 Writing Agent 프롬프트 내 삽입

모든 Phase 6 에이전트 프롬프트에 다음 instruction을 포함:

```
MANDATORY READ BEFORE WRITING:
  1. Read ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md
  2. Apply ALL formatting rules (numbers, units, references, commas)
  3. Apply ALL style rules (short sentences, connector phrases, abbreviation definitions)
  4. Self-check before output: run mental pass through style checklist
```

---

## 플랜 모드 (실행 전 필수)

파이프라인 시작 전, 아래 계획표를 사용자에게 제시하고 승인을 받는다:

```
┌─────────────────────────────────────────────────────┐
│          /research-autopilot 실행 계획               │
├────────┬──────────────────────┬───────┬──────────────┤
│ Phase  │ 작업                 │ Gate  │ 산출물       │
├────────┼──────────────────────┼───────┼──────────────┤
│ 0      │ 입력 파싱            │ -     │ context.md   │
│ 1      │ PRD + SOP 작성       │ 1A,1B,1│ PRD, SOP    │
│ 2      │ 시뮬레이션 설계      │ 2     │ Phase2.md    │
│ 3      │ 시뮬레이션 SOP/PRD   │ 3A,3  │ 3문서+인프라 │
│ 4      │ 통합 검증            │ 4     │ Gate4 보고서 │
│ ─ 세션 분할 권장 ─────────────────────────────────── │
│ 5A     │ Figure Set .md       │ 5A    │ Figure .md   │
│ 5B     │ ppt-image 4K 이미지  │ 5     │ PNG ×8-10    │
│ 6      │ 논문 초안 (7 Agent)  │ 6.0~6 │ Manuscript   │
│ 7      │ .docx 변환           │ 7     │ .docx        │
├────────┼──────────────────────┼───────┼──────────────┤
│ 합계   │ 18 에이전트          │17 Gate│ 20+ 파일     │
└────────┴──────────────────────┴───────┴──────────────┘

진행하시겠습니까? (Y/수정사항)
```

---

## Phase 완료 체크리스트 (누락 방지)

각 Phase 완료 시 반드시 아래 파일이 존재하는지 `ls`로 확인한다.

### Phase 1 완료 체크
```
- [ ] context_analysis.md
- [ ] PRD_{name}.md
- [ ] SOP_{name}.md
- [ ] Gate1 검증 보고서
```

### Phase 3 완료 체크
```
- [ ] simulations/SOP_sim_{name}.md
- [ ] simulations/PRD_sim_{name}.md
- [ ] simulations/MASTER_PLAN.md
- [ ] simulations/_plan/parameters.yaml      ← v3.0 추가
- [ ] simulations/_plan/pilot_gate.md        ← v3.0 추가
- [ ] simulations/_plan/dependency_graph.md  ← v3.0 추가
- [ ] simulations/_execution/status.yaml     ← v3.0 추가
- [ ] Gate3A 검증 보고서
```

### Phase 5 완료 체크
```
- [ ] Figure_Set_{name}.md                   ← 5A
- [ ] science_slide_01~N_4x3.png (×8-10개)   ← 5B (/paper-autopilot-open:ppt-image)
- [ ] Gate5 검증 보고서
```

### Phase 6 완료 체크
```
- [ ] Manuscript_{name}_Draft.md
- [ ] Gate6 검증 보고서
```

### Phase 7 완료 체크
```
- [ ] Manuscript_{name}_Draft.docx
```

---

## Gate 수정 반영 규칙 (v3.0 강제화)

Gate에서 Required Action이 나오면, **다음 Phase로 넘어가기 전에 반드시 수정을 실행**한다:

```
Gate N 완료 → Required Action 목록 추출
  ↓
[STEP: Gate N 수정 반영]  ← v3.0 추가
  각 Required Action을 즉시 실행 (파일 수정)
  수정 완료 확인 (Grep/Read로 검증)
  ↓
다음 Phase 진행
```

이 Step을 건너뛰는 것은 금지된다. Gate에서 "수정 필요"라고 판정하고 수정하지 않으면, 이후 모든 Phase의 품질이 저하된다.

---

## 세션 분할 가이드 (v3.0 추가)

이 파이프라인은 35회 에이전트 호출이 필요하여, 한 세션의 context window를 초과할 수 있다.

### 권장 세션 분할

```
세션 1: Phase 0 → Phase 4 (Gate 4 완료까지)
  → 연구 기획 + 시뮬레이션 설계 + 통합 검증
  → 약 20회 호출

세션 2: Phase 5 → Phase 7 (완료)
  → Figure + 논문 + .docx
  → 약 15회 호출
  → 시작 명령: /research-autopilot --resume "{folder}" --from phase5
```

### 세션 전환 시 인수인계 파일

세션 1 종료 시 자동 생성:
```
{project_folder}/session_handoff.md
  - 완료된 Phase/Gate 목록
  - 수정 반영 완료 목록
  - 미완료 항목
  - 다음 세션 시작 명령
```

---

## 설계 원칙

### 1. Verify-After-Every-Generation (VAEG)
```
생성 → 검증 → 수정 → 다음 생성 → 검증 → 수정 → ...
```
**모든 산출물은 검증 없이 다음 단계로 진행하지 않는다.**

#### 검증 실행 방식 (INLINE VERIFY)

이 파이프라인의 모든 게이트 검증은 **별도의 `general-purpose` 서브에이전트를 Task 도구로 dispatch**하여 수행한다 (외부 슬래시 커맨드에 의존하지 않는다). 핵심 규칙:

- **작성 에이전트 ≠ 검증 에이전트**: 산출물을 만든 에이전트가 자기 산출물을 검증하지 않는다. 새 general-purpose 서브에이전트를 열어 독립 context에서 채점한다 (자기검증 금지).
- **체크리스트 프롬프트**: 각 게이트의 "검증 항목"을 그대로 서브에이전트 프롬프트의 체크리스트로 넣는다. 서브에이전트는 파일을 읽고 각 항목에 PASS/FAIL + 근거를 리포트한다.
- **판정 4단계**: PASS / CONDITIONAL PASS / MAJOR REVISION / FAIL (아래 §4 기준 동일).
- **수정은 작성 에이전트가**: 검증 서브에이전트는 리포트만 한다. 수정은 원래 작성 에이전트에게 되돌려 지시한다.

아래에서 `[INLINE VERIFY — general-purpose 서브에이전트]`로 표기된 블록은 모두 이 방식을 의미한다. 표기된 검증 유형(`internal` / `cross` / `multi` / `scientific` / `technical`)은 프롬프트 체크리스트의 범위를 가리키는 라벨일 뿐, 별도 커맨드가 아니다.

### 2. Multi-Agent 분리 원칙
- 하나의 에이전트가 너무 많은 context를 소비하면 후반부 품질이 저하된다
- **각 산출물 = 독립 에이전트** → 공유 context 파일(SSOT)을 통해 연결
- 작성 에이전트와 검증 에이전트는 반드시 다른 호출이어야 한다 (자기 편향 방지)

### 3. 검증 4계층
| 계층 | 검증 방식 (INLINE VERIFY) | 검증 대상 |
|------|------|----------|
| L1 과학적 검증 | general-purpose 서브에이전트 (scientific 체크리스트) | 논리 체인, 수치, novelty, 실현 가능성 |
| L2 방향성 검증 | general-purpose 서브에이전트 (scientific 체크리스트) | 시뮬레이션 방향, 과학적 타당성, ML 검증 |
| L3 기술적 검증 | general-purpose 서브에이전트 (technical 체크리스트) | 파라미터, 수렴, 워크플로우, functional/PP |
| L4 섹션 간 정합 | general-purpose 서브에이전트 (independent, 자기검증 금지) | 수치·단위·참조·용어 일관성 |

### 4. Gate 판정 기준
| 판정 | 의미 | 다음 단계 |
|------|------|----------|
| **PASS** | 검증 통과 | 다음 단계 진행 |
| **CONDITIONAL PASS** | 경미한 수정 필요 | 수정 후 진행 (재검증 불필요) |
| **MAJOR REVISION** | 중대한 수정 필요 | 수정 후 **재검증 필수** |
| **FAIL** | 근본적 문제 | 사용자에게 보고, 방향 전환 논의 |

---

## 전체 파이프라인 (11 Gate)

```
Phase 0: 입력 → /paper-autopilot-open:parse → .md 변환
  │
Phase 1: Multi-Agent 기획
  ├─ Agent 1A: PRD 작성
  │   └─ Gate 1A: INLINE VERIFY (internal — PRD 내부 일관성)
  ├─ Agent 1B: SOP 작성
  │   └─ Gate 1B: INLINE VERIFY (cross — SOP 내부 + PRD↔SOP 교차)
  └─ Gate 1: INLINE VERIFY (scientific — 실험 플랜 과학적 검증)
       └─ 수정 반영 (PRD + SOP)
  │
Phase 2: simulation-data staging → 시뮬레이션 제안
  │
  └─ Gate 2: INLINE VERIFY (scientific — 시뮬레이션 방향성 + 과학적 타당성)
       └─ 수정 반영
  │
Phase 3: Multi-Agent 시뮬레이션 계획
  ├─ Agent 3A: 시뮬레이션 SOP
  ├─ Agent 3B: 시뮬레이션 PRD
  ├─ Agent 3C: MasterPlan
  │   └─ Gate 3A: INLINE VERIFY (multi — 3문서 간 교차 일관성)
  └─ Gate 3: INLINE VERIFY (technical — 시뮬레이션 계산 기술 검증)
       └─ 수정 반영
  │
Phase 4: 전체 통합 검증
  └─ Gate 4: INLINE VERIFY (scientific — 실험-계산 연결 + Figure 구성 가능성)
       └─ 수정 반영
  │
Phase 5: Multi-Agent Figure
  ├─ Agent 5A: Figure Set .md 작성
  │   └─ Gate 5A: INLINE VERIFY (cross — Figure↔Claim 매핑, 데이터 일관성)
  ├─ Agent 5B: /paper-autopilot-open:ppt-image → 4K 이미지 생성
  └─ Gate 5: Figure 정합성 검증 (Figure vs PRD/SOP 수치 대조)
       └─ 불합격 시: 5A 수정 → 5B 재실행
  │
Phase 6: Multi-Agent 논문 작성 (7 Agent + 4 Gate)
  ├─ Agent 6.0: Outline + SSOT 생성
  │   └─ Gate 6.0: Outline 구조 검증
  ├─ Agent 6.1: Results & Discussion 작성
  │   └─ Gate 6.1: R&D 검증 (Figure 참조, 수치 정확성)
  ├─ Agent 6.2: Experimental Section 작성 (병렬 가능)
  │   └─ Gate 6.2: Methods 검증 (재현 가능성)
  ├─ Agent 6.3: Introduction 작성 (R&D 완료 후)
  │   └─ Gate 6.3: Introduction 검증 (논리 전개, prior art 인용)
  ├─ Agent 6.4: Conclusion 작성 (R&D 완료 후)
  │   └─ Gate 6.4: Conclusion 검증 (과잉 주장 없는지)
  ├─ Agent 6.5: Abstract 작성 (전체 완료 후 — 마지막)
  │   └─ Gate 6.5: Abstract 검증 (수치 일치, word count)
  ├─ Agent 6.6: 조립 + 전체 교차 검증
  │   └─ Gate 6: INLINE VERIFY (scientific — 완성 논문 종합 검증)
  │        └─ 수정 반영
  │
Phase 7: 최종 산출물
  ├─ Agent 7A: .md에 Figure 경로 삽입
  ├─ Agent 7B: /paper-autopilot-open:docx 변환
  └─ Gate 7: 최종 .docx 정합성 확인
```

---

## Phase 0: 입력 파싱

### Step 0.1: 사용자 입력 확인

사용자로부터 다음을 확인:
1. **참고 논문**: PDF/DOCX 경로 (1개 이상)
2. **아이디어/컨셉**: 자연어 설명 (필수)
3. **타겟 저널**: EES / Joule / Adv. Energy Mater. / Nature Energy 등
4. **활물질 시스템**: LFP / NCM / NCA / Si 등
5. **출력 폴더**: 기본값 = config `papers_root` 하위

### Step 0.2: 논문 파싱

```
[SKILL: /paper-autopilot-open:parse]

각 참고 논문 PDF/DOCX에 대해:
  /paper-autopilot-open:parse "{paper_path}" --output "{output_folder}/scr"

결과: {논문명}.md 파일 생성
```

### Step 0.3: 논문 분석 & 아이디어 정리

파싱된 논문 .md를 읽고 다음을 추출:
- 논문의 핵심 contribution
- 실험 방법론
- 핵심 성과 수치
- 사용자 아이디어와의 접점

산출물: `{project_folder}/context_analysis.md`

이 파일이 전체 파이프라인의 **SSOT (Single Source of Truth)** 역할:
```yaml
context:
  papers: [{title, key_findings, methods, performance}]
  user_concept: ""
  target_journal: ""
  active_material: ""
  novelty_hypothesis: ""
  claims: []           # 논문의 3대 Claim (Phase 4에서 확정)
  key_numbers: {}      # 핵심 수치 레지스트리 (모든 에이전트가 참조)
```

---

## Phase 1: Multi-Agent 연구 기획

### Agent 1A: PRD 작성

```
[AGENT: PRD Writer]
입력: context_analysis.md
참조 템플릿: 9.Templates/project-prd.md
출력: {project_folder}/PRD_{project_name}.md

포함: OKR, Kanban, 리스크 매트릭스, Go/No-Go 게이트
```

### ─── Gate 1A: PRD 내부 정합성 (INLINE VERIFY) ───

```
[INLINE VERIFY — general-purpose 서브에이전트]
대상: PRD_{project_name}.md (type=internal, 문서 내부 일관성)
작성 에이전트와 분리된 general-purpose 서브에이전트를 dispatch, 독립 context에서 아래를 검증 (자기검증 금지):
  - 용어·약어·기호가 문서 내에서 일관되게 쓰였는가
  - 수치·단위·목표값이 상호 모순되지 않는가
  - 섹션/표/그림 참조 번호가 실재하는가
판정: PASS / CONDITIONAL PASS / MAJOR REVISION / FAIL
```

### Agent 1B: SOP 작성

```
[AGENT: SOP Writer]
입력: context_analysis.md + PRD_{project_name}.md
참조 템플릿: 9.Templates/project-sop.md
출력: {project_folder}/SOP_{project_name}.md

포함: 안전 수칙, Phase별 절차, 스크리닝 매트릭스, 데이터 기록 템플릿
```

### ─── Gate 1B: PRD↔SOP 교차 정합성 (INLINE VERIFY) ───

```
[INLINE VERIFY — general-purpose 서브에이전트]
대상: PRD_{project_name}.md + SOP_{project_name}.md (type=cross, 문서 간 교차)
작성 에이전트와 분리된 general-purpose 서브에이전트를 dispatch, 독립 context에서 아래를 검증 (자기검증 금지):
  - PRD의 목표·성공기준이 SOP 절차에서 달성 가능한가
  - 두 문서의 용어·수치·단위가 서로 일치하는가
  - PRD에 언급된 항목이 SOP에 누락 없이 반영되었는가
판정: PASS / CONDITIONAL PASS / MAJOR REVISION / FAIL
```

### ═══ Gate 1: 실험 플랜 과학적 검증 ═══

```
[INLINE VERIFY — general-purpose 서브에이전트 (scientific 체크리스트)]

대상: PRD + SOP (2개 문서)
검증 항목:
  ├─ 수치 검증 (목표 성능, 이론값, 문헌 비교)
  ├─ 논리 체인 분석 (P1→P2→...→C, 취약점 식별)
  ├─ 내부 일관성 (PRD ↔ SOP 교차 검증)
  ├─ 노벨티 검증 (closest prior art 식별)
  └─ 실현 가능성 (장비, 예산, 타임라인)

판정: PASS / CONDITIONAL PASS / MAJOR REVISION / FAIL
```

**PASS/CONDITIONAL**: 수정 반영 후 Phase 2 진행
**MAJOR REVISION**: Agent 1A/1B로 수정 → Gate 1 재실행
**FAIL**: 사용자에게 보고, 컨셉 재논의

산출물: `{project_folder}/검증보고서_Gate1_{project_name}.md`

---

## 시뮬레이션 데이터 정책 (Phase 2-3에서 참조)

시뮬레이션 데이터가 필요한 figure가 있는 경우: (1) 기본 경로는 사용자가 simulations/ 폴더에 계산 결과 데이터를 직접 준비하는 것 — figure_set의 해당 figure에 data_source를 명시, (2) 데이터가 아직 없으면 mockup은 hypothetical로 진행하고 해당 figure에 [SIM-DATA-NEEDED] 태그를 남긴다, (3) 계산화학 자동화 플러그인(예: compchem)이 별도로 설치되어 있다면 사용해도 되지만 이 플러그인의 요구사항이 아니다.

사용자는 본인의 로컬/자체 계산 환경(워크스테이션, HPC, 클라우드 등)에서 시뮬레이션을 수행하고, 그 결과 데이터를 `<paper>/simulations/`에 배치한다. 어떤 도구·인프라를 쓸지는 전적으로 사용자 재량이며 이 플러그인은 특정 계산 환경을 요구하지 않는다.

---

## Phase 2: 시뮬레이션 설계

### Agent 2: 시뮬레이션 제안

```
[STEP: 시뮬레이션 데이터 staging]

입력: PRD + SOP + 참고 논문 .md
출력:
  ├─ 접목 가능한 시뮬레이션 목록 (DFT, MD, COMSOL, FEM, DEM 등)
  ├─ 각 시뮬레이션의 목적 & 예상 결과
  ├─ 실험 데이터와의 연결 관계
  ├─ 필요 도구 vs 마스터 디스크 가용 도구 대조표
  └─ 우선순위 제안
```

산출물: `{project_folder}/simulations/시뮬레이션_제안.md`

### ═══ Gate 2: 시뮬레이션 방향성 검증 ═══

```
[INLINE VERIFY — general-purpose 서브에이전트 (scientific 체크리스트)]

대상: 시뮬레이션 제안서
검증 항목:
  ├─ 과학적 사실 정합성 (제안된 계산이 물리적으로 의미 있는가)
  ├─ 기존 문헌 대조 (유사 시뮬레이션 선례, 벤치마크 데이터)
  ├─ ML potential 사전 검증 (CHGNet, MACE 등으로 빠른 feasibility check)
  ├─ 계산 결과 예측의 합리성 (예상 수치가 물리적으로 타당한가)
  └─ 실험 데이터와의 연결 논리
```

산출물: `{project_folder}/simulations/검증보고서_Gate2_시뮬레이션방향성.md`

---

## Phase 3: Multi-Agent 시뮬레이션 상세 계획

Gate 2 검증 결과를 반영하여 3개 문서를 개별 에이전트로 작성:

### Agent 3A: 시뮬레이션 SOP

```
[AGENT: Simulation SOP Writer]
입력: 시뮬레이션_제안.md + Gate 2 검증보고서
출력: {project_folder}/simulations/SOP_sim_{project_name}.md

포함: step-by-step 계산 절차, 입출력 파일 명세, 수렴 기준
```

### Agent 3B: 시뮬레이션 PRD

```
[AGENT: Simulation PRD Writer]
입력: 시뮬레이션_제안.md + Gate 2 검증보고서
출력: {project_folder}/simulations/PRD_sim_{project_name}.md

포함: 목표, 성공 기준, 일정, 리소스
```

### Agent 3C: MasterPlan

```
[AGENT: Simulation Planner]
입력: SOP_sim + PRD_sim
출력: {project_folder}/simulations/MasterPlan_{project_name}.md

포함: 전체 계산 워크플로우, 의존 관계 DAG, Pilot Gate 설계
```

### ─── Gate 3A: 시뮬레이션 3문서 교차 검증 (INLINE VERIFY) ───

```yaml
inline_verify:  # general-purpose 서브에이전트, multi 체크리스트로 독립 실행
  대상: SOP_sim + PRD_sim + MasterPlan (3개)
  checks:
    - SOP의 계산 순서가 MasterPlan의 DAG와 일치하는가
    - PRD의 성공 기준이 SOP의 출력에서 추출 가능한가
    - 3문서 간 파라미터(functional, PP, k-points 등)가 일치하는가
    - MasterPlan의 Pilot Gate가 SOP Phase 1과 정렬되는가
```

### ═══ Gate 3: 계산 Technical 검증 ═══

```
[INLINE VERIFY — general-purpose 서브에이전트 (technical 체크리스트)]

대상: SOP_sim + PRD_sim + MasterPlan
검증 항목 (6대 오류 범주):
  ├─ L1 모델 오류: slab 크기, supercell, 진공층 등
  ├─ L2 파라미터 오류: functional, PP, U값, k-points, ecutwfc
  ├─ L3 워크플로우 오류: 계산 순서, fragment method, 단위 변환
  ├─ L4 수렴 오류: SCF, geometry opt, NEB 수렴 기준
  ├─ L5 해석 오류: 에너지 참조점, 통계 처리
  └─ L6 리소스 오류: 메모리, 시간, 코어 수 적정성
```

산출물: `{project_folder}/simulations/검증보고서_Gate3_기술검증.md`

---

## Phase 4: 전체 통합 검증

### ═══ Gate 4: 통합 일관성 검증 ═══

```
[INLINE VERIFY — general-purpose 서브에이전트 (scientific 체크리스트)]

대상: 전체 산출물 (PRD + SOP + 시뮬레이션 3문서 + 검증 보고서 전체)
검증 항목:
  ├─ 실험-계산 연결 정합성 (실험 데이터가 계산을 검증하는 관계가 성립하는가)
  ├─ Figure 구성 가능성 (현재 계획된 실험+계산으로 논문 Figure가 완성되는가)
  ├─ 누락된 실험/계산 (논문 스토리에 빠진 데이터가 있는가)
  ├─ 3대 Claim 구조 확인 (각 Claim에 독립적 증거가 2개 이상 있는가)
  └─ 타겟 저널 적합성 (novelty + depth가 타겟 저널 수준인가)
```

이 단계에서 **context_analysis.md의 claims와 key_numbers를 확정**한다.
이후 모든 에이전트는 이 확정된 SSOT를 참조.

산출물: `{project_folder}/검증보고서_Gate4_통합검증.md`

---

## Phase 5: Multi-Agent Figure 설계

### Agent 5A: Figure Set .md 작성

```
[AGENT: Figure Designer]
입력: context_analysis.md (claims, key_numbers 확정본) + PRD + SOP + 시뮬레이션 계획
출력: {project_folder}/Figure_Set_{project_name}.md

원칙:
  - Main Figure 6-8개
  - 각 Figure의 message = 하나의 Claim 지지
  - 가상 데이터는 key_numbers 레지스트리에서 인용
  - 대조군 반드시 포함
  - Caption 포함

  **패널 구성 규칙 (v3.0 추가)**:
  - 각 Figure는 최소 **8-9 패널 (a)~(i)** 이상으로 구성
  - 4-5패널은 빈약함 → Joule/EES/Nature Energy급 논문은 Figure가 꽉 차 보여야 함
  - 패널 확장 전략:
    (1) 저배율 + 고배율 SEM/TEM 쌍
    (2) 디지털 사진 (공정 과정, 시료 외관)
    (3) EDS 원소별 개별 map (Fe, F, S, N, O 각각)
    (4) 시간 추이 데이터 (cycle 1, 10, 50, 100, 500)
    (5) 다조건 비교 (온도별, 농도별, 로딩별)
    (6) 대조군 직접 대비 (Main vs Control 나란히)
    (7) 통계 바 차트 + 에러바 (3회 반복 결과)
    (8) Schematic/메커니즘 그림 (마지막 패널)
    (9) 시뮬레이션 snapshot + 실험 대비 overlay
  - 3×3 grid (9패널) 또는 2-row layout (상단 5 + 하단 4)이 가장 일반적
  - 빈 공간 없이 Figure 전체가 시각적으로 밀도 있게 채워져야 함
```

### ─── Gate 5A: Figure 정합성 (INLINE VERIFY) ───

```yaml
inline_verify:  # general-purpose 서브에이전트, cross 체크리스트로 독립 실행
  대상: Figure_Set_{project_name}.md
  checks:
    - 모든 Claim에 최소 1개 Figure가 매핑되는가
    - Figure 내 수치가 key_numbers 레지스트리와 일치하는가
    - 같은 수치가 여러 Figure에 나올 때 모두 일치하는가
    - 대조군이 모든 비교 Figure에 포함되어 있는가
    - Caption이 본문 없이도 이해 가능한가
    - 누락된 Figure (스토리에 필요하지만 빠진 패널)가 있는가
    - **각 Figure의 패널 수가 8개 이상인가** (4-5패널은 FAIL) ← v3.0 추가
    - Figure가 시각적으로 꽉 차 보이는 레이아웃인가 (3×3 또는 2-row)
```

### Agent 5B: 4K 이미지 생성

```
[SKILL: /paper-autopilot-open:ppt-image]

/paper-autopilot-open:ppt-image "{project_folder}/Figure_Set_{project_name}.md"
  --mode diagram --size 4K --ratio 4:3 --style science --lang en --ref
```

산출물: `{project_folder}/science_slide_0{N}_4x3_ref.png` × 6-8개

### ═══ Gate 5: Figure 정합성 검증 ═══

```yaml
gate_5:
  검증 방법: Figure_Set .md의 수치를 PRD/SOP/시뮬레이션 계획의 수치와 자동 대조
  checks:
    - Figure에 등장하는 모든 수치가 PRD 또는 SOP에 근거가 있는가
    - 시뮬레이션 Figure의 예상 수치가 simulation PRD 성공 기준과 일치하는가
    - Figure 순서가 논문 스토리 흐름(Claim 1→2→3)에 맞는가
  불합격 시: Agent 5A로 수정 → Agent 5B 재실행
```

---

## Phase 6: Multi-Agent 논문 작성

> **핵심 설계**: 각 섹션을 독립 에이전트가 작성. 공유 SSOT(`context_analysis.md` + `key_numbers`)로 수치 일관성 보장. 작성 순서는 의존 관계를 반영.

### SSOT 파일 구조

Phase 6 시작 전, 다음 파일이 공유 참조로 확정되어 있어야 한다:

```
{project_folder}/
├── context_analysis.md          # claims, key_numbers 확정
├── Figure_Set_{name}.md         # Figure 구성 + 가상 데이터
├── PRD_{name}.md                # 실험 계획
├── SOP_{name}.md                # 실험 절차
└── simulations/                    # 시뮬레이션 계획
```

### 작성 순서 및 의존 관계

```
                   ┌─────────────────────┐
                   │ Agent 6.0: Outline  │
                   │ (구조 + SSOT 확정)   │
                   └────────┬────────────┘
                            │
                   ┌────────▼────────────┐
                   │  Gate 6.0: Outline  │
                   │  구조 검증           │
                   └────────┬────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
    ┌─────────────┐  ┌────────────┐  (대기)
    │ Agent 6.1   │  │ Agent 6.2  │
    │ Results &   │  │ Methods    │  Agent 6.3, 6.4는
    │ Discussion  │  │ (병렬)     │  6.1 완료 후 시작
    └──────┬──────┘  └─────┬──────┘
           │               │
    ┌──────▼──────┐  ┌─────▼──────┐
    │ Gate 6.1    │  │ Gate 6.2   │
    │ R&D 검증    │  │ Methods    │
    └──────┬──────┘  │ 검증       │
           │         └────────────┘
     ┌─────┴──────────────┐
     ▼                    ▼
┌──────────┐      ┌──────────┐
│ Agent 6.3│      │ Agent 6.4│
│ Intro    │      │ Conclusion│
│(R&D 참조)│      │(R&D 참조) │
└────┬─────┘      └────┬─────┘
     │                  │
┌────▼─────┐      ┌────▼─────┐
│ Gate 6.3 │      │ Gate 6.4 │
│ Intro    │      │ Concl.   │
│ 검증      │      │ 검증     │
└────┬─────┘      └────┬─────┘
     └────────┬────────┘
              ▼
     ┌────────────────┐
     │ Agent 6.5      │
     │ Abstract       │
     │ (전체 완료 후)   │
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │ Gate 6.5       │
     │ Abstract 검증   │
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │ Agent 6.6      │
     │ 조립 + 교차검증  │
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │ Gate 6         │
     │ /research-     │
     │ verify 최종     │
     └────────────────┘
```

---

### Agent 6.0: Outline 설계

```
[AGENT: Paper Architect]
MANDATORY REFERENCE (READ FIRST):
  - ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md
    → Paragraph length, section structure, figure caption conventions 적용

입력: context_analysis.md + Figure_Set .md
출력: {project_folder}/paper/outline.md

내용:
  - Title 확정 (3개 옵션 → 1개 선택)
  - 3대 Claim 구조 최종 확인
  - 각 섹션의 목적, 분량(word count), Figure 배치
  - Introduction 4-paragraph 전개 방향
  - Results 섹션 구분 (Figure별)
  - Conclusion 요약 포인트 (★ Abstract와 중복 문장 금지 명시)
  - key_numbers 레지스트리 (모든 에이전트가 참조할 수치 표)
  - Target journal reference format 확정 (superscript / bracket / Nature)
```

### ─── Gate 6.0: Outline 구조 검증 ───

```yaml
gate_6_0:
  checks:
    - 모든 Figure가 Results 섹션에 배치되었는가
    - 3대 Claim 각각에 최소 2개 독립 증거(Figure/계산)가 매핑되는가
    - Introduction 전개가 논리적인가 (broad→specific→strategy→this work)
    - key_numbers에 빠진 핵심 수치가 없는가
    - 총 word count가 타겟 저널 제한 내인가
```

### Agent 6.1: Results & Discussion

```
[AGENT: Results Writer — Fable 5 권장]
MANDATORY REFERENCE (READ FIRST):
  - ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md
  → 숫자/단위 포맷: "150 nm", "mA h g⁻¹", "5C rate", "321 mA h g⁻¹" (소수점 제거)
  → 참고문헌 포맷 (superscript/bracket/Nature) 엄수
  → 연결어(however, in contrast, importantly) 활용
  → "using" → "with" 치환
  → Figure caption 레이블: "(a) X and (b) Y" (레이블이 앞에)

입력: outline.md + Figure_Set .md + key_numbers
출력: {project_folder}/paper/results.md

원칙:
  - 가장 긴 섹션 → 가장 높은 품질 에이전트 사용
  - Figure의 구체적 수치를 반드시 인용 (모호한 표현 금지)
  - (Figure 1a), (Figure 2b) 형식으로 참조
  - 각 subsection = 하나의 Figure
  - 대조군과의 비교 포함
  - Closest prior art 인용 및 차별점 명시
  - 문장 짧게, 단락 1페이지 초과 금지
  - 모든 abbreviation 첫 등장 시 정의
```

### ─── Gate 6.1: R&D 검증 ───

```yaml
gate_6_1:
  checks:
    - 모든 Figure 패널이 본문에서 참조되었는가
    - 본문에 등장하는 수치가 key_numbers 레지스트리와 일치하는가
    - 각 subsection의 마지막에 의미 해석이 있는가 (데이터 나열만 하지 않는가)
    - 대조군 비교가 매 subsection에 포함되는가
    - prior art [ref]가 적절히 인용되는가
```

### Agent 6.2: Experimental Section (병렬 가능)

```
[AGENT: Methods Writer]
MANDATORY REFERENCE (READ FIRST):
  - ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md
  → 단위 포맷 엄수: "150 nm", "mA h g⁻¹", "m² g⁻¹", "40 s", "24 h"
  → 시약 순도·장비 모델명 필수 포함
  → "using" → "with" 치환 ("carried out with XPS")
  → Contractions 금지 ("it is" only, never "it's")

입력: SOP_{name}.md + simulations/SOP_sim .md
출력: {project_folder}/paper/methods.md

원칙:
  - SOP를 논문 포맷으로 압축 (SOP의 상세 절차 → 핵심만)
  - Materials, Electrode Fabrication, Characterization, Electrochemical Testing, Computational Methods
  - 재현 가능한 수준의 상세함 유지
  - 모든 시약 purity (%, supplier) 명시
  - 모든 장비 model name + manufacturer 명시
```

### ─── Gate 6.2: Methods 검증 ───

```yaml
gate_6_2:
  checks:
    - Results에 등장하는 모든 분석/측정 방법이 Methods에 기술되었는가
    - 시약 순도, 장비 모델명이 포함되었는가
    - DFT/MD 파라미터가 simulation SOP와 일치하는가
    - 셀 조립 조건(전해액, separator 등)이 명시되었는가
```

### Agent 6.3: Introduction (R&D 완료 후)

```
[AGENT: Introduction Writer]
MANDATORY REFERENCE (READ FIRST):
  - ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md
  → 모든 abbreviation은 introduction 첫 등장 시 정의 (Abstract 등장 여부와 무관)
  → 연결어 활용 ("however", "in contrast to", "on the other hand")
  → 참고문헌 포맷 target journal에 맞춤 (Nature: "studied¹", others: "studied [1]." or "studied.¹")
  → 자동 번호 매기기 금지 — [1], [2] 수동 입력

입력: outline.md + results.md (완성본) + 참고 논문 .md
출력: {project_folder}/paper/introduction.md

원칙:
  - 4-paragraph 구조 (broad → specific → strategy → this work)
  - Results의 핵심 수치를 "this work" paragraph에서 미리 언급
  - Closest prior art 반드시 인용 + 차별점 3가지 이상
  - Placeholder 참고문헌: [1], [2], ...
  - "for the first time" 등 근거 없는 과잉 주장 금지
```

### ─── Gate 6.3: Introduction 검증 ───

```yaml
gate_6_3:
  checks:
    - 4-paragraph 구조를 따르는가
    - Paragraph 3 (strategy)이 "왜 이 방법인가"를 명확히 설명하는가
    - Paragraph 4 (this work)의 수치가 Results와 일치하는가
    - Closest prior art가 인용되고 차별점이 명시되었는가
    - 과잉 주장이 없는가 ("for the first time" 등 근거 없는 표현)
```

### Agent 6.4: Conclusion (R&D 완료 후)

```
[AGENT: Conclusion Writer]
MANDATORY REFERENCE (READ FIRST):
  - ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md
  → ★ CRITICAL: Abstract와 동일한 문장 금지 (같은 의미라도 표현 다르게)
  → 과잉 주장 금지
  → 간결하고 명료하게

입력: outline.md + results.md + abstract.md (Agent 6.5가 먼저 나온 경우)
출력: {project_folder}/paper/conclusion.md

원칙:
  - ~250 words
  - Results에 있는 내용만 요약 (새로운 정보 추가 금지)
  - 3대 Claim을 각각 1-2문장으로 정리
  - 연구 의의 (broad impact)
  - 향후 방향 (선택)
  - Abstract와 phrasing 중복 금지 — 같은 수치라도 다른 문장 구조
```

### ─── Gate 6.4: Conclusion 검증 ───

```yaml
gate_6_4:
  checks:
    - Results에 없는 주장이 Conclusion에 있지 않은가 (과잉 주장)
    - 핵심 수치가 Results와 일치하는가
    - 250 words 이내인가
    - 향후 방향이 현실적인가
```

### Agent 6.5: Abstract (전체 완료 후 — 마지막)

```
[AGENT: Abstract Writer]
MANDATORY REFERENCE (READ FIRST):
  - ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md
  → 수치 포맷 엄수: "321 mA h g⁻¹ at 5C rate" (NOT "321.7 mAh/g at 5 C")
  → 용량값 소수점 제거
  → ★ Conclusion과 동일한 문장 금지 (같은 수치라도 다른 phrasing)
  → 첫 등장 abbreviation 정의 (약어 뒤 괄호로 full name)
  → "using" → "with", contractions 금지

입력: introduction.md + results.md + conclusion.md + key_numbers
출력: {project_folder}/paper/abstract.md

원칙:
  - 150-250 words (타겟 저널 규정 확인)
  - 구조: Background → Problem → Method → Key Results (수치 포함) → Significance
  - key_numbers에서 가장 인상적인 3-5개 수치 선택
  - 전체 논문의 "축소판"이어야 함
  - Conclusion과 수치는 일치하되 문장은 다르게
```

### ─── Gate 6.5: Abstract 검증 ───

```yaml
gate_6_5:
  checks:
    - word count가 150-250 범위인가
    - 언급된 수치가 Results/Conclusion과 정확히 일치하는가
    - Background-Problem-Method-Results-Significance 구조를 따르는가
    - 논문에 없는 내용이 Abstract에 있지 않은가
    - 가장 중요한 성과 수치가 빠지지 않았는가
```

### Agent 6.6: 조립 + 전체 교차 검증 + Style Audit

```
[AGENT: Manuscript Assembler]
MANDATORY REFERENCE:
  - ${CLAUDE_PLUGIN_ROOT}/references/paper-writing-tips.md

입력: abstract.md + introduction.md + results.md + methods.md + conclusion.md + Figure captions
출력: {project_folder}/Manuscript_{project_name}_Draft.md

작업:
  1. 모든 섹션을 하나의 .md로 조립
  2. 전체 교차 검증 수행:
     - Abstract ↔ Results ↔ Conclusion 수치 일치
     - Introduction의 [ref] 번호 순서 정렬
     - Figure 참조 번호 연속성 확인
     - 단위 표기 일관성 (mA h g⁻¹ 통일, NOT mAh/g)
  3. ★ STYLE AUDIT (Paper Writing Tips 기반):
     - 숫자/단위 공백: "150 nm", "mA h g⁻¹", "5C rate", "40 s"
     - 용량값 소수점 제거: "321 mA h g⁻¹"
     - 참고문헌 포맷 target journal 맞춤 (Nature vs others)
     - Contractions 검출 ("it's" → "it is")
     - "using" → "with"
     - 모든 abbreviation 첫 등장 정의 확인
     - Abstract ↔ Conclusion 중복 문장 검출
     - 자동 번호 매기기 흔적 제거
     - Oxford comma 검증 (3+ items)
     - 복합어 하이픈: "lithium-metal anode"
  4. 불일치/위반 발견 시 자동 수정 + 수정 로그 남김
```

### ═══ Gate 6: 완성 논문 종합 검증 ═══

```
[INLINE VERIFY — general-purpose 서브에이전트 (scientific 체크리스트)]

대상: Manuscript_{project_name}_Draft.md (완성본)
검증 항목:
  ├─ Abstract가 논문 전체를 정확히 반영하는가
  ├─ Introduction 논리 전개 완성도
  ├─ Results의 모든 주장에 Figure 근거가 있는가
  ├─ Experimental이 재현 가능한 수준인가
  ├─ Conclusion이 Results를 초과하지 않는가
  ├─ 전체 수치 일관성 (Abstract ↔ Results ↔ Conclusion)
  ├─ 참고문헌 누락 확인
  └─ 타겟 저널 포맷/분량 적합성
```

산출물: `{project_folder}/검증보고서_Gate6_논문초안.md`

---

## Phase 7: 최종 산출물

### Agent 7A: Figure 경로 삽입

Manuscript .md에 Figure 이미지 경로를 삽입:
```markdown
### 2.1 In-situ Crosslinking ...

[본문]

![Figure 1](science_slide_01_4x3_ref.png)
**Figure 1.** [Caption]
```

### Agent 7B: .docx 변환

```
[SKILL: /paper-autopilot-open:docx]

/paper-autopilot-open:docx "{project_folder}/Manuscript_{project_name}_Final.md"
```

### ─── Gate 7: 최종 .docx 정합성 ───

```yaml
gate_7:
  checks:
    - .docx가 에러 없이 생성되었는가
    - Figure 이미지가 .docx에 삽입되었는가
    - 볼드/이탤릭 등 서식이 깨지지 않았는가
    - Figure caption이 해당 Figure 아래에 배치되었는가
```

---

## 최종 산출물 목록

```
{project_folder}/
├── scr/                              # 파싱된 참고 논문 .md
├── context_analysis.md               # Phase 0 SSOT (claims, key_numbers)
│
├── PRD_{name}.md                     # 실험 PRD (검증 반영)
├── SOP_{name}.md                     # 실험 SOP (검증 반영)
├── 검증보고서_Gate1_{name}.md         # 실험 플랜 검증
│
├── simulations/
│   ├── 시뮬레이션_제안.md             # 시뮬레이션 목록
│   ├── 검증보고서_Gate2_방향성.md      # 방향 검증
│   ├── SOP_sim_{name}.md        # 시뮬레이션 SOP
│   ├── PRD_sim_{name}.md        # 시뮬레이션 PRD
│   ├── MasterPlan_{name}.md          # 마스터플랜
│   └── 검증보고서_Gate3_기술.md        # 기술 검증
│
├── 검증보고서_Gate4_통합.md           # 통합 검증
│
├── Figure_Set_{name}.md              # Figure 구성 .md
├── science_slide_0{N}*.png           # 4K Figure ×6-8
├── 검증보고서_Gate5_Figure.md         # Figure 정합성
│
├── paper/
│   ├── outline.md                    # 논문 Outline + SSOT
│   ├── results.md                    # Results & Discussion
│   ├── methods.md                    # Experimental Section
│   ├── introduction.md               # Introduction
│   ├── conclusion.md                 # Conclusion
│   └── abstract.md                   # Abstract
│
├── Manuscript_{name}_Draft.md        # 조립된 논문 초안
├── 검증보고서_Gate6_논문.md           # 논문 종합 검증
├── Manuscript_{name}_Final.md        # Figure 경로 삽입본
└── Manuscript_{name}_Final.docx      # 최종 Word (Figure 포함)
```

---

## 실행 모드

### 전체 실행 (기본)
```
/research-autopilot "{논문.pdf 경로}" 아이디어 설명
```

### 특정 Phase부터 재개
```
/research-autopilot --resume "{project_folder}" --from phase3
```

### 특정 Gate만 재실행
```
/research-autopilot --resume "{project_folder}" --gate 2
```

### Figure만 재생성
```
/research-autopilot --resume "{project_folder}" --figure-only
```

### 논문만 재작성
```
/research-autopilot --resume "{project_folder}" --paper-only
```

### 특정 논문 섹션만 재작성
```
/research-autopilot --resume "{project_folder}" --rewrite introduction
/research-autopilot --resume "{project_folder}" --rewrite results
```

---

## 실행 시 사용자 상호작용 포인트

| 시점 | 질문 | 기본 행동 |
|------|------|----------|
| Phase 0 완료 | "논문 분석 + 아이디어 정리가 맞나요?" | 확인 후 진행 |
| Gate 1 결과 | "검증 결과를 확인하세요" | PASS면 자동 진행 |
| Phase 2 완료 | "시뮬레이션 중 수행할 것을 선택하세요" | 전체 수행 |
| Gate FAIL 시 | "FAIL 판정. 방향을 바꿀까요?" | 대기 |
| Gate 6.0 완료 | "논문 Outline을 확인하세요. Title 선택해주세요" | 확인 후 진행 |
| Phase 5 완료 | "Figure를 확인하세요" | 확인 후 진행 |
| Phase 7 완료 | "최종 .docx를 확인하세요" | 완료 |

---

## 에이전트 총 호출 횟수

| Phase | 에이전트 수 | Gate 수 | 총 호출 |
|-------|-----------|---------|--------|
| Phase 0 | 1 (/paper-autopilot-open:parse) | 0 | 1 |
| Phase 1 | 2 (PRD + SOP) | 3 (1A + 1B + Gate1) | 5 |
| Phase 2 | 1 (simulation-data staging) | 1 (Gate2) | 2 |
| Phase 3 | 3 (SOP + PRD + Plan) | 2 (3A + Gate3) | 5 |
| Phase 4 | 0 | 1 (Gate4) | 1 |
| Phase 5 | 2 (Figure + ppt-image) | 2 (5A + Gate5) | 4 |
| Phase 6 | 7 (6.0~6.6) | 7 (6.0~6.5 + Gate6) | 14 |
| Phase 7 | 2 (7A + 7B) | 1 (Gate7) | 3 |
| **합계** | **18 에이전트** | **17 Gate** | **35 호출** |

**검증 비율**: 17 Gate / 18 생성 = **94% 검증 커버리지**

---

## 중간 검증 규칙 (INLINE VERIFY 독립 호출)

위에 명시된 Gate 외에도, **모든 .md 생성/수정 시** 별도 general-purpose 서브에이전트로 문서정합 검증을 독립 context에서 수행:

```yaml
inline_verify_auto:
  triggers:
    - 새로운 .md 파일 생성 시
    - 기존 .md 파일 수정 시 (검증 반영)

  실행:
    - general-purpose 서브에이전트 dispatch (internal 체크리스트)
    - 대상 파일 경로 + (있으면) SSOT 파일 경로를 프롬프트에 전달
    - 체크리스트: 용어·수치·단위·참조 일관성, SSOT와의 정합

  원칙:
    - 생성 Agent가 직접 검증하지 않음 (자기검증 금지 — 새 서브에이전트가 검증)
    - 검증은 반드시 별도 서브에이전트 dispatch로 실행
    - 불일치 발견 시 → 생성 Agent에게 수정 지시 (검증 서브에이전트는 수정하지 않음)
```

---

## 스킬 의존성

| 의존성 | 용도 | 호출 Phase |
|------|------|-----------|
| `/paper-autopilot-open:parse` | PDF/DOCX → .md 변환 | Phase 0 |
| INLINE VERIFY (scientific) | 과학적/방향성/통합/논문 검증 (general-purpose 서브에이전트) | Gate 1, 2, 4, 6 |
| INLINE VERIFY (internal/cross/multi) | 문서 정합성 독립 검증 (general-purpose 서브에이전트) | Gate 1A, 1B, 3A, 5A, 자동 |
| `simulation-data staging` | 시뮬레이션 제안 | Phase 2 |
| INLINE VERIFY (technical) | 시뮬레이션 계산 기술 검증 (general-purpose 서브에이전트) | Gate 3 |
| `/paper-autopilot-open:ppt-image` | 4K Figure 이미지 생성 | Phase 5 |
| `/paper-autopilot-open:docx` | .md → .docx 변환 | Phase 7 |
| experimental-plan 스킬 | 학생용 실험 SOP 생성 | Phase 1 이후 (선택) |
| INLINE VERIFY (SOP) | 실험 SOP 독립 검증 (general-purpose 서브에이전트) | SOP 생성 후 |

---

## 시작

사용자 입력을 확인하고 Phase 0부터 순차적으로 실행하세요.

1. 참고 논문 경로와 아이디어를 확인
2. /paper-autopilot-open:parse로 논문 변환
3. 각 Phase를 순서대로 실행, 에이전트별 독립 호출
4. 모든 Gate에서 검증 수행 (작성 에이전트 ≠ 검증 에이전트)
5. Gate 판정에 따라 수정 또는 진행
6. 각 Phase 완료 후 진행 상황을 사용자에게 표시
7. 최종 .docx 산출

**핵심: 생성 → 검증 → 수정 사이클을 빠짐없이 실행한다. 94% 검증 커버리지.**
