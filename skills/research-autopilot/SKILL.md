---
name: research-autopilot
description: |
  Battery / materials science research paper full-pipeline orchestrator (v3.0). PDF/idea → PRD/SOP → simulation infrastructure → verification → figure mockup → manuscript draft → docx in 7 phases. Multi-agent decomposition (each artifact = independent agent for context isolation). Mandatory verification gates between phases.

  TRIGGER: paper-autopilot dispatches when stage = FOLDER_READY (no figures yet) or user invokes `/research-autopilot` directly. Do NOT use after MOCKUP_V_N — at that stage, dispatch academic-writing instead.
---

# Research-Autopilot Skill

Full-pipeline paper drafting from idea/PDF to manuscript.docx. Originally a 1190-line slash command, now ported as plugin skill.

## Setup — read these references

1. `references/full-pipeline.md` — complete v3.0 pipeline definition (1190 lines, original command)
2. `../../references/style-guide.md` — battery/materials writing style enforced by all writing agents
3. `../paper-autopilot/references/decision-gates.md` — gate behavior (G1-G6)

## 7-Phase pipeline summary

| Phase | 내용 | sub-agents |
|-------|------|----------|
| **0** | 입력 파싱 (PDF → /paper-autopilot-open:parse → .md) | (skill 자체) |
| **1** | Multi-Agent 연구 기획 (PRD + SOP) | ra-prd-author, ra-sop-author |
| **2** | 시뮬레이션 데이터 staging | (사용자 시뮬레이션 환경) |
| **3** | Multi-Agent 시뮬레이션 상세 계획 (sim SOP/PRD/MasterPlan) | (인라인 프롬프트로 general-purpose 위임 — full-pipeline.md Phase 3 참조) |
| **4** | 전체 통합 검증 | (verify gates) |
| **5** | Multi-Agent Figure (Figure Set md → /paper-autopilot-open:ppt-image 4K) | ra-figure-set + /paper-autopilot-open:ppt-image |
| **6** | Multi-Agent 논문 작성 (Abstract + Intro + Methods + R&D + Conclusion) | ra-abstract, ra-introduction, ra-experimental, ra-results-discussion, ra-conclusion |
| **7** | .docx 변환 | /paper-autopilot-open:docx |

## 핵심 원칙 (full-pipeline.md §2)

1. **Verify-After-Every-Generation (VAEG)**: 각 artifact 생성 후 즉시 verification gate
2. **Multi-Agent 분리**: 한 agent context 과부하 방지 — 각 산출물 = 독립 agent
3. **검증 4계층**: A. Internal (단일 doc 일관성) → B. Cross (doc 간) → C. Multi (3+ doc 교차) → D. Pilot Gate (실험 검증)
4. **Gate 판정**: PASS / CONDITIONAL (수정 후 재검증) / FAIL (단계 전체 재실행)
5. **세션 분할**: 기본은 단일 세션 통주행 (1M context). context 소진 징후가 실제로 나타날 때만 Phase 4/5 경계에서 분할
6. **Plan mode**: 실행 전 전체 계획표 사용자에게 제시 → 승인 후 진행

## 작성 스타일 강제

모든 writing agent (Phase 6) 프롬프트에 다음 mandatory 첨부:

```
MANDATORY READ BEFORE WRITING:
  1. paper-autopilot의 references/style-guide.md (numbers, units, references, commas, abbreviations)
  2. Apply ALL formatting rules
  3. Apply ALL style rules
  4. Self-check before output: §1-§8 mental pass
```

## paper-autopilot 통합

paper-autopilot orchestrator는 다음 시점에 research-autopilot 호출:

| current_stage | research-autopilot phase |
|---------------|--------------------------|
| FOLDER_READY (no figures from user) | Phase 0 → 7 (full) |
| FOLDER_READY (with figures from user) | Phase 5 → 7 (skip Phase 1-4, use existing figures) |

## 출력 (Phase별)

| Phase | 출력 위치 |
|-------|---------|
| 0 | `<paper>/input/[YYMMDD_parsed]/source.md` |
| 1 | `<paper>/_PRD.md`, `<paper>/_SOP.md` (top-level meta) |
| 2 | `<paper>/simulations/MASTER_PLAN.md` (user-staged) |
| 3 | `<paper>/simulations/_plan/{parameters.yaml, dependency_graph.md, pilot_gate.md}` |
| 4 | `<paper>/simulations/_verification/verification_report.md` |
| 5A | `<paper>/mockup/[YYMMDD_v1]/figure_set.md` |
| 5B | `<paper>/mockup/[YYMMDD_v1]/Fig*.png` (via /paper-autopilot-open:ppt-image 4K) |
| 6 | `<paper>/output/[YYMMDD_v1]/manuscript.md` (각 섹션 .md 합본) |
| 7 | `<paper>/output/[YYMMDD_v1]/manuscript.docx` |

## Phase 6 sub-agents 호출 패턴

각 섹션은 **별도 agent**로 작성, 공유 context 파일(SSOT)을 통해 연결:

```
context_analysis.md (SSOT)
   ↓
   ├─ ra-abstract      ← reads SSOT
   ├─ ra-introduction  ← reads SSOT + ra-abstract
   ├─ ra-experimental  ← reads SSOT + style-guide
   ├─ ra-results-discussion  ← reads SSOT + figure_set.md
   └─ ra-conclusion    ← reads SSOT + all above
```

병렬 dispatch: `ra-abstract` ∥ `ra-experimental` ∥ `ra-results-discussion` 은 상호 독립 — 동시 dispatch. `ra-introduction`은 abstract 완료 후, `ra-conclusion`은 전 섹션 완료 후 실행.

## 사용 예 (paper-autopilot 호출)

```
User: /paper-autopilot-open:paper-autopilot:scaffold "NewPaper" + "PDF: /path/Wang2023.pdf"
  ↓
paper-autopilot dispatches:
  1. folder-scaffold ("NewPaper")
  2. research-autopilot Phase 0 → input/[YYMMDD_parsed]/
  3. (G1 gate) research-autopilot Phase 1-7 자동 진행 OR ask
  ↓
output: NewPaper/output/[YYMMDD_v1]/manuscript.{md,docx}
```

## Constraints

- **Always plan mode first** — 사용자에게 7-Phase 계획표 보여주고 진행 승인 받기
- **VAEG 강제** — verification gate 우회 금지
- **Figure는 Phase 5에서만** — Phase 6 writing 시 figure 추가 금지 (mockup-evolver 영역)
- **Phase 6 각 섹션은 분리 agent** — single agent로 통합 작성 금지
- **Style guide MANDATORY** — Phase 6 모든 agent prompt에 첨부

## Footer

원본 1190-line command가 `references/full-pipeline.md`에 그대로 보존됨. SKILL.md는 진입점 + paper-autopilot 통합용 thin wrapper. 세부 절차는 references/full-pipeline.md 참조.
