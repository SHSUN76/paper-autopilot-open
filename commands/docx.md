---
description: "Markdown -> Word (.docx) 변환 (pandoc + 한국어 reference 템플릿)"
argument-hint: "<input.md> [output.docx]"
allowed-tools: Read, Glob, Bash
---

# /docx - Markdown → Word 변환

Markdown 파일을 고품질 Word(.docx) 파일로 변환합니다.

## 입력

$ARGUMENTS

## 사전 요구사항: pandoc

이 커맨드는 `pandoc`이 PATH에 설치되어 있어야 합니다.

```bash
# macOS
brew install pandoc
# Windows
winget install --id JohnMacFarlane.Pandoc
# Debian/Ubuntu
sudo apt-get install pandoc
```

(선택) 변환 후 검증(`**` 깨짐 체크)에는 `python-docx`가 필요합니다: `pip install python-docx`. 없으면 검증만 건너뛰고 변환은 정상 동작합니다.

## 실행 절차

1. **파일 경로 확인**: 사용자가 제공한 경로에서 `.md` 파일을 찾는다.
   - 경로가 없으면 현재 작업 디렉토리에서 최근 수정된 `.md` 파일 목록을 Glob으로 보여주고 선택하게 한다.
   - 여러 파일이 지정되면 모두 변환한다.

2. **변환 실행**: 플러그인에 번들된 `md2docx.py` 스크립트를 사용한다.

```bash
python "${CLAUDE_PLUGIN_ROOT}/scripts/docx/md2docx.py" "<input.md>" ["<output.docx>"]
```

스크립트가 자동으로 수행하는 작업:
- Obsidian `[[wikilinks]]` → 일반 텍스트
- `___` placeholder 이스케이프 (bold 파싱 충돌 방지)
- `==highlight==` → bold 변환
- Obsidian callout (`> [!note]`) → blockquote 변환
- `![[embed]]` → 텍스트 참조 변환
- pandoc + 한국어 커스텀 reference-doc 적용
- 변환 후 `**` 깨짐 자동 검증 (python-docx 설치 시)

3. **결과 보고**: 변환된 파일 경로와 검증 결과를 사용자에게 알려준다.

## 옵션

- 출력 파일명을 지정하지 않으면 입력 파일과 같은 위치에 `.docx` 확장자로 생성.
- permission denied 에러 시 Word에서 파일을 닫으라고 안내하거나 `_v2.docx` 등으로 대체 저장.

## Reference 문서 (Word 스타일 템플릿)

`${CLAUDE_PLUGIN_ROOT}/scripts/docx/pandoc-reference-ko.docx` (한국어 최적화 스타일)

스크립트가 자기 디렉토리에서 이 파일을 자동으로 찾습니다. 사용자가 이 파일을 Word에서 직접 열어 스타일(폰트, 색상, 여백 등)을 수정하면 이후 변환에 자동 반영됩니다. 표준(비한국어) 스타일을 원하면 같은 폴더의 `pandoc-reference.docx`를 `pandoc-reference-ko.docx`로 덮어쓰면 됩니다.

## 예시

```
/docx path/to/file.md
/docx path/to/file.md path/to/out.docx
/docx            # 현재 디렉토리의 .md 파일 선택
```
