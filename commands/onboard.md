---
description: "paper-autopilot-open 초기 설정 마법사 — 의존성 설치, config 작성, corpus 구축, 검증"
argument-hint: "[precheck | install | config | corpus | verify]  (없으면 전체 6-Phase 실행)"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion
---

# /paper-autopilot-open:onboard

플러그인 첫 실행 설정을 대화형으로 처리합니다. `onboarding` 스킬을 로드해서 그 지시문을 그대로 따르세요 (오케스트레이션을 여기서 재구현하지 마세요).

## Procedure

1. **Skill 로드**: Skill 도구로 `onboarding` 스킬(`skills/onboarding/SKILL.md`)을 로드한다.
2. **범위 결정**: `$ARGUMENTS`를 읽어 실행할 Phase를 정한다.
3. 스킬의 지시에 따라 Phase를 순서대로 실행하고, 각 Phase 끝에서 사용자에게 상태를 보고한다.

## Argument — 특정 Phase만 재실행

`$ARGUMENTS`가 비어 있으면 Phase 0-5 전체를 실행합니다. 인자가 주어지면 해당 Phase만 실행합니다 (온보딩은 멱등 — 재실행 시 기존 설정을 존중):

| 인자 | 실행 Phase |
|------|-----------|
| (없음) | Phase 0-5 전체 |
| `precheck` | Phase 0 — 사전 점검 (node/npm/git/pandoc, Fable 5 접근) |
| `install` | Phase 1 — `scripts/` 의존성 설치 |
| `config` | Phase 2 — config 마법사 (`~/.claude/paper-autopilot-open/config.json`) |
| `corpus` | Phase 3 — 본인/분야 논문 PDF → corpus 구축 (RAG) |
| `verify` | Phase 4 — 오프라인 + 실 corpus 스모크 검증 |

예: `/paper-autopilot-open:onboard corpus` → Phase 3만 재실행 (PDF 추가 후 corpus 재적재).

## Constraints

- **항상 onboarding 스킬을 먼저 로드** (오케스트레이션 재구현 금지)
- **API 키는 config 파일에만 기록** — 화면·보고에 절대 재출력하지 않는다 (마스킹 `****`)
- **기존 config 존중** — 덮어쓰기 전 `config.json.bak` 백업 + 사용자 확인

$ARGUMENTS
