---
type: workflow-spec
title: paper-autopilot Workflow — Mental Model + State Transitions
created: 2026-04-30
---

# WORKFLOW — paper-autopilot

> **Mental model + 상태 전이.** PRD가 *무엇을 만드는가*, SOP가 *어떻게 쓰는가*면, WORKFLOW는 *왜 이 흐름인가*.

## 1. 핵심 mental model

논문 작성은 **선형이 아니다**. **mockup이 중심에 있는 feedback loop**다:

```
아이디어 ↔ 데이터 ↔ Mockup ↔ 작성 ↔ 실험/계산 보강 ↔ 다시 Mockup ↔ ...
```

paper-autopilot은 이 loop를 표준화·자동화한다.

## 2. 전체 워크플로우

```
[0. 사용자 아이디어 + figure set]
      │
      ▼
[1. folder-scaffold]                  ← 6폴더 + CLAUDE.md hub + _paper.md
      │
      ▼
[2. research-autopilot V1]            ← Phase 1-7 (PDF → mockup V1 → manuscript V1 → docx)
   ├─ 2a. context_analysis.md
   ├─ 2b. 시뮬레이션 데이터 staging → simulations/
   ├─ 2c. mockup V1 → mockup/[YYMMDD_v1]/
   └─ 2d. academic-writing WRITE → output/[YYMMDD_v1]/manuscript.md
      │
      ▼
[3. /paper-autopilot-open:docx] → output/[YYMMDD]/manuscript.docx
      │
      ▼ ◀───────────────────────────┐
[4. experimental-plan]               │
   ├─ GAP / TARGET / PLAN            │
   └─ experimental_plan/[YYMMDD]/    │
      │                              │
      ▼                              │
[5. 시뮬레이션 계획 설계]            │
   ├─ 계산 워크플로 설계             │
   └─ MLIP 검증                      │
      │                              │
      ▼                              │
[6. (실험·계산 실행)]                │
   ├─ 학생/공동작업자가 실행         │
   └─ 결과 → input/[YYMMDD]/         │
      │                              │
      ▼                              │
[7. mockup-evolver V2 → V3 → ...]    │
   └─ DIFF.md 생성                   │
      │                              │
      ▼                              │
[8. academic-writing CORRECT]        │
   └─ DIFF.md 따라 영향 단락만 polish─┘ (loop 반복)
      │
      ▼ (V_n+1 → V_n+2 → ...)
[9. 투고 준비]
   └─ academic-writing CORRECT (cover letter + 형식 변환)
      │
      ▼
[10. /paper-autopilot-open:review-paper] → 6-agent referee
      │
      ▼
[제출]
```

## 3. State 모델

### SSOT (Single Source of Truth)

| 정보 | 위치 |
|------|------|
| 논문 메타 | `_paper.md` frontmatter |
| 다음 액션 | `CLAUDE.md` "다음 액션" 줄 |
| 계산 진행 | `simulations/_execution/status.yaml` |
| 현재 mockup | `mockup/<latest>/` |
| 현재 manuscript | `output/<latest>/` |
| 실험 SOP | `experimental_plan/<latest>/` |
| 변경 이력 | `CLAUDE.md` "변경 이력" 표 + `.paper-autopilot/log.md` |

### Stage 정의

`NEW → FOLDER_READY → MOCKUP_V_N → DRAFT_V_N → EXPERIMENT_PENDING → EVOLVE_PENDING → SUBMIT_READY`

상세는 `skills/paper-autopilot/references/state-model.md` 참조.

### 재개 프로토콜

paper-autopilot 호출 시:
1. CLAUDE.md 자동 로드 (Claude Code 기본)
2. pa-state-analyzer → 현재 stage 추론
3. CLAUDE.md "다음 액션" 우선
4. 사용자 confirm → next skill 디스패치
5. 작업 후 pa-context-keeper가 CLAUDE.md + _paper.md 갱신

이 5단계 덕에 **세션 단절돼도 다음 호출 시 자동 재개**.

## 4. Feedback Loop 메커니즘

### 왜 mockup이 중심인가

Mockup은 **데이터의 가설**:
- 실험이 "어떤 결과를 보여줄 것인가" 가정
- 계산이 "어떤 값을 도출해야 하는가" 가정
- Figure가 "어떻게 보일 것인가" 가정

가설이 명시적이라 **gap이 즉시 보임**. mockup-evolver가 진짜 데이터로 점진 대체.

### 진화 규칙

```
mockup V_n ← 새 input
   ↓ gap 분석 (mockup-evolver)
mockup V_n+1 = V_n + 실제 데이터 + (남은) 가설
   ↓
DIFF.md (어느 단락 영향 받는지)
   ↓
academic-writing CORRECT (영향 단락만 polish)
   ↓
manuscript V_n+1
```

mockup 폴더가 **버전별로 누적**되므로 storyline 진화가 보존됨.

### 종료 조건

- 모든 mockup figure가 실제 데이터로 대체
- `_paper.md.progress: 100`
- 사용자 "투고 결정" 명시 (G6 gate)

## 5. Skill 합성 (composition over reinvention)

paper-autopilot은 **재구현하지 않는다.** 호출만:

```
paper-autopilot orchestrator (skill)
    │
    ├─ folder-scaffold              (plugin/skills/folder-scaffold)
    ├─ research-autopilot           (plugin/skills/research-autopilot)
    ├─ academic-writing             (plugin/skills/academic-writing)
    ├─ experimental-plan            (plugin/skills/experimental-plan)
    ├─ mockup-evolver               (plugin/skills/mockup-evolver)
    ├─ version-enforcer             (plugin/skills/version-enforcer)
    └─ {paper-access, paper-corpus-mining, pdf-figure-extract}   (최상위 스킬)
       ↓
       (번들 커맨드 / 외부 호출)
       ├─ (선택) 사용자 자체 계산 환경 결과 데이터 staging
       ├─ /paper-autopilot-open:docx, /paper-autopilot-open:ppt-image, /paper-autopilot-open:parse
       └─ /paper-autopilot-open:review-paper
```

## 6. 결정 게이트 (G1-G6)

상세는 `skills/paper-autopilot/references/decision-gates.md`. 기본 default = ask. 사용자 자연어 지시(`pa-gate-router`)로 자동/수동 분배.

| Gate | 묻는 내용 |
|------|---------|
| G1 | research-autopilot 진행? |
| G2 | 이 storyline으로 academic-writing? |
| G3 | 추천 target journal 동의? |
| G4 | 이 계산 방향? |
| G5 | manuscript V_n+1 갱신? |
| G6 | 투고? (ALWAYS ask) |

## 7. 핵심 invariant

1. **NEVER 옛 `[YYMMDD_*]` 폴더 삭제** — append-only
2. **NEVER simulations/ 임의 수정** — 사용자 시뮬레이션 데이터 영역
3. **NEVER `_paper.md.created` 변경** — historical record
4. **ALWAYS CLAUDE.md "다음 액션" 갱신** — stage 종료 시
5. **ALWAYS `[YYMMDD_내용]` 컨벤션 준수** (version-enforcer)
6. **G6 (투고) ALWAYS ask** — 비가역 액션

## 8. 다른 문서

- [README.md](./README.md) — 진입점
- [INSTALL.md](./INSTALL.md) — 설치
- `skills/paper-autopilot/SKILL.md` — orchestrator skill
- `skills/paper-autopilot/references/state-model.md` — stage 정의
- `skills/paper-autopilot/references/decision-gates.md` — G1-G6
- `skills/paper-autopilot/references/skill-dispatch.md` — stage → skill mapping
- `references/version-mgmt-rules.md` — `[YYMMDD_내용]`
- `references/claude-md-hub-template.md` — CLAUDE.md hub 구조
- `references/style-guide.md` — 작성 스타일
