# State Model — paper-autopilot

> Paper folder의 5개 위치를 종합해 현재 stage를 추론.

## SSOT 위치

| 정보 | 위치 | 갱신 주체 |
|------|------|----------|
| 논문 메타 (title/journal/status/progress) | `_paper.md` frontmatter | 사용자 + paper-autopilot |
| 계산 진행 | `simulations/_execution/status.yaml` | 사용자 시뮬레이션 환경 |
| 현재 mockup 버전 | `mockup/` 의 가장 최신 `[YYMMDD_*]` | research-autopilot, mockup-evolver |
| 현재 manuscript 버전 | `output/` 의 가장 최신 `[YYMMDD_*]` | academic-writing |
| 실험 SOP 버전 | `experimental_plan/` 의 가장 최신 | experimental-plan |
| 다음 액션 | `CLAUDE.md` 의 "다음 액션" 줄 | paper-autopilot |

## Stage 정의

| stage | 진단 |
|-------|------|
| `NEW` | 폴더 자체 없음 |
| `FOLDER_READY` | 6폴더 + CLAUDE.md + _paper.md 존재, mockup/ 비어있음 |
| `MOCKUP_V_N` | mockup/ 안에 `[YYMMDD_*]/` 1개 이상, output/ 비어있음 |
| `DRAFT_V_N` | output/ 안에 `[YYMMDD_*]/manuscript.md` 1개 이상, 최신 mockup 보다 newer |
| `EXPERIMENT_PENDING` | experimental_plan/ 최신 SOP 존재, but input/ 새 데이터 X |
| `SOP_READY` | experimental_plan/ 최신 + 학생에게 전달 완료 (CLAUDE.md log) |
| `EVOLVE_PENDING` | input/ 최신 timestamp > mockup/ 최신 → 진화 필요 |
| `SUBMIT_READY` | output/ 최신에 cover_letter.md + SI.md 존재, _paper.md.progress ≥ 95 |

## 추론 알고리즘

```
1. _paper.md 읽기 → status, progress
2. mockup/, output/, experimental_plan/ 의 최신 [YYMMDD_*] 식별 (mtime 또는 dir name 정렬)
3. input/ 의 최신 [YYMMDD_*] timestamp
4. simulations/_execution/status.yaml 읽기
5. 다음 logic으로 stage 결정:
   - 폴더 없음 → NEW
   - mockup 비어있음 → FOLDER_READY
   - output 없음 OR output mtime < mockup mtime → MOCKUP_V_N
   - input mtime > mockup mtime → EVOLVE_PENDING
   - experimental_plan 존재 + input 변화 없음 → EXPERIMENT_PENDING
   - output 존재 + cover_letter.md 존재 + progress ≥ 95 → SUBMIT_READY
   - else → DRAFT_V_N
```

## CLAUDE.md "다음 액션" 의 우선순위

stage 추론과 별개로, CLAUDE.md의 "다음 액션" 줄에 사용자가 적은 명시적 액션이 있으면 **그것을 우선**한다.

예: stage가 `MOCKUP_V_N`이지만 사용자가 "지석피드백 받기 대기 중"이라 적었으면 paper-autopilot은 진행하지 않고 보고만.

## State 충돌 해결

가끔 SSOT가 불일치할 수 있음 (수동 작업 후):

| 충돌 | 해결 |
|------|------|
| `_paper.md.status: 투고완료` 인데 mockup/ 최신이 더 newer | 사용자에게 "이미 투고됐는데 mockup이 갱신됨 — revision인가?" 묻기 |
| output/ 안에 `[YYMMDD_*]/` 여러 개인데 manuscript.md는 한 곳에만 존재 | 가장 최신 mtime을 SSOT로 |
| simulations/_execution/status.yaml 부재 | 시뮬레이션 데이터 미staging → FOLDER_READY로 fallback |

## Resume 프로토콜

paper-autopilot 호출 시:
1. CLAUDE.md 자동 로드 (Claude Code 기본 동작)
2. pa-state-analyzer 디스패치 → stage 추론
3. CLAUDE.md "다음 액션" 보여주기 + 진행 여부 확인
4. 사용자 OK → next skill 디스패치
