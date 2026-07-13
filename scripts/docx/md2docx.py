"""
md2docx.py - Obsidian Markdown → Word (.docx) 변환기

사용법:
  python md2docx.py <input.md> [output.docx]

기능:
  1. Obsidian 마크다운 전처리 (wikilinks, underscores, callouts 등)
  2. pandoc + 커스텀 reference-doc로 고품질 Word 변환
  3. 변환 결과 검증 (깨진 **bold** 패턴 체크)
"""

import re
import sys
import os
import subprocess
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REFERENCE_DOC = os.path.join(SCRIPT_DIR, "pandoc-reference-ko.docx")


def preprocess(content):
    """Obsidian 마크다운을 pandoc 호환 형식으로 전처리"""

    # 1. ___ placeholder 이스케이프 (3+ underscores → escaped)
    #    pandoc이 이탤릭/볼드 마커로 해석하는 것 방지
    content = re.sub(r'_{3,}', lambda m: '\\' + '\\'.join('_' * len(m.group(0))), content)

    # 2. Obsidian wikilinks → plain text
    #    [[link|alias]] → alias
    content = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', content)
    #    [[link]] → link
    content = re.sub(r'\[\[([^\]]+)\]\]', r'\1', content)

    # 3. Obsidian callouts → blockquote with bold header
    #    > [!note] Title → > **Note: Title**
    def convert_callout(m):
        callout_type = m.group(1).strip().capitalize()
        title = m.group(2).strip() if m.group(2) else callout_type
        return f'> **{title}**'
    content = re.sub(r'>\s*\[!(\w+)\]\s*(.*)', convert_callout, content)

    # 4. ==highlight== → **highlight** (pandoc doesn't support ==)
    content = re.sub(r'==(.*?)==', r'**\1**', content)

    # 5. Obsidian embeds ![[file]] → (see: file)
    content = re.sub(r'!\[\[([^\]]+)\]\]', r'*(see: \1)*', content)

    return content


def verify_docx(docx_path):
    """변환된 docx에서 깨진 **bold** 패턴 확인"""
    try:
        from docx import Document
        doc = Document(docx_path)
        broken = []
        for i, p in enumerate(doc.paragraphs):
            if '**' in p.text:
                broken.append(f"  paragraph {i}: {p.text[:80]}...")
        for t_idx, t in enumerate(doc.tables):
            for r_idx, row in enumerate(t.rows):
                for c_idx, cell in enumerate(row.cells):
                    if '**' in cell.text:
                        broken.append(f"  table[{t_idx}][{r_idx}][{c_idx}]: {cell.text[:80]}...")
        return broken
    except ImportError:
        return None  # python-docx not installed, skip verification


def convert(input_path, output_path=None, reference_doc=None):
    """MD → DOCX 변환 메인 함수"""

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        return False

    # Output path 결정
    if output_path is None:
        output_path = os.path.splitext(input_path)[0] + '.docx'

    # Reference doc 결정
    if reference_doc is None:
        reference_doc = REFERENCE_DOC

    # 1. Read source
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 2. Preprocess
    processed = preprocess(content)

    # 3. Write temp file
    tmp_fd, tmp_path = tempfile.mkstemp(suffix='.md')
    try:
        with os.fdopen(tmp_fd, 'w', encoding='utf-8') as f:
            f.write(processed)

        # 4. Build pandoc command
        # --resource-path: 원본 .md 파일 디렉토리를 이미지/리소스 검색 경로로 추가
        # (임시 .md 파일은 %TEMP%에 있어서 상대 경로 이미지를 못 찾는 문제 해결)
        input_dir = os.path.dirname(os.path.abspath(input_path))
        cmd = [
            'pandoc', tmp_path,
            '--from', 'markdown',
            '--to', 'docx',
            '--resource-path', input_dir,
            '-o', output_path,
        ]
        if reference_doc and os.path.exists(reference_doc):
            cmd.extend(['--reference-doc', reference_doc])

        # 5. Run pandoc
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error: pandoc failed:\n{result.stderr}")
            return False

        # 6. Verify
        broken = verify_docx(output_path)
        if broken is None:
            print(f"Converted (verification skipped - python-docx not installed):")
        elif broken:
            print(f"Warning: {len(broken)} broken bold patterns found:")
            for b in broken:
                print(b)
        else:
            print(f"Converted (verified, no issues):")

        print(f"  {output_path}")
        return True

    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python md2docx.py <input.md> [output.docx]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    success = convert(input_path, output_path)
    sys.exit(0 if success else 1)
