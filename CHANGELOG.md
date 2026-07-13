# Changelog

All notable changes to paper-autopilot-open will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/) / [Semantic Versioning](https://semver.org/).

---

## [2.0.0] — 2026-07-14

First public release — **open edition**. A battery / materials science paper-writing feedback-loop orchestrator (idea + figure set → folder → mockup → academic-writing → experimental-plan → loop) with no external plugin hard-dependencies.

### Added

- **Onboarding wizard** — first-run setup that writes `~/.claude/paper-autopilot-open/config.json` from a template, so the plugin works without hand-editing files.
- **Dual RAG backend** — `rag.mode` selects `local` (default, on-disk vector store, no external DB), `supabase` (bring-your-own project), or `disabled`.
- **Self-built corpus** — the RAG corpus is built from the user's own papers; no shared/proprietary corpus is required.
- **Bundled assets** — references, templates, and config live inside the plugin; nothing points at a private vault.
- **Adversarial review (alpha)** — `pa-forcing-questions` (G1 forcing-question dispatcher) and `pa-spec-review-loop` (multi-dimension reviewer loop). Alpha: SKILL.md + mock dogfood verified; real reviewer-agent dispatch verification still deferred.

### Changed

- **Path parameterization** — every hard-coded absolute path replaced with config fields (`papers_root`, `rag.local_corpus_dir`, …) or plugin-relative references (`${CLAUDE_PLUGIN_ROOT}`).
- **Institution-neutral paper access** — the `paper-access` skill now reads the library proxy from `paper_access.institution_proxy_url` instead of any specific university.
- **Timezone from config** — date/time handling follows `timezone` (default `Asia/Seoul`) rather than a hard-coded zone.

### Removed

- **compchem hard-dependency** — simulation-dependent figures now follow a user-staged data policy (place results in `simulations/`, or proceed with a hypothetical mockup tagged `[SIM-DATA-NEEDED]`). An external computational-chemistry plugin may be used but is not required.
- All personal identifiers, private hostnames, cloud project IDs, and vault-specific absolute paths.
