#!/usr/bin/env bash
# scaffold.sh — Create a new paper folder following paper-autopilot standard
#
# Usage:
#   ./scaffold.sh "<paper_name>" "<papers_root>"
#
# Example:
#   ./scaffold.sh "Sb2S3_NewWork" "$HOME/papers"   # papers_root from config

set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: $0 \"<paper_name>\" \"<papers_root>\""
    exit 1
fi

PAPER_NAME="$1"
PAPERS_ROOT="$2"
TARGET="${PAPERS_ROOT}/${PAPER_NAME}"

# Locate plugin root (this script lives in plugin/skills/folder-scaffold/scripts/)
PLUGIN_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TEMPLATES="${PLUGIN_ROOT}/skills/folder-scaffold/templates"

if [ -e "${TARGET}" ]; then
    echo "❌ 이미 존재: ${TARGET}"
    exit 1
fi

if [ ! -d "${PAPERS_ROOT}" ]; then
    echo "❌ papers_root 디렉토리 없음: ${PAPERS_ROOT}"
    echo "   config.json의 papers_root 확인"
    exit 1
fi

echo "📁 생성: ${TARGET}"
mkdir -p "${TARGET}"/{input,reference,simulations,mockup,experimental_plan,output/figures}

# Copy _README.md sub-folder guides
for sub in input reference simulations mockup experimental_plan output; do
    src="${TEMPLATES}/sub-readmes/${sub}_README.md"
    if [ -f "${src}" ]; then
        cp "${src}" "${TARGET}/${sub}/_README.md"
    else
        echo "⚠️ template not found: ${src}"
    fi
done

# Copy CLAUDE.md template
if [ -f "${TEMPLATES}/CLAUDE.md.template" ]; then
    cp "${TEMPLATES}/CLAUDE.md.template" "${TARGET}/CLAUDE.md"
fi

# Copy _paper.md template + fill date
TODAY=$(date +%Y-%m-%d)
if [ -f "${TEMPLATES}/_paper.md.template" ]; then
    sed -e "s/{TODAY}/${TODAY}/g" "${TEMPLATES}/_paper.md.template" > "${TARGET}/_paper.md"
fi

echo "✅ 표준 6폴더 + CLAUDE.md hub + _paper.md tracker 생성 완료"
echo ""
echo "다음 단계:"
echo "  1. cd \"${TARGET}\""
echo "  2. _paper.md frontmatter 채우기 (title/journal/first_author/deadline)"
echo "  3. CLAUDE.md '다음 액션' 줄 작성"
echo "  4. /paper-autopilot 재호출 → research-autopilot Phase 1 진입"
echo ""
echo "📁 생성된 구조:"
ls -la "${TARGET}"
