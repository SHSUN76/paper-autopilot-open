#!/usr/bin/env python3
"""
Stage 2 Aggregation — Paper Corpus Mining

Reads all per-paper extraction JSONs from a reports/ directory and produces
aggregated markdown summaries in an output directory.

Usage:
    python aggregate.py <reports_dir> --out <output_dir> [--min-frequency 3]

The minimum frequency threshold controls what surfaces in lexicon and AI-tells.
Default 3 means "appeared in at least 3 papers" — adjust for small corpora.
"""

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median, quantiles
from typing import Any


def load_reports(reports_dir: Path) -> list[dict[str, Any]]:
    reports = []
    for jf in sorted(reports_dir.glob("*.json")):
        try:
            with jf.open(encoding="utf-8") as f:
                reports.append(json.load(f))
        except (json.JSONDecodeError, OSError) as e:
            print(f"WARN: skipping {jf.name}: {e}", file=sys.stderr)
    return reports


def safe_get(d: dict, *keys, default=None):
    cur = d
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def aggregate_lexicon(reports: list[dict], min_freq: int) -> str:
    acronym_counter: Counter = Counter()
    acronym_expansions: dict[str, set[str]] = defaultdict(set)
    acronym_define_rate: dict[str, list[bool]] = defaultdict(list)
    unit_counter: Counter = Counter()
    formula_counter: Counter = Counter()

    for r in reports:
        for a in safe_get(r, "lexicon", "acronyms", default=[]) or []:
            abbr = a.get("abbr", "").strip()
            if not abbr:
                continue
            acronym_counter[abbr] += 1
            if a.get("expansion"):
                acronym_expansions[abbr].add(a["expansion"])
            if "is_defined_at_first_use" in a:
                acronym_define_rate[abbr].append(bool(a["is_defined_at_first_use"]))
        for u in safe_get(r, "lexicon", "units", default=[]) or []:
            unit = u.get("unit", "").strip() if isinstance(u, dict) else str(u)
            if unit:
                unit_counter[unit] += 1
        for f in safe_get(r, "lexicon", "chemical_formulas", default=[]) or []:
            if f:
                formula_counter[f] += 1

    n = len(reports)
    lines = ["# Lexicon", "", f"Corpus size: {n} papers. Frequency threshold: ≥{min_freq} papers.", ""]
    lines.append("## Acronyms")
    lines.append("")
    lines.append("| Acronym | Top Expansion | Papers | % | Define-at-First-Use Rate |")
    lines.append("|---------|---------------|--------|---|---------------------------|")
    for abbr, count in acronym_counter.most_common():
        if count < min_freq:
            continue
        exp = ", ".join(sorted(acronym_expansions[abbr])) or "—"
        define_rate = (
            f"{round(100 * sum(acronym_define_rate[abbr]) / len(acronym_define_rate[abbr]))}%"
            if acronym_define_rate[abbr]
            else "n/a"
        )
        lines.append(f"| {abbr} | {exp} | {count} | {round(100*count/n)}% | {define_rate} |")
    lines.append("")

    lines.append("## Units")
    lines.append("")
    lines.append("| Unit | Papers | % |")
    lines.append("|------|--------|---|")
    for unit, count in unit_counter.most_common():
        if count < min_freq:
            continue
        lines.append(f"| `{unit}` | {count} | {round(100*count/n)}% |")
    lines.append("")

    lines.append("## Chemical / material formulas (top 30)")
    lines.append("")
    lines.append("| Formula | Papers |")
    lines.append("|---------|--------|")
    for f, count in formula_counter.most_common(30):
        if count < min_freq:
            continue
        lines.append(f"| `{f}` | {count} |")
    lines.append("")
    return "\n".join(lines)


def aggregate_structure(reports: list[dict]) -> str:
    sig_counter: Counter = Counter()
    section_word_counts: dict[str, list[int]] = defaultdict(list)
    section_presence: Counter = Counter()
    has_abstract = 0
    has_supp = 0
    has_graphabs = 0

    for r in reports:
        sig = safe_get(r, "structure", "section_order_signature")
        if sig:
            sig_counter[sig] += 1
        for sec, wc in (safe_get(r, "structure", "section_word_counts", default={}) or {}).items():
            try:
                section_word_counts[sec].append(int(wc))
            except (TypeError, ValueError):
                continue
        for sec in safe_get(r, "structure", "sections", default=[]) or []:
            section_presence[sec] += 1
        if safe_get(r, "structure", "has_abstract"):
            has_abstract += 1
        if safe_get(r, "structure", "has_supplementary"):
            has_supp += 1
        if safe_get(r, "structure", "has_graphical_abstract"):
            has_graphabs += 1

    n = len(reports)
    lines = ["# Section Structure", "", f"Corpus size: {n} papers.", ""]

    lines.append("## Modal section order")
    lines.append("")
    lines.append("| Order Signature | Papers | % |")
    lines.append("|-----------------|--------|---|")
    for sig, count in sig_counter.most_common(10):
        lines.append(f"| `{sig}` | {count} | {round(100*count/n)}% |")
    lines.append("")

    lines.append("## Section presence")
    lines.append("")
    lines.append("| Section | Papers | % |")
    lines.append("|---------|--------|---|")
    for sec, count in section_presence.most_common():
        lines.append(f"| {sec} | {count} | {round(100*count/n)}% |")
    lines.append("")

    lines.append("## Section word counts (P25 / Median / P75)")
    lines.append("")
    lines.append("| Section | N | P25 | Median | P75 |")
    lines.append("|---------|---|-----|--------|-----|")
    for sec, counts in sorted(section_word_counts.items(), key=lambda kv: -len(kv[1])):
        if len(counts) < 3:
            continue
        try:
            qs = quantiles(counts, n=4)
            lines.append(
                f"| {sec} | {len(counts)} | {int(qs[0])} | {int(median(counts))} | {int(qs[2])} |"
            )
        except Exception:
            continue
    lines.append("")

    lines.append("## Other elements")
    lines.append("")
    lines.append(f"- Has abstract: {has_abstract}/{n} ({round(100*has_abstract/n)}%)")
    lines.append(f"- Has graphical abstract: {has_graphabs}/{n} ({round(100*has_graphabs/n)}%)")
    lines.append(f"- Has supplementary: {has_supp}/{n} ({round(100*has_supp/n)}%)")
    lines.append("")
    return "\n".join(lines)


def aggregate_figures(reports: list[dict]) -> str:
    type_counter: Counter = Counter()
    type_papers: dict[str, set[str]] = defaultdict(set)
    caption_lengths: list[int] = []
    captions_by_type: dict[str, list[tuple[int, str, str]]] = defaultdict(list)

    for r in reports:
        pid = r.get("paper_id", "?")
        for fig in safe_get(r, "figures", "types", default=[]) or []:
            kind = (fig.get("kind") or "other").strip()
            type_counter[kind] += 1
            type_papers[kind].add(pid)
            cl = fig.get("caption_length_words")
            if isinstance(cl, (int, float)):
                caption_lengths.append(int(cl))
            cap = fig.get("caption_first_sentence") or ""
            if cap and isinstance(cl, (int, float)):
                captions_by_type[kind].append((int(cl), cap, pid))

    n = len(reports)
    lines = ["# Figure Conventions", "", f"Corpus size: {n} papers.", ""]
    lines.append("## Figure type distribution")
    lines.append("")
    lines.append("| Type | Total figures | Papers | % of corpus |")
    lines.append("|------|---------------|--------|-------------|")
    for kind, count in type_counter.most_common():
        papers_with_kind = len(type_papers[kind])
        lines.append(f"| {kind} | {count} | {papers_with_kind} | {round(100*papers_with_kind/n)}% |")
    lines.append("")

    if caption_lengths:
        try:
            qs = quantiles(caption_lengths, n=4)
            lines.append("## Caption length (words)")
            lines.append("")
            lines.append(f"- N: {len(caption_lengths)}")
            lines.append(f"- P25: {int(qs[0])}")
            lines.append(f"- Median: {int(median(caption_lengths))}")
            lines.append(f"- P75: {int(qs[2])}")
            lines.append("")
        except Exception:
            pass

    lines.append("## Exemplar first-sentence captions per type")
    lines.append("")
    for kind, items in captions_by_type.items():
        items.sort()
        if not items:
            continue
        lines.append(f"### {kind}")
        lines.append("")
        # Median-length representative
        mid = items[len(items) // 2]
        lines.append(f"From `{mid[2]}` ({mid[0]} words):")
        lines.append(f"> {mid[1]}")
        lines.append("")
    return "\n".join(lines)


def aggregate_citations(reports: list[dict]) -> str:
    densities: list[float] = []
    style_counter: Counter = Counter()
    doi_yes = 0
    arxiv_only = 0
    method_compliance: list[float] = []
    dataset_compliance: list[float] = []
    material_compliance: list[float] = []

    for r in reports:
        d = safe_get(r, "citations", "density_per_1k_words")
        if isinstance(d, (int, float)):
            densities.append(float(d))
        s = safe_get(r, "citations", "style")
        if s:
            style_counter[s] += 1
        if safe_get(r, "citations", "uses_doi"):
            doi_yes += 1
        if safe_get(r, "citations", "uses_arxiv_only"):
            arxiv_only += 1
        for src, dst in [
            ("named_methods_cited_at_first_use_pct", method_compliance),
            ("named_datasets_cited_at_first_use_pct", dataset_compliance),
            ("named_materials_cited_at_first_use_pct", material_compliance),
        ]:
            v = safe_get(r, "citations", "first_use_compliance", src)
            if isinstance(v, (int, float)):
                dst.append(float(v))

    n = len(reports)
    lines = ["# Citation Patterns", "", f"Corpus size: {n} papers.", ""]
    if densities:
        lines.append("## Citation density (per 1,000 words)")
        lines.append("")
        try:
            qs = quantiles(densities, n=4)
            lines.append(f"- N: {len(densities)}")
            lines.append(f"- P25: {qs[0]:.1f}")
            lines.append(f"- Median: {median(densities):.1f}")
            lines.append(f"- P75: {qs[2]:.1f}")
        except Exception:
            pass
        lines.append("")

    lines.append("## Citation style distribution")
    lines.append("")
    lines.append("| Style | Papers | % |")
    lines.append("|-------|--------|---|")
    for s, c in style_counter.most_common():
        lines.append(f"| {s} | {c} | {round(100*c/n)}% |")
    lines.append("")

    lines.append("## DOI / arXiv usage")
    lines.append("")
    lines.append(f"- Uses DOI: {doi_yes}/{n} ({round(100*doi_yes/n)}%)")
    lines.append(f"- arXiv-only citations present: {arxiv_only}/{n} ({round(100*arxiv_only/n)}%)")
    lines.append("")

    lines.append("## First-use citation compliance (mean across corpus)")
    lines.append("")
    lines.append("| Entity Type | N papers | Mean Compliance % |")
    lines.append("|-------------|----------|-------------------|")
    for label, data in [
        ("Named methods", method_compliance),
        ("Named datasets", dataset_compliance),
        ("Named materials", material_compliance),
    ]:
        if data:
            lines.append(f"| {label} | {len(data)} | {sum(data)/len(data):.1f} |")
    lines.append("")
    return "\n".join(lines)


def aggregate_ai_tells(reports: list[dict], min_freq: int) -> str:
    phrase_counter: Counter = Counter()
    phrase_papers: dict[str, set[str]] = defaultdict(set)
    phrase_contexts: dict[str, list[tuple[str, str, str]]] = defaultdict(list)

    for r in reports:
        pid = r.get("paper_id", "?")
        for cand in r.get("ai_tell_candidates", []) or []:
            phrase = (cand.get("phrase") or "").strip().lower()
            if not phrase:
                continue
            phrase_counter[phrase] += 1
            phrase_papers[phrase].add(pid)
            ctx = cand.get("context") or ""
            sec = cand.get("section") or ""
            phrase_contexts[phrase].append((pid, sec, ctx))

    n = len(reports)
    lines = ["# AI-Writing Tell Candidates", "", f"Corpus size: {n} papers. Frequency threshold: ≥{min_freq} papers.", ""]
    lines.append("These are **candidates** — borderline phrases need user vetting. Some may be conventional domain vocabulary.")
    lines.append("")
    lines.append("| Phrase | Total occurrences | Papers | % of corpus |")
    lines.append("|--------|-------------------|--------|-------------|")
    sorted_phrases = sorted(
        phrase_counter.items(), key=lambda kv: (-len(phrase_papers[kv[0]]), -kv[1])
    )
    qualified = []
    for phrase, count in sorted_phrases:
        if len(phrase_papers[phrase]) < min_freq:
            continue
        qualified.append(phrase)
        lines.append(
            f"| `{phrase}` | {count} | {len(phrase_papers[phrase])} | {round(100*len(phrase_papers[phrase])/n)}% |"
        )
    lines.append("")

    if qualified:
        lines.append("## Example contexts")
        lines.append("")
        for phrase in qualified[:20]:
            lines.append(f"### `{phrase}`")
            lines.append("")
            for pid, sec, ctx in phrase_contexts[phrase][:3]:
                lines.append(f"From `{pid}` ({sec}):")
                lines.append(f"> {ctx}")
                lines.append("")
    return "\n".join(lines)


def aggregate_voice(reports: list[dict]) -> str:
    voice_dist: dict[str, Counter] = {
        "method": Counter(),
        "results": Counter(),
        "discussion": Counter(),
    }
    intro_paragraphs: list[tuple[str, str]] = []
    conclusion_paragraphs: list[tuple[str, str]] = []
    method_voice_examples: list[tuple[str, str]] = []

    for r in reports:
        pid = r.get("paper_id", "?")
        v = safe_get(r, "voice_samples", "method_voice")
        if v:
            voice_dist["method"][v] += 1
        v = safe_get(r, "voice_samples", "results_voice")
        if v:
            voice_dist["results"][v] += 1
        v = safe_get(r, "voice_samples", "discussion_voice")
        if v:
            voice_dist["discussion"][v] += 1

        intro = safe_get(r, "voice_samples", "intro_first_paragraph")
        if intro:
            intro_paragraphs.append((pid, intro))
        concl = safe_get(r, "voice_samples", "conclusion_last_paragraph")
        if concl:
            conclusion_paragraphs.append((pid, concl))
        ex = safe_get(r, "voice_samples", "method_voice_evidence")
        if ex:
            method_voice_examples.append((pid, ex))

    n = len(reports)
    lines = ["# Voice and Tone", "", f"Corpus size: {n} papers.", ""]
    lines.append("## Voice distribution by section")
    lines.append("")
    lines.append("| Section | Active-we | Passive | Mixed |")
    lines.append("|---------|-----------|---------|-------|")
    for section in ["method", "results", "discussion"]:
        c = voice_dist[section]
        total = sum(c.values()) or 1
        lines.append(
            f"| {section.capitalize()} | "
            f"{c.get('active_we', 0)} ({round(100*c.get('active_we', 0)/total)}%) | "
            f"{c.get('passive', 0)} ({round(100*c.get('passive', 0)/total)}%) | "
            f"{c.get('mixed', 0)} ({round(100*c.get('mixed', 0)/total)}%) |"
        )
    lines.append("")

    lines.append("## Representative intro paragraphs (3 samples)")
    lines.append("")
    for pid, p in intro_paragraphs[: min(3, len(intro_paragraphs))]:
        lines.append(f"From `{pid}`:")
        lines.append(f"> {p}")
        lines.append("")

    lines.append("## Representative conclusion paragraphs (3 samples)")
    lines.append("")
    for pid, p in conclusion_paragraphs[: min(3, len(conclusion_paragraphs))]:
        lines.append(f"From `{pid}`:")
        lines.append(f"> {p}")
        lines.append("")

    lines.append("## Method voice examples (5 samples)")
    lines.append("")
    for pid, p in method_voice_examples[: min(5, len(method_voice_examples))]:
        lines.append(f"From `{pid}`:")
        lines.append(f"> {p}")
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Aggregate Stage 1 paper extractions.")
    parser.add_argument("reports_dir", type=Path, help="Directory containing per-paper JSON files")
    parser.add_argument("--out", type=Path, required=True, help="Output directory for aggregated MD files")
    parser.add_argument(
        "--min-frequency", type=int, default=3,
        help="Minimum number of papers a term/phrase must appear in (default 3)",
    )
    args = parser.parse_args()

    if not args.reports_dir.is_dir():
        print(f"ERROR: {args.reports_dir} is not a directory", file=sys.stderr)
        sys.exit(1)

    args.out.mkdir(parents=True, exist_ok=True)

    reports = load_reports(args.reports_dir)
    if not reports:
        print(f"ERROR: no JSON files found in {args.reports_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(reports)} reports.")

    outputs = {
        "lexicon.md": aggregate_lexicon(reports, args.min_frequency),
        "structure-stats.md": aggregate_structure(reports),
        "figure-conventions.md": aggregate_figures(reports),
        "citation-patterns.md": aggregate_citations(reports),
        "ai-tells.md": aggregate_ai_tells(reports, args.min_frequency),
        "voice-samples.md": aggregate_voice(reports),
    }

    for fname, content in outputs.items():
        (args.out / fname).write_text(content, encoding="utf-8")
        print(f"  wrote {args.out / fname}")

    print(f"\nDone. Aggregated {len(reports)} papers into {args.out}.")


if __name__ == "__main__":
    main()
