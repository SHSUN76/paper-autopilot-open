# output/

최종 산출물 — manuscript 본문 + figures.

```
output/
├── 260502_초안v1/
│   ├── manuscript.md
│   └── manuscript.docx
├── 260520_투고최종/
│   ├── manuscript.md
│   ├── manuscript.docx
│   ├── cover_letter.md
│   └── SI.md
└── figures/
    ├── 260502_v1/
    │   ├── Fig1.png
    │   └── ...
    └── 260520_투고최종/
        ├── Fig1_300dpi.png
        ├── Fig1.pdf
        └── ...
```

**Rules**:
- manuscript 버전마다 새 폴더 (`[YYMMDD_내용]/`)
- figure 버전마다 새 폴더 (`figures/[YYMMDD_내용]/`)
- 옛 버전 삭제 금지

호출 도구:
- `/academic-writing` — manuscript 작성/검토/수정 (3 modes, journal-master 흡수)
- `/paper-autopilot-open:docx` — md → Word 변환
- `/paper-autopilot-open:ppt-image` — 최종 figure 이미지

CLAUDE.md 허브 링크: `[최신 본문](./output/260520_투고최종/manuscript.md)`, `[최신 Figure set](./output/figures/260520_투고최종/)`
