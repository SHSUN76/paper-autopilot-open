# Stage 3 Synthesis Report Template

The final `corpus_report.md` should follow this structure. The report's value comes from being **actionable** — not just statistical. Every section should help the user make a decision.

## Required structure

```markdown
---
title: Corpus Analysis Report — <DOMAIN>
date: YYYY-MM-DD
corpus_size: <N papers>
papers_analyzed: <M>
papers_failed: <F>
journals_covered: <list>
years_covered: <range>
---

# Corpus Analysis Report — <DOMAIN>

## 1. Executive Summary

Three to five bullet points. The most important findings only. Lead with the single most actionable insight.

Examples (battery domain):
- The canonical structure for this corpus is `Abstract → Intro → Methods (Synthesis / Characterization / Testing) → Results → Discussion → Conclusion` (78% of papers). Methods is the longest section at median 1,400 words.
- Top 5 acronyms by frequency: NCM (94%), SEI (87%), DFT (82%), EIS (79%), XRD (76%).
- Voice is overwhelmingly passive in Methods (91%) but mixed/active in Discussion (52% active-we). A prose polisher should preserve this asymmetry.
- Citation density median is 18 per 1,000 words — higher than ML domain (12). Bibliography auditor should expect dense citation chains.
- Five domain-specific AI tells dominate: "remarkable performance" (43% of papers), "paramount importance" (29%), "groundbreaking material" (22%), "promising candidate" (67%, but conventional — borderline), "remarkable stability" (31%).

## 2. Lexicon

### 2.1 Acronyms (top 30 by frequency)

| Acronym | Expansion | Papers Using | First-Use Definition Rate |
|---------|-----------|--------------|----------------------------|
| NCM | LiNi₁-x-yCoxMnyO2 | 94% | 89% |
| ... | ... | ... | ... |

### 2.2 Standard units

| Unit | Context | Notation Variants Observed |
|------|---------|----------------------------|
| mAh/g | specific capacity | "mAh g⁻¹", "mAh/g", "mA·h/g" |
| ... | ... | ... |

Recommendation: standardize on `<one form>` for downstream tools. Reasoning: ...

### 2.3 Formula syntax

How are chemical formulas written across the corpus? Subscripts/superscripts? Stoichiometric notation? Variant tolerance?

## 3. Section Structure

### 3.1 Modal section order

Show the most common ordering with frequency. Then variations.

### 3.2 Section length distribution

| Section | P25 (words) | Median | P75 |
|---------|-------------|--------|-----|
| Abstract | 200 | 250 | 320 |
| Introduction | 600 | 800 | 1,100 |
| ... | ... | ... | ... |

### 3.3 Subsection patterns

Common subsection structures (e.g., Methods = Synthesis / Characterization / Electrochemistry).

### 3.4 Recommendation for a section-drafter agent

Specific guidance for tools that need to draft sections in this domain.

## 4. Figure Conventions

### 4.1 Figure type distribution

| Type | Frequency | Median per paper |
|------|-----------|------------------|
| XRD | 91% | 1.2 |
| SEM | 84% | 1.5 |
| ... | ... | ... |

### 4.2 Caption patterns

- Median caption length: <N> words
- Almost always includes: <list>
- Often includes: <list>
- Best exemplar caption (cited from `<paper-id>`):
  > <verbatim caption>

### 4.3 Recommendation for a figure-specialist agent

What conventions to enforce when generating figures and captions.

## 5. Citation Patterns

### 5.1 Density

Distribution of citations per 1,000 words. Mean, median, P25/P75.

### 5.2 First-use compliance

For each named entity type (methods, datasets, materials), what % of papers cite at first use vs. assume known.

### 5.3 Style

Citation style observed (numbered / author-year / superscript). Bibliography format.

### 5.4 Per-journal differences

If 5+ papers per journal exist, table showing differences. Otherwise omit.

### 5.5 Recommendation for a bibliography-auditor agent

Domain-specific rules to enforce.

## 6. Voice and Tone

### 6.1 Per-section voice distribution

| Section | Active-we | Passive | Mixed |
|---------|-----------|---------|-------|
| Methods | 9% | 91% | — |
| Results | 31% | 52% | 17% |
| Discussion | 52% | 21% | 27% |

### 6.2 Tense patterns

Description of when each tense is used.

### 6.3 Representative paragraphs (curated)

Three to five verbatim paragraphs from the corpus, labeled by section and source paper.

### 6.4 Recommendation for a prose-polisher agent

What voice to preserve, what to change, what hedge calibration looks like in this domain.

## 7. AI-Writing Tells (Domain-Specific)

### 7.1 Confirmed AI tells

Phrases that appear in ≥3 papers, are vague-superlative or content-empty, and aren't standard domain vocabulary. With example contexts.

### 7.2 Borderline / domain-conventional

Phrases that look like AI tells but are actually conventional in this field. Document so the writing-reviewer doesn't false-positive on them.

### 7.3 Recommendation for a writing-reviewer agent

Augmented AI-tell list for principle B8 in this domain.

## 8. Cross-Cutting Patterns

Observations that span multiple sections — e.g., "papers from Adv. Energy Mater. consistently use 'we demonstrate' as the contribution verb in abstracts".

## 9. Recommended Actions

This section is the bridge from analysis to deliverable. Adapt to the user's downstream goal.

If the user is forking a writing plugin:
- List of specific changes to each plugin file
- Reference: which corpus statistic justifies which change
- Implementation order

If the user is building a style guide:
- Canonical lexicon as appendix
- Section-by-section style rules with corpus citations

If the user is training a prose polisher:
- Voice preservation rules
- Hedge calibration table
- AI-tell augmentation list

## 10. Methodology and Caveats

- Number of papers analyzed / failed
- Format mix (vision vs. parsed markdown)
- Journal/venue distribution
- Year range
- Known biases (e.g., "70% of corpus from one journal" if applicable)
- Confidence notes summary

## Appendix A: Paper inventory

Table of all papers in the corpus with paper_id and citation. Failed papers in a separate sub-table with failure reasons.

## Appendix B: Raw aggregation files

Pointer to the `aggregated/*.md` files for users who want to drill into the raw data.
```

## Style guidance

- **Lead with insight, not data.** Each section starts with the takeaway, then supports it with statistics.
- **Cite specific papers** for any claim that isn't pure aggregate (e.g., "as in `kim2024nca`"). Traceability matters.
- **Tables over prose** for statistics. Prose for interpretation only.
- **Recommendation sections are required**. Without them, the report is just a data dump. The user is paying in time/tokens to get insight, not raw counts.
- **Caveats live at the end** so they don't bury the actionable parts.
