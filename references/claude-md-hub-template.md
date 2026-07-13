# CLAUDE.md hub Template — paper-autopilot

> 모든 paper 폴더의 `CLAUDE.md`는 이 구조를 따른다. paper-autopilot의 `pa-context-keeper` agent가 자동 갱신.

## 5-Block 구조

```
1. 프로젝트 개요 (제목/저널/1저자/현재 상태/다음 액션)
2. 폴더 구조 (6폴더 안내)
3. 작업 규칙 (논문/데이터/그림/실험/시간대)
4. 핵심 링크 (수동 갱신 또는 paper-autopilot 자동 갱신)
5. 변경 이력 (append-only log)
```

## 핵심 invariants

1. **§1.다음 액션** — 항상 1줄 (다음 한 가지 액션)
2. **§4.핵심 링크** — paper-autopilot이 stage 종료 시 갱신
3. **§5.변경 이력** — append-only, 매 stage 1줄 추가

## §1 형식 예시

```markdown
| **현재 상태** | 초고작성 (progress 70%) — `_paper.md`에서 SSOT |
| **다음 액션** | mockup V2 갱신 후 academic-writing CORRECT 호출 |
```

## §4 자동 갱신 항목

paper-autopilot의 pa-context-keeper가 stage 종료 시 다음을 갱신:

| 항목 | 갱신 트리거 |
|------|----------|
| `데이터 > 최근 input` | input/ 에 새 [YYMMDD_*] 추가 시 |
| `참고 논문 > <slug>` | reference/ 에 새 paper 추가 시 (paper-access 후) |
| `계산 진행 > 현재 상태` | simulations/_execution/status.yaml 변경 시 |
| `Storyline > 최신 mockup` | mockup/ 에 새 [YYMMDD_*] 추가 시 |
| `실험 계획 > 최신 SOP` | experimental_plan/ 에 새 [YYMMDD_*] 추가 시 |
| `Manuscript > 최신 본문` | output/ 에 새 [YYMMDD_*]/manuscript.md 추가 시 |
| `Manuscript > 최신 Figure set` | output/figures/ 에 새 [YYMMDD_*] 추가 시 |

## §5 형식

```markdown
| 날짜 | 변경 | 액터 |
|------|------|------|
| 2026-04-30 | 폴더 초기화 | paper-autopilot |
| 2026-05-02 | mockup V1 작성 (research-autopilot Phase 5) | paper-autopilot |
| 2026-05-02 | G2 통과 — academic-writing WRITE 진입 | 사용자 |
| 2026-05-03 | manuscript V1 초안 (output/260503_v1) | paper-autopilot |
| 2026-05-05 | XPS 데이터 도착 (input/260505_XPS) | 사용자 |
| 2026-05-05 | mockup-evolver V2 → DIFF.md 생성 | paper-autopilot |
| 2026-05-05 | G5 통과 — academic-writing CORRECT (R3-4, Discussion 갱신) | 사용자 |
```

## 작성 시 주의

- **§1 다음 액션은 ALWAYS 갱신** — 비우면 paper-autopilot이 stage 추론 실패 가능
- **§5는 append-only** — 절대 옛 entry 삭제 X
- **§4 link는 broken 안 되도록** — paper-autopilot이 link 갱신 시 새 폴더 path 검증

## Edge cases

- **사용자가 §1 다음 액션을 직접 수정함**: paper-autopilot은 이를 우선 (사용자 의도 우선)
- **§5에 사용자가 직접 entry 추가**: 그대로 보존, paper-autopilot은 자기 entry만 추가
- **§4 link가 깨짐 (폴더 이름 변경)**: pa-context-keeper가 다음 호출 시 자동 보정
