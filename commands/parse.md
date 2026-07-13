---
description: "문서 파싱 (PDF/DOCX/PPTX -> Markdown) + PDF figure/scheme/table 추출"
argument-hint: "<file_path | glob> [--output DIR] [--figures | --no-figures | --figures-only] [--lang ko]"
allowed-tools: Read, Write, Glob, Bash, Task, AskUserQuestion
---

# /parse - 문서 파싱 (Figure Extraction + 선택적 STORM 백엔드)

> 문서(PDF, DOCX, PPTX, HWP 등)를 Markdown으로 변환.
> PDF의 경우 figure/scheme/table도 자동 추출해 본문에 링크 삽입.

## 사용자 입력
$ARGUMENTS

---

## 텍스트 추출 백엔드 (2가지)

이 커맨드는 텍스트 추출에 두 가지 경로를 지원하며, 사용 가능한 것을 자동 선택합니다.

| 백엔드 | 조건 | 강점 |
|--------|------|------|
| **Claude 직접 읽기** (기본) | 항상 사용 가능 | 텍스트 레이어가 있는 PDF는 Read 도구로 직접 읽어 Markdown으로 정리. 추가 API 키 불필요 |
| **STORM Parse** (선택) | `STORM_PARSE_API_KEY` 설정 시 | DOCX/PPTX/HWP/XLSX/이미지 등 다양한 포맷, 레이아웃 보존 파싱 품질이 높음 |

**STORM은 선택 백엔드입니다.** 키가 없으면 자동으로 Claude 직접 읽기(PDF) + `pdf-figure-extract` 스킬(figure)로 폴백합니다.

STORM 키 설정 (스크립트 탐색 순서):
1. `~/.claude/paper-autopilot-open/config.json` 의 `"api_keys": { "storm_parse": "..." }`
2. `${CLAUDE_PLUGIN_ROOT}/scripts/.env` 의 `STORM_PARSE_API_KEY=...` (`scripts/.env.example` 참고)
3. 환경변수 `STORM_PARSE_API_KEY`

## Figure 추출 (STORM 불필요)

PDF의 figure/scheme/table 추출은 이 플러그인에 번들된 **`pdf-figure-extract` 스킬**(비전 기반, PyMuPDF + Pillow)이 담당합니다. STORM 키와 무관하게 동작합니다.

---

## 지원 포맷

| 유형 | 확장자 | 텍스트 | Figure 추출 |
|------|--------|--------|------------|
| 문서 | PDF | Claude 직접 / STORM | pdf-figure-extract |
| 문서 | DOCX, DOC, HWP, HWPX | STORM 권장 | — |
| 프레젠테이션 | PPTX, PPT | STORM 권장 | — |
| 스프레드시트 | XLSX, XLS, CSV | STORM 권장 | — |
| 이미지 | PNG, JPG, JPEG | STORM(OCR) / Claude vision | — |

**PDF 입력 시 기본 동작**: `.md` + `figures/` 폴더 + `{stem}_with_figs.md` 3개 생성.

---

## 사용법

```bash
/parse ./document.pdf                 # PDF는 figure 추출 여부 묻기
/parse ./document.pdf --output ./out  # 출력 폴더 지정
/parse ./document.pdf --figures       # figure 추출 즉시 진행 (질문 skip)
/parse ./document.pdf --no-figures    # 텍스트만
/parse ./document.pdf --figures-only  # figure만 (텍스트 생략)
/parse ./folder/*.pdf                 # 여러 파일
/parse ./document.pdf --lang ko       # STORM 언어 지정 (기본 en)
```

---

## 실행 워크플로우

### Step 1: 입력 분석

$ARGUMENTS에서 추출: `file_path`(필수, 와일드카드 지원), `--output`, `--lang`(기본 en), `--figures`/`--no-figures`/`--figures-only`.

### Step 2: 파일 검증 + Figure 추출 의사 확인

1. Glob으로 파일 존재 확인, 확장자 검증.
2. PDF이고 `--figures`/`--no-figures` 플래그가 없으면 AskUserQuestion으로 질문:

```
📄 PDF 감지: {파일명}
Figure/Scheme/Table 이미지도 추출해 본문에 링크로 삽입할까요?
[Y] STORM/Claude 파싱 + Figure 추출 + 본문 링크 (권장)
[N] 텍스트만 (빠름)
[O] Figure만
[S] 이 PDF 스킵
```

여러 PDF 배치 처리 시 첫 PDF에서 한 번만 묻고 "[A] 나머지에도 같은 선택 적용" 옵션 제공.

**판단 팁**: 학술 논문(Wiley/Nature/ACS/Elsevier) → [Y] 권장 · 잡지/스캔본/정부 보고서 → [N] 권장.

### Step 3A: 텍스트 추출

`--figures-only`가 아니면 실행. 백엔드 선택:

**(A) STORM 사용 가능 시** (키 설정됨):
```bash
python "${CLAUDE_PLUGIN_ROOT}/scripts/parse/storm_parse.py" "{file_path}" "{output_dir}"
```
산출물: `{output_dir}/{stem}.md`. 키 미설정 시 `ValueError`로 즉시 종료되므로, 그 경우 (B)로 폴백.

**(B) STORM 없음 → Claude 직접 읽기 폴백**:
- PDF: Read 도구로 PDF를 읽어(텍스트 레이어 존재 시) 내용을 정리한 `{output_dir}/{stem}.md`를 Write로 저장. 헤딩/문단/표를 Markdown으로 구조화.
- 스캔 PDF(텍스트 레이어 없음): Read의 vision으로 페이지를 읽되, 대용량이면 `pdf-figure-extract`의 페이지 렌더 후 vision 처리 권장.
- 비 PDF(DOCX/PPTX/HWP 등)에서 STORM이 없으면 사용자에게 STORM 키 설정을 안내(이 포맷들은 Claude가 직접 읽기 어려움).

### Step 3B: Figure Extraction (PDF 전용)

**조건**: 입력이 PDF이고 `--no-figures`가 아님.

**방법**: 번들된 `pdf-figure-extract` 스킬을 **subagent에서 실행**(main context 오염 방지). Task 도구로 executor-class subagent(`model=sonnet`) 지정.

subagent 프롬프트 요지:
```
plugin에 번들된 pdf-figure-extract 스킬로 다음 PDF를 처리:
- PDF: {file_path}
- 출력: {output_dir}/{stem}_figures/
스킬의 SKILL.md 워크플로우(classify → render-pages → vision 분석 → extract → clean)를 그대로 따를 것.
반환: 추출된 figure 파일 리스트 + figure-to-page 매핑.
```

산출물: `{output_dir}/{stem}_figures/Figure_N_*.png`, `extraction_report.md`, `profile_used.json`.

### Step 3C: Figure 링크 병합 + 위치 Validation (PDF 전용)

`{stem}.md`에서 `Figure N` / `Fig. N` / `Scheme N` / `Table N` 본문 언급을 찾아 해당 figure 이미지 링크로 보강한 `{stem}_with_figs.md`를 생성하고, 각 링크가 실제 관련 문단 근처에 삽입됐는지 검증하여 `validation_report.md`를 작성.

병합/검증 로직 개요 (Bash로 아래 Python 실행):

```python
import re
from pathlib import Path

output_dir = "{output_dir}"; stem = "{stem}"
md_path = Path(output_dir) / f"{stem}.md"
figs_dir = Path(output_dir) / f"{stem}_figures"
text = md_path.read_text(encoding="utf-8")

fig_map = {}
for f in sorted(figs_dir.glob("*.png")):
    m = re.match(r"(Figure|Scheme|Table)_(\d+)_", f.name)
    if m:
        fig_map[(m.group(1), int(m.group(2)))] = f.name

kind_aliases = {
    "Figure": [r"\bFigure\s+", r"\bFig\.?\s+", r"\bFigs?\.?\s+"],
    "Scheme": [r"\bScheme\s+", r"\bSch\.?\s+"],
    "Table":  [r"\bTable\s+", r"\bTab\.?\s+"],
}

rows = []
for (kind, num), fname in sorted(fig_map.items()):
    embed = f"\n\n![[{stem}_figures/{fname}]]\n*{kind} {num}*\n\n"
    matches = []
    for alias in kind_aliases.get(kind, [rf"\b{kind}\s+"]):
        for mm in re.finditer(alias + str(num) + r"\b", text):
            matches.append(mm.start())
    if not matches:
        rows.append((kind, num, fname, "low", None)); continue
    start = min(matches)
    para_end = text.find("\n\n", start)
    para_end = len(text) if para_end == -1 else para_end
    text = text[:para_end] + embed + text[para_end:]
    nearby = len([m for m in matches if abs(m - start) < 200])
    rows.append((kind, num, fname, "high" if nearby >= 2 else "medium", start))

fallback = [r for r in rows if r[3] == "low"]
if fallback:
    text += "\n\n---\n\n## Figures (unmatched)\n\n_본문 언급 없음 — 수동 위치 조정 권장_\n\n"
    for kind, num, fname, _, _ in fallback:
        text += f"### {kind} {num}\n\n![[{stem}_figures/{fname}]]\n\n"

(Path(output_dir) / f"{stem}_with_figs.md").write_text(text, encoding="utf-8")

high = sum(1 for r in rows if r[3] == "high")
med  = sum(1 for r in rows if r[3] == "medium")
low  = sum(1 for r in rows if r[3] == "low")
report = [f"# Figure Link Placement Validation\n",
          f"Summary: {len(rows)} figures — {high} high / {med} medium / {low} unmatched\n"]
for kind, num, fname, conf, _ in rows:
    report.append(f"- {kind} {num} (`{fname}`): {conf}")
(figs_dir / "validation_report.md").write_text("\n".join(report), encoding="utf-8")
print(f"[Validation] {high}/{len(rows)} high · {med} medium · {low} unmatched")
```

**신뢰도 기준**: high = 삽입 지점 ±200자에 해당 번호 2회+ 언급 / medium = 단일 언급 / low = 본문 언급 없음(→ `## Figures (unmatched)` 섹션).

**Obsidian 호환**: `![[...]]` wikilink. 표준 md(vault 외부)로 원하면 사용자가 `![](...)`로 변환.

### Step 4: 결과 보고

```
✅ 파싱 완료 (PDF + Figures)
📝 본문: {stem}.md   (백엔드: STORM | Claude 직접)
🖼️  Figures: {stem}_figures/ ({N}장)
📎 통합본: {stem}_with_figs.md
🔍 Validation: ✅ {high} high · ⚠️ {medium} medium · ❌ {low} unmatched
```

---

## 출력 구조 (PDF + 기본)

```
{output_dir}/
├── {stem}.md              # 텍스트 (STORM 또는 Claude 직접)
├── {stem}_with_figs.md    # figure 링크 삽입본 (Obsidian 추천)
└── {stem}_figures/
    ├── Figure_1_*.png
    ├── Scheme_1_*.png
    ├── extraction_report.md
    ├── validation_report.md
    └── profile_used.json
```

---

## 에러 처리

| 에러 | 원인 | 해결 |
|------|------|------|
| `FILE_NOT_FOUND` | 파일 없음 | 경로 확인 |
| `UNSUPPORTED_FORMAT` | 미지원 확장자 | 지원 포맷 확인 |
| STORM `ValueError: STORM_PARSE_API_KEY is required` | STORM 키 미설정 | 텍스트는 Claude 직접 읽기로 폴백. 비 PDF면 STORM 키 설정 안내 |
| `FIGURE_EXTRACT_FAILED` | pdf-figure-extract 실패 | subagent 로그 확인. 잡지/스캔본이면 `--no-figures` |
| `PDF_NO_TEXT_LAYER` | 스캔 PDF | figure 렌더 후 vision 처리, 또는 OCR |

STORM/Claude 텍스트 추출이 실패해도 figure만 부분 반환. 반대로 figure 실패해도 `.md`는 정상 반환.

---

## Figure 추출 품질 기대치 (`pdf-figure-extract` 검증)

| 저널 유형 | PASS율 |
|---|---|
| Wiley / Nature family / Science(AAAS) | ~100% |
| ACS, Elsevier, Joule | ~100% (추정) |
| arXiv 프리프린트 | 높음 |
| 잡지 (다단 variable) | 낮음 → `--no-figures` 권장 |
| 스캔 PDF | 0% → OCR 필요 |

---

## 실행 시작

1. 입력에서 파일 경로 + 플래그 추출, Glob으로 검증.
2. `--figures-only`가 아니면 Step 3A: STORM 키 있으면 STORM, 없으면 Claude 직접 읽기.
3. PDF이고 `--no-figures`가 아니면 Step 3B: pdf-figure-extract subagent spawn.
4. 둘 다 성공하고 PDF면 Step 3C: 링크 병합 + validation.
5. 결과 보고. 여러 파일이면 각 파일 반복 (PDF는 subagent 병렬 가능).
