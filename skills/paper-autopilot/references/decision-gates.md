# Decision Gates — G1 ~ G6

> 사용자 확인 받는 6개 결정 지점. 사용자가 자연어로 자동/수동 분배 명시 가능.

## Gates

| Gate | 위치 | 묻는 내용 | Default |
|------|-----|----------|---------|
| **G1** | post-folder-scaffold | "research-autopilot으로 진행할까요?" | ask |
| **G2** | post-mockup-V_n | "이 storyline으로 academic-writing WRITE 시작?" | ask |
| **G3** | post-experimental-plan | "추천 target journal X 동의?" | ask |
| **G4** | post-simulation-plan 검증 | "이 계산 방향?" | ask |
| **G5** | post-mockup-V_n+1 (evolve) | "manuscript V_n+1 갱신?" | ask |
| **G6** | pre-submit | "투고 단계 진입?" | ALWAYS ask |

자동 진행 가능 (게이트 없음):
- 폴더 scaffold (G0 직전)
- 시뮬레이션 데이터 staging (research-autopilot 내부)
- /paper-autopilot-open:docx 변환 (manuscript.md 작성 직후)
- pa-version-enforcer 호출
- pa-context-keeper CLAUDE.md 갱신

## 자연어 사용자 지시 파싱

pa-gate-router agent가 다음 패턴 인식:

| 사용자 지시 | 파싱 결과 |
|-----------|----------|
| "다음 단계 가자" | G1-G6 모두 ask (default) |
| "G1-G3까지 자동, G4부터 물어봐" | auto: G1,G2,G3 / ask: G4,G5,G6 |
| "전부 자동" | auto: G1-G5 / ask: G6 (G6은 ALWAYS ask) |
| "mockup만 만들고 멈춰" | stop after MOCKUP_V_N |
| "초안까지 자동" | auto: G1,G2 / stop: DRAFT_V_N |
| "투고만 빼고 자동" | auto: G1-G5 / ask: G6 |
| "느리게 가자, 매 단계 확인" | ask: all (default) |

ambiguous 패턴은 1회 confirm 질문.

## G6 강제 ask 이유

투고는 외부에 manuscript 보내는 비가역 액션. 사용자 확인 없이 자동 진행 절대 금지.

## Gate 미통과 처리

각 Gate에서 사용자 "NO" 또는 수정 요청:

| Gate | NO 응답 | 액션 |
|------|--------|------|
| G1 | "research-autopilot 안 해도 됨" | manual mode — 사용자가 직접 mockup 작성 |
| G2 | "mockup 수정하고 시작" | mockup 수정 후 재호출 |
| G3 | "다른 journal" | _paper.md.journal 갱신 후 target_metrics 재계산 |
| G4 | "다른 계산 방향" | 시뮬레이션 계획 재검토 |
| G5 | "manuscript 갱신 안 함" | mockup만 보존, output 그대로 |
| G6 | "더 작업하고" | manuscript revision (academic-writing CORRECT) |

## Gate decision log

매 Gate 결과는 CLAUDE.md "변경 이력" 표에 기록:

```markdown
| 2026-04-30 | G2 통과 — academic-writing WRITE 진입 | paper-autopilot |
| 2026-05-01 | G3 거절 — target journal Adv Mater → Joule 변경 | 사용자 |
```
