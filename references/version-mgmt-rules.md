# Version Management Rules — `[YYMMDD_내용]`

> All paper-autopilot outputs follow this convention. version-enforcer skill enforces it.

## Format

```
YYMMDD_<자유설명>
```

| 부분 | 형식 | 예시 |
|------|------|------|
| YY | 2-digit year (config timezone) | `26` (= 2026) |
| MM | 2-digit month | `04` |
| DD | 2-digit day | `30` |
| `_` | separator | `_` |
| 자유설명 | freeform | `v1_초안`, `Acta투고최종`, `XPS_added` |

## Examples

✅ Valid:
- `260430_v1_초안`
- `260502_홍길동피드백반영`
- `260515_Acta투고최종`
- `260520_v3_BAI도입`
- `260601_XPS_added`
- `261105_revision_round1`

❌ Invalid:
- `v1` — no date
- `2026-04-30` — wrong format
- `latest` — semantic name only
- `temp/` — no version
- `final` — unstable (will become old later)

## Per-folder application

| 폴더 | 적용? | 비고 |
|------|------|------|
| `input/` | ✅ | each new data dump |
| `reference/` | ⚠️ different — `[paper-slug]/` (e.g., `Wang2023_NMC/`) |
| `simulations/` | ❌ | user-staged simulation data owns structure |
| `mockup/` | ✅ | each iteration |
| `experimental_plan/` | ✅ | each plan revision |
| `output/` | ✅ | each manuscript version |
| `output/figures/` | ✅ | each figure set version |

## Self-naming hints (for mockup-evolver auto-suggest)

- `_v1_초안` — initial draft
- `_v2_<feedback-source>` — after feedback
- `_<measurement>_added` — after new data integrated
- `_<reviewer>_round{N}` — after reviewer N's comments
- `_<journal>_투고최종` — submission-ready

## Append-only invariant

- **NEVER delete old `[YYMMDD_*]` folders** — full history preserved
- **NEVER overwrite files in old folders** — always create new dated folder
- **Per-folder `_README.md` (1 line)** — describe what's in this version (optional but recommended)

## Top-level meta files (NOT versioned)

These are always at paper folder root, edited in-place:
- `CLAUDE.md` (hub)
- `_paper.md` (YAML tracker)
- `.paper-autopilot/log.md` (decision log)

## Same-day reruns

If `260430_v1_초안` exists and you need another today:
- Use `260430_v2_<descriptor>`
- Increment counter, descriptor changes

## Time zone

All dates follow the `timezone` in config (default `Asia/Seoul`, UTC+9). Derive `YYMMDD` from the current date in that timezone.

> Cross-platform note: `date -d "now" +%y%m%d` is GNU coreutils (Linux / Git Bash) syntax. macOS ships BSD `date`, which does **not** support `-d`; use `date +%y%m%d` for "today" or GNU `gdate` (coreutils) for offsets.

## version-enforcer auto-correction

When sub-skill writes to non-versioned path:

```
write to: mockup/figure_set.md
↓
version-enforcer:
  ❌ Not in versioned subdir.
  ✅ Suggest: mockup/260430_<descriptor>/figure_set.md
  ↓ ask user to confirm <descriptor> or override
```

## Reference convention exception

`reference/` uses `[paper-slug]/` (e.g., `Wang2023_NMC_surface/`) not date-based — because reference papers are external citations, not internal versions.

Optional date prefix: `[YYMMDD_paper-slug]/` — only if collection-time matters.
