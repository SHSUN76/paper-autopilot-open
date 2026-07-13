# Skill Dispatch — paper-autopilot orchestration

> 각 stage에서 어떤 sub-skill을 호출하는지 명시.

## Stage → Skill mapping

| current_stage | dispatched skill | 실행 모드 | agents 사용 |
|---------------|------------------|---------|-----------|
| `NEW` | `folder-scaffold` | scaffold | (skill 자체) |
| `FOLDER_READY` (no figures) | `research-autopilot` | Phase 1-7 full | ra-prd-author, ra-sop-author, (sim 계획=인라인 general-purpose 위임), ra-figure-set, ra-{abstract,intro,results,exp,conclusion} |
| `FOLDER_READY` (with figures from user) | `research-autopilot` Phase 5 → `academic-writing` WRITE figure-first | Shape A | ra-figure-set + aw-figure-vision + aw-section-drafter |
| `MOCKUP_V_N` (PNG 부재) | `/paper-autopilot-open:ppt-image` per Main figure → mockup/[YYMMDD_v1]/Fig*.png | 3×3 layout 권장 (v1.0.1) | (번들 커맨드 /paper-autopilot-open:ppt-image 호출) |
| `MOCKUP_V_N` (PNG 존재) | `academic-writing` WRITE | Shape A (figure-first) | aw-figure-vision (analyze) + aw-figure-logic + aw-section-drafter (Mode E) |
| `DRAFT_V_N` | `experimental-plan` | GAP → TARGET → PLAN | ep-gap-analyzer, ep-target-finder, ep-sop-writer |
| `EXPERIMENT_PENDING` | (wait — student executing) | — | — |
| `SOP_READY` | (wait — input/ data 도착 대기) | — | — |
| `EVOLVE_PENDING` | `mockup-evolver` → `academic-writing` CORRECT | differential | (skill 자체) → aw-prose-polisher |
| `SUBMIT_READY` | `academic-writing` CORRECT | submit prep | aw-* reviewers + aw-bibliography-auditor + aw-style-checker |

## Always-on agents

다음 agents는 stage와 무관하게 매 호출 시 작동:

| Agent | 호출 시점 | 책임 |
|-------|---------|------|
| `pa-state-analyzer` | every invoke | stage 추론 |
| `pa-gate-router` | every invoke | 사용자 자연어 게이트 지시 파싱 |
| `pa-version-enforcer` | before any file write | [YYMMDD_내용] 강제 |
| `pa-context-keeper` | after every stage | CLAUDE.md hub + _paper.md 갱신 |

## 번들 커맨드 호출

paper-autopilot은 이 플러그인에 **번들된 커맨드**들을 호출한다 (외부 플러그인 아님):

| 번들 커맨드 | 호출 시점 |
|---------|---------|
| `/paper-autopilot-open:docx` | manuscript.md → manuscript.docx |
| `/paper-autopilot-open:ppt-image` | mockup figure 이미지 생성 |
| `/paper-autopilot-open:parse` | PDF → md 변환 (research-autopilot Phase 0) |
| `/paper-autopilot-open:review-paper` | 투고 전 6-agent referee |

## Plugin 외부 (사용자 환경) 호출

paper-autopilot은 다음 외부 도구도 호출 (plugin에 흡수되지 않음):

| 외부 도구 | 호출 시점 |
|---------|---------|
| 시뮬레이션 데이터 staging | research-autopilot Phase 2 — 사용자가 `simulations/`에 계산 결과를 직접 배치 (외부 계산화학 자동화 플러그인(예: compchem)이 설치돼 있으면 사용 가능하나 요구사항 아님) |

## Plugin 내부 skill 호출

paper-autopilot 내부 skill (모두 plugin/skills/ 내):

| 내부 skill | 호출 |
|-----------|------|
| `paper-autopilot` | 메인 orchestrator (이 스킬) |
| `folder-scaffold` | NEW mode |
| `research-autopilot` | FOLDER_READY → MOCKUP_V_1 |
| `academic-writing` | MOCKUP_V_N → DRAFT_V_N, EVOLVE 후 CORRECT |
| `experimental-plan` | DRAFT_V_N → SOP_READY |
| `mockup-evolver` | EVOLVE_PENDING |
| `version-enforcer` | always (via agent) |
| `paper-access` | reference 추가 시 |
| `paper-corpus-mining` | 자체 corpus 구축 시 (rare) |
| `pdf-figure-extract` | reference paper figure 추출 시 |

## Dispatch 우선순위 충돌

다음 상황에서 어느 skill 우선?

| 상황 | 우선순위 |
|------|--------|
| input/ 새 데이터 + mockup/ 더 newer | mockup-evolver (EVOLVE) — input이 mockup에 반영 안 됨 |
| _paper.md.blockers 비어있음 + DRAFT_V_N | (skip experimental-plan if no gaps) — academic-writing CORRECT로 polish |
| simulations/_execution/status.yaml: PENDING + DRAFT_V_N | 사용자에게 "계산 끝까지 기다릴까 vs 현 데이터로 진행" 묻기 |

## 호출 실패 시

각 skill 실패 시 fallback:

| 실패 | Fallback |
|------|---------|
| RAG corpus down (academic-writing) | keyword 검색만, 경고 메시지 |
| 시뮬레이션 데이터 부재 | simulations/ 비워둔 채 진행, 해당 figure에 [SIM-DATA-NEEDED] 태그 (사용자에게 알림) |
| /paper-access 실패 (subscription 만료 등) | reference/ 수동 추가 안내 |
| /paper-autopilot-open:ppt-image API limit | 사용자에게 manual mockup 권유 |
