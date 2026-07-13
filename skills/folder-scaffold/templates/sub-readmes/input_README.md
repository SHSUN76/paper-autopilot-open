# input/

User-supplied RAW data + empty figure mockups. Versioned `[YYMMDD_내용]/` per data dump.

- 실험 데이터 (전기화학, XRD, SEM, FT-IR 등)
- 외부에서 받은 자료
- Figure 가안 (구조만 잡힌 빈 슬라이드)

**Rules**: 새 자료 = 새 폴더 (덮어쓰기 금지). 옛 폴더 삭제 금지.

Example:
```
input/
├── 260429_초기데이터/
│   ├── EIS_full.csv
│   └── XRD.txt
└── 260510_홍길동_피드백/
```

CLAUDE.md 허브에서 링크: `[최근 input](./input/260510_홍길동_피드백/)`
