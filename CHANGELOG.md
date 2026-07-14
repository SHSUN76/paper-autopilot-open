# Changelog

All notable changes to paper-autopilot-open will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/) / [Semantic Versioning](https://semver.org/).

---

## [2.1.0] — 2026-07-14

Onboarding hands-off upgrade — the wizard now does the setup labor so the user's only manual step is dropping PDFs into a folder.

### Added

- **Review-paper corpus group** — onboarding now creates a third `_corpus_input/review/` folder for ≤5 optional review papers (fast domain grounding). `build-corpus.mjs --group review` tags and embeds them for knowledge retrieval (`retrieve.mjs paragraphs --group review`) only — review papers are excluded from the own style profile and the figure vision pass.
- **Vision-based paper + figure analysis** — for each own/field paper, a Claude Code sub-agent reads the PDF as page vision (subscription credits, $0 API cost) and emits a `<paper_id>.figures.json` next to the paragraph report. The canonical figure schema (panels, per-figure `key_message`, `narrative_role`, `arc_pattern` / `arc_summary` / `narrative_logic`) lives in `paper-corpus-mining/references/figure_extraction.md` (Stage 1V); `build-corpus.mjs` auto-detects reports by the `.figures.json` suffix.
- **Figure-set RAG** — the figure reports build a searchable figure index (`figures.jsonl`) and arc library (`figure-arcs.json`), exposed via new `retrieve.mjs figures --query … [--type --role --group --k]` and `retrieve.mjs figure-arcs [--group]` commands, so the writer can retrieve exemplar figure arcs when designing a new paper's figure set.
- **Semi-automatic institution proxy registration** — onboarding Phase 2.4 opens your library portal in Playwright, you log in yourself and open one subscription article, and the wizard captures the URL and extracts + validates the `institution_proxy_url` pattern (falls back to manual entry when Playwright MCP is absent or the proxy is a host-rewriting type). Credential-handling is explicitly forbidden — you always log in in the browser, never via the session.
- **own / field RAG profiles** — `build-corpus.mjs` now auto-emits `style-profile.json` (your writing voice/hedge) and `field-profile.json` (year range, top journals) at build end; the wizard summarizes each in one line. New `retrieve.mjs style-profile` / `field-profile` commands and a `--since <year>` filter on `paragraphs` for recent-work retrieval.
- **corpus relationship report** — `scripts/report/corpus-report.mjs` renders a single `corpus-report.html` (own↔field, section / claim / move distributions); the wizard copies it to `<main>/_corpus_input/corpus-report.html`.
- **Python dependency auto-install** — Phase 1 detects `fitz` (PyMuPDF) / `PIL` (Pillow) / `docx` (python-docx) / `requests` individually and, on consent, installs them via `pip install -r scripts/requirements.txt` (with venv + manual fallback guidance).
- **Materials Project onboarding** — optional `api_keys.materials_project` key collected in Phase 2 (free from https://next-gen.materialsproject.org/api), enabling real crystal-structure + materials-property grounding via the `materials-project` skill.

### Changed

- **Auto-created work folders** — onboarding Phase 3 designates a main work folder (default `papers_root`) and auto-creates `_corpus_input/own`, `_corpus_input/field`, `_corpus_input/_reports`, and `rag.local_corpus_dir`. The user's only action is placing ~5 own + ~5 field PDFs; the wizard confirms counts and proceeds.
- **Simplified author prompt** — `default_first_author` is now collected with a single question ("your English author name, e.g. Gildong Hong") instead of a multi-part explanation.

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
