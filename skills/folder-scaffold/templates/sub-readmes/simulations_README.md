# simulations/

DFT/MD/ML 계산 워크스페이스. **사용자가 본인의 계산 환경 결과 데이터를 이 폴더에 직접 배치** — paper-autopilot은 이 폴더 임의 수정 X.

시뮬레이션 데이터 정책: (1) 기본 경로는 사용자가 simulations/ 폴더에 계산 결과 데이터를 직접 준비하는 것, (2) 데이터가 아직 없으면 mockup은 hypothetical로 진행하고 해당 figure에 [SIM-DATA-NEEDED] 태그를 남긴다, (3) 계산화학 자동화 플러그인(예: compchem)이 별도로 설치되어 있다면 사용해도 되지만 이 플러그인의 요구사항이 아니다.

권장 구조 (예시):
```
simulations/
├── MASTER_PLAN.md
├── _plan/         ← parameters.yaml (SSOT), dependency_graph, pilot_gate
├── _verification/
├── _execution/    ← status.yaml, log.md, decisions.md
├── _experimental/ ← summary.md (DFT 검증 기준)
└── _tracker/
```

핵심 원칙: Fragment Method, SSOT, Pilot Gate, Cell 일관성, 실험 데이터 자체 포함.

CLAUDE.md 허브 링크: `[현재 상태](./simulations/_execution/status.yaml)`, `[파라미터 SSOT](./simulations/_plan/parameters.yaml)`
