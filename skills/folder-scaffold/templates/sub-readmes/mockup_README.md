# mockup/

Storyline + figure 가안. iteration 잦음 — 새 데이터/피드백 들어올 때마다 새 폴더.

```
mockup/
└── 260502_지석피드백반영/
    ├── paper_logic.md   ← storyline
    ├── figure_set.md    ← Figure 가안 명세
    └── *.png            ← Figure mockup 이미지
```

**최종 figure는 여기 두지 않음** → `output/figures/` 으로.

호출 도구:
- `/research-autopilot` — V1 mockup 생성
- `mockup-evolver` skill — V_n → V_n+1 (새 데이터 반영)
- `/paper-autopilot-open:ppt-image` — figure mockup 이미지 생성

CLAUDE.md 허브 링크: `[최신 mockup](./mockup/260502_지석피드백반영/paper_logic.md)`
