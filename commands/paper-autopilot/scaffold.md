---
description: "Create new paper folder with paper-autopilot standard structure"
argument-hint: "<paper-folder-name>"
allowed-tools: Read, Write, Bash
---

# /paper-autopilot-open:paper-autopilot:scaffold

Create a new paper folder following paper-autopilot standard.

## Argument

User input: $ARGUMENTS — should be paper folder name (e.g., `Sb2S3_NewWork`).

## Procedure

1. Validate folder name (no spaces preferred, no special chars)
2. Read plugin config (`~/.claude/paper-autopilot-open/config.json`) for `papers_root`
3. Run scaffold script:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/folder-scaffold/scripts/scaffold.sh" \
     "<paper-folder-name>" "<papers_root>"
   ```
4. Report to user:
   - ✅ Folder created
   - 📂 Files: 8 (CLAUDE.md, _paper.md, 6 sub-readmes)
   - 🎯 Next: fill `_paper.md` title/journal, then `/paper-autopilot-open:paper-autopilot` to enter Phase 1

## Constraints

- **Reject if folder exists** (no overwrite)
- **Reject if `papers_root` not configured**
- **Always use scaffold.sh** (don't reimplement)

## Examples

```
User: /paper-autopilot-open:paper-autopilot:scaffold Sb2S3_NewWork
You: [run scaffold.sh] → "✅ Sb2S3_NewWork 폴더 생성. 다음: _paper.md/CLAUDE.md 작성 후 /paper-autopilot-open:paper-autopilot."
```
