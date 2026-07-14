// paper-autopilot-open — local vector store (zero external deps).
//
// Layout (rag.local_corpus_dir):
//   corpus-meta.json  — { version, created_at, updated_at, embedding:{provider,model,dimensions,task_type}, counts, paper_groups }
//   papers.json       — [ { paperId, paperGroup:"own"|"field"|"review", title?, journal?, year?, source_file?, added_at } ]
//   paragraphs.jsonl  — one paragraph object per line, includes `embedding` (number[])
//   moves.jsonl       — one move object per line
//   vocabulary.json   — [ { paperId, category, term, expansion?, context?, firstUseSection?, isDefinedAtFirstUse? } ]
//   aitells.json      — [ { paperId, phrase, section?, context?, rationale? } ]
//   figures.jsonl     — one figure object per line, includes `embedding` (number[]) — figure-set RAG
//   figure-arcs.json  — [ { paperId, group, arcPattern, arcSummary, narrativeLogic, figureSequence[] } ]
//   methodology.jsonl — one technique record per line, includes `embedding` (number[]) — methodology RAG
//
// Scale target: 10-100 papers, <=10k paragraphs. Brute-force cosine is plenty.

import fs from "node:fs";
import path from "node:path";

export const STORE_VERSION = 1;

// Warn at most once per process when a move object carries neither
// move_type nor moveType (see parseReport move handling below).
let warnedMissingMoveType = false;

// ---- small coercion helpers ------------------------------------------------
export const str = (v) => (typeof v === "string" ? v : v == null ? null : String(v));
export const arr = (v) => (Array.isArray(v) ? v : []);
export const intOr = (v, d) => (Number.isFinite(Number(v)) ? parseInt(v, 10) : d);
export const intOrNull = (v) => (Number.isFinite(Number(v)) ? parseInt(v, 10) : null);

// Paper groups: own (author's own papers, drives style-profile),
// field (domain papers, drives field-profile knowledge), review (domain review
// papers, knowledge-only; excluded from style-profile). Anything else -> own.
export const PAPER_GROUPS = ["own", "field", "review"];
export function normGroup(g) {
  return g === "field" ? "field" : g === "review" ? "review" : "own";
}

// narrative_role enum for figures (figure-set RAG). Values outside this set are
// accepted verbatim but warned about (schema drift tolerance).
export const NARRATIVE_ROLES = new Set([
  "motivation",
  "design-concept",
  "synthesis-structure",
  "morphology",
  "mechanism",
  "performance",
  "benchmark-comparison",
  "device-validation",
  "summary",
]);

// methodology category enum (methodology RAG). Unknown/missing values default to
// "standard" (with a warning at parse time) so the --category filter and the
// corpus report stay on the two-value advanced/standard partition.
export const METHOD_CATEGORIES = new Set(["standard", "advanced"]);
export function normCategory(c) {
  const s = (c == null ? "" : String(c)).toLowerCase();
  return s === "advanced" ? "advanced" : "standard";
}

// ---- section normalizer (JS mirror of the SQL SECTION_NORMALIZER) ----------
// Rule order matches retrieve.mjs's SQL CASE exactly.
export function normalizeSection(name) {
  const s = (name || "").toLowerCase();
  if (/introduction|background/.test(s)) return "Introduction";
  if (/method|experiment|materials/.test(s) && !s.includes("result")) return "Methods";
  if (/result.*discussion|discussion.*result/.test(s)) return "Results+Discussion";
  if (/result/.test(s)) return "Results";
  if (/discussion/.test(s)) return "Discussion";
  if (/conclusion|summary|outlook/.test(s)) return "Conclusion";
  return "Other";
}

// ---- cosine similarity -----------------------------------------------------
export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}

// ---- paths -----------------------------------------------------------------
export function storePaths(dir) {
  return {
    dir,
    meta: path.join(dir, "corpus-meta.json"),
    papers: path.join(dir, "papers.json"),
    paragraphs: path.join(dir, "paragraphs.jsonl"),
    moves: path.join(dir, "moves.jsonl"),
    vocabulary: path.join(dir, "vocabulary.json"),
    aitells: path.join(dir, "aitells.json"),
    figures: path.join(dir, "figures.jsonl"),
    figureArcs: path.join(dir, "figure-arcs.json"),
    methodology: path.join(dir, "methodology.jsonl"),
  };
}

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length)
    .map((l) => JSON.parse(l));
}

// ---- loaders ---------------------------------------------------------------
export function loadMeta(dir) {
  return readJson(storePaths(dir).meta, null);
}
export function loadPapers(dir) {
  return readJson(storePaths(dir).papers, []);
}
export function loadParagraphs(dir) {
  return readJsonl(storePaths(dir).paragraphs);
}
export function loadMoves(dir) {
  return readJsonl(storePaths(dir).moves);
}
export function loadVocabulary(dir) {
  return readJson(storePaths(dir).vocabulary, []);
}
export function loadAitells(dir) {
  return readJson(storePaths(dir).aitells, []);
}
export function loadFigures(dir) {
  return readJsonl(storePaths(dir).figures);
}
export function loadFigureArcs(dir) {
  return readJson(storePaths(dir).figureArcs, []);
}
export function loadMethodology(dir) {
  return readJsonl(storePaths(dir).methodology);
}

// Load the whole store for the retrieve path. Throws a clear error if the
// corpus has not been built yet.
export function loadStore(dir) {
  const meta = loadMeta(dir);
  if (!meta) {
    throw new Error(
      `Local corpus not found at ${dir}\n` +
        "  Build it first:\n" +
        "    node scripts/ingest/build-corpus.mjs --input <paragraph_reports_dir> --group own"
    );
  }
  return {
    meta,
    papers: loadPapers(dir),
    paragraphs: loadParagraphs(dir),
    moves: loadMoves(dir),
    vocabulary: loadVocabulary(dir),
    aitells: loadAitells(dir),
  };
}

// ---- writers ---------------------------------------------------------------
export function writeStore(dir, { meta, papers, paragraphs, moves, vocabulary, aitells }) {
  fs.mkdirSync(dir, { recursive: true });
  const p = storePaths(dir);
  fs.writeFileSync(p.meta, JSON.stringify(meta, null, 2));
  fs.writeFileSync(p.papers, JSON.stringify(papers, null, 2));
  fs.writeFileSync(p.paragraphs, paragraphs.map((x) => JSON.stringify(x)).join("\n") + (paragraphs.length ? "\n" : ""));
  fs.writeFileSync(p.moves, moves.map((x) => JSON.stringify(x)).join("\n") + (moves.length ? "\n" : ""));
  fs.writeFileSync(p.vocabulary, JSON.stringify(vocabulary, null, 2));
  fs.writeFileSync(p.aitells, JSON.stringify(aitells, null, 2));
}

// ---- figure store writer (figure-set RAG) ----------------------------------
// Separate from writeStore so paragraph-only corpora never grow empty figure
// artifacts; build-corpus only calls this when there are figures to persist.
export function writeFigureStore(dir, { figures, figureArcs }) {
  fs.mkdirSync(dir, { recursive: true });
  const p = storePaths(dir);
  fs.writeFileSync(
    p.figures,
    figures.map((x) => JSON.stringify(x)).join("\n") + (figures.length ? "\n" : "")
  );
  fs.writeFileSync(p.figureArcs, JSON.stringify(figureArcs, null, 2));
}

// ---- methodology store writer (methodology RAG) ----------------------------
// Separate from writeStore / writeFigureStore so paragraph- or figure-only
// corpora never grow an empty methodology.jsonl; build-corpus only calls this
// when there is methodology to persist (or update).
export function writeMethodologyStore(dir, { methodology }) {
  fs.mkdirSync(dir, { recursive: true });
  const p = storePaths(dir);
  fs.writeFileSync(
    p.methodology,
    methodology.map((x) => JSON.stringify(x)).join("\n") + (methodology.length ? "\n" : "")
  );
}

// ---- report parsing --------------------------------------------------------
// Flexible parser for paper-corpus-mining output. Primary schema is the
// paragraph-level report (paragraph_extraction.md): { paper_id, paragraphs[] }.
// If a combined report also carries `lexicon` / `ai_tell_candidates`
// (extraction-template.md paper-level schema), those are consumed too so the
// vocabulary/aitells commands have data. Missing pieces produce warnings, not
// hard failures.
export function parseReport(report, { group } = {}) {
  const warnings = [];
  const paperId = report.paper_id || report.paperId;
  if (!paperId) return { error: "missing paper_id / paperId" };

  const rawParas = arr(report.paragraphs);
  if (rawParas.length === 0) warnings.push(`${paperId}: no paragraphs[] array`);

  const paragraphs = [];
  const moves = [];
  let globalIndex = 0;
  for (const para of rawParas) {
    const pid = `${paperId}::p${globalIndex}`;
    const sectionName = para.section_name || para.sectionName || "Unnamed";
    paragraphs.push({
      id: pid,
      paperId,
      sectionName,
      positionInSection: intOr(para.position_in_section ?? para.positionInSection, 0),
      globalIndex,
      text: String(para.text || ""),
      wordCount: intOrNull(para.word_count ?? para.wordCount),
      voice: str(para.voice),
      hedgeLevel: str(para.hedge_level ?? para.hedgeLevel),
      tensePattern: str(para.tense_pattern ?? para.tensePattern),
      hasActiveWe: !!(para.has_active_we ?? para.hasActiveWe),
      primaryClaimType: str(para.primary_claim_type ?? para.primaryClaimType),
      citesCount: intOr(para.cites_count ?? para.citesCount, 0),
      refsFigures: arr(para.refs_figures ?? para.refsFigures),
      refsEquations: arr(para.refs_equations ?? para.refsEquations),
      refsTables: arr(para.refs_tables ?? para.refsTables),
      refsPriorWork: intOr(para.refs_prior_work ?? para.refsPriorWork, 0),
      aiTellPhrases: arr(para.ai_tell_phrases ?? para.aiTellPhrases),
      embedding: null, // filled by the builder
    });

    const rawMoves = arr(para.moves);
    for (let mi = 0; mi < rawMoves.length; mi++) {
      const m = rawMoves[mi];
      let moveType, positionInParagraph, textSpan;
      if (typeof m === "string") {
        // Bare-string move (e.g. "present_evidence") — the string IS the type.
        moveType = m;
        positionInParagraph = mi;
        textSpan = "";
      } else if (m && (m.move_type != null || m.moveType != null)) {
        moveType = String(m.move_type ?? m.moveType);
        positionInParagraph = intOr(m.position ?? m.positionInParagraph, mi);
        textSpan = String(m.text_span || m.textSpan || "");
      } else {
        // Object without any move type — cannot infer; warn once, fall back.
        if (!warnedMissingMoveType) {
          warnedMissingMoveType = true;
          process.stderr.write(
            "WARN: move object without move_type/moveType — defaulting to 'interpret' " +
              `(first seen in ${paperId})\n`
          );
        }
        moveType = "interpret";
        positionInParagraph = intOr(m && (m.position ?? m.positionInParagraph), mi);
        textSpan = String((m && (m.text_span || m.textSpan)) || "");
      }
      moves.push({
        id: `${pid}::m${mi}`,
        paragraphId: pid,
        paperId,
        moveType,
        positionInParagraph,
        textSpan,
      });
    }
    globalIndex++;
  }

  // aitells — per-paragraph ai_tell_phrases (paragraph schema)
  const aitells = [];
  for (const p of paragraphs) {
    for (const phrase of p.aiTellPhrases) {
      if (phrase) {
        aitells.push({
          paperId,
          phrase: String(phrase),
          section: normalizeSection(p.sectionName),
          context: null,
          rationale: null,
        });
      }
    }
  }
  // aitells — paper-level ai_tell_candidates (combined report)
  if (Array.isArray(report.ai_tell_candidates)) {
    for (const t of report.ai_tell_candidates) {
      const phrase = typeof t === "string" ? t : t.phrase;
      if (phrase) {
        aitells.push({
          paperId,
          phrase: String(phrase),
          section: str(t.section),
          context: str(t.context),
          rationale: str(t.rationale),
        });
      }
    }
  }

  // vocabulary — from paper-level lexicon (combined report only)
  const vocabulary = [];
  const lex = report.lexicon;
  if (lex && typeof lex === "object") {
    for (const a of arr(lex.acronyms)) {
      if (a && (a.abbr || a.term)) {
        vocabulary.push({
          paperId,
          category: "acronym",
          term: str(a.abbr || a.term),
          expansion: str(a.expansion),
          context: null,
          firstUseSection: str(a.first_use_section),
          isDefinedAtFirstUse:
            typeof a.is_defined_at_first_use === "boolean" ? a.is_defined_at_first_use : null,
        });
      }
    }
    for (const u of arr(lex.units)) {
      const unit = typeof u === "string" ? u : str(u && u.unit);
      const ctx = typeof u === "object" && u ? str(u.context) : null;
      if (unit) {
        vocabulary.push({
          paperId, category: "unit", term: unit, expansion: null,
          context: ctx, firstUseSection: null, isDefinedAtFirstUse: null,
        });
      }
    }
    for (const m of arr(lex.method_names)) {
      if (m && m.name) {
        vocabulary.push({
          paperId, category: "method", term: str(m.name), expansion: null,
          context: null, firstUseSection: str(m.first_use_section), isDefinedAtFirstUse: null,
        });
      }
    }
    for (const inst of arr(lex.instrument_names)) {
      if (inst && inst.name) {
        vocabulary.push({
          paperId, category: "instrument", term: str(inst.name), expansion: null,
          context: str(inst.purpose), firstUseSection: null, isDefinedAtFirstUse: null,
        });
      }
    }
  } else {
    warnings.push(
      `${paperId}: no 'lexicon' field (paragraph_reports schema) — vocabulary command will be empty for this paper`
    );
  }

  // paper-level bibliographic metadata (best effort). Accepts either a nested
  // `metadata` object (combined report) or top-level fields on the report, with
  // metadata taking priority. Absent fields stay null (backward compatible).
  const meta = report.metadata || {};
  const paper = {
    paperId,
    paperGroup: normGroup(group),
    title: str(meta.title ?? report.title),
    journal: str(meta.journal ?? report.journal),
    year: intOrNull(meta.year ?? report.year),
    source_file: str(report.source_file),
    added_at: new Date().toISOString(),
  };

  return { paperId, paper, paragraphs, moves, aitells, vocabulary, warnings };
}

// ---- figure report parsing (figure-set RAG) --------------------------------
// Parses a `<paper_id>.figures.json` report (figure vision analysis output).
// `paperGroup` should be the group resolved from the corresponding paragraph
// report's paper when known; otherwise the caller passes the --group value.
// Missing fields are tolerated (null / []) with a single warning line each.
export function parseFigureReport(report, { paperGroup } = {}) {
  const warnings = [];
  const paperId = report.paper_id || report.paperId;
  if (!paperId) return { error: "missing paper_id / paperId (figures report)" };
  const pg = normGroup(paperGroup);

  const rawFigs = arr(report.figures);
  if (rawFigs.length === 0) warnings.push(`${paperId}: figures report has no figures[] array`);

  const figures = [];
  const figureSequence = [];
  for (let i = 0; i < rawFigs.length; i++) {
    const f = rawFigs[i] || {};
    const figIndex = intOrNull(f.fig_index ?? f.figIndex);
    const figId = str(f.fig_id ?? f.figId) || (figIndex != null ? `Fig${figIndex}` : `fig${i}`);
    const narrativeRole = str(f.narrative_role ?? f.narrativeRole);
    if (narrativeRole && !NARRATIVE_ROLES.has(narrativeRole)) {
      warnings.push(`${paperId}/${figId}: unknown narrative_role '${narrativeRole}'`);
    }
    const rec = {
      paperId,
      figId,
      figIndex,
      figTotal: intOrNull(f.fig_total ?? f.figTotal),
      isSi: !!(f.is_si ?? f.isSi),
      figureType: arr(f.figure_type ?? f.figureType).map((x) => String(x)),
      narrativeRole,
      panelCount: intOrNull(f.panel_count ?? f.panelCount),
      panelGrid: str(f.panel_grid ?? f.panelGrid),
      panels: arr(f.panels).map((p) => ({
        label: str(p && p.label),
        type: str(p && p.type),
        summary: str(p && p.summary),
      })),
      caption: str(f.caption),
      keyMessage: str(f.key_message ?? f.keyMessage),
      narrativeContext: str(f.narrative_context ?? f.narrativeContext),
      quantitativeClaims: arr(f.quantitative_claims ?? f.quantitativeClaims).map((x) => String(x)),
      domainTags: arr(f.domain_tags ?? f.domainTags).map((x) => String(x)),
      paperGroup: pg,
      embedding: null, // filled by the builder
    };
    figures.push(rec);
    figureSequence.push({
      figId: rec.figId,
      figIndex: rec.figIndex,
      figureType: rec.figureType,
      narrativeRole: rec.narrativeRole,
      keyMessage: rec.keyMessage,
    });
  }

  const arc = {
    paperId,
    group: pg,
    arcPattern: str(report.arc_pattern ?? report.arcPattern),
    arcSummary: str(report.arc_summary ?? report.arcSummary),
    narrativeLogic: str(report.narrative_logic ?? report.narrativeLogic),
    figureSequence,
  };

  // Optional top-level `methodology` block on the same figures report (v2.2.0+).
  // Absent -> null (silently; the block is optional).
  const methodology = parseMethodologyBlock(report, { paperId, paperGroup: pg, warnings });

  return { paperId, figures, arc, methodology, warnings };
}

// ---- methodology block parsing (methodology RAG) ---------------------------
// Parses the optional top-level `methodology` block carried on a
// `<paper_id>.figures.json` report:
//   { techniques: [{ technique, category, purpose, evidence_target, figures[],
//                    instrument_notes }], analysis_pipeline }
// Returns an array of per-technique records (the paper-common analysis_pipeline
// replicated onto each) or null when the block is absent or carries no usable
// technique. Missing / unknown fields are tolerated with a single warning line
// each (block absent = silent, since the block is optional).
export function parseMethodologyBlock(report, { paperId, paperGroup, warnings } = {}) {
  const warn = warnings || [];
  const pg = normGroup(paperGroup);
  const block = report && report.methodology;
  if (!block || typeof block !== "object") return null; // optional block absent
  const pipeline = str(block.analysis_pipeline ?? block.analysisPipeline);
  const rawTechs = arr(block.techniques);
  if (rawTechs.length === 0) {
    warn.push(`${paperId}: methodology block has no techniques[] array`);
    return null;
  }
  const records = [];
  for (const t of rawTechs) {
    if (!t || typeof t !== "object") continue;
    const technique = str(t.technique ?? t.name);
    if (!technique) {
      warn.push(`${paperId}: methodology technique missing 'technique' name — skipped`);
      continue;
    }
    const rawCat = t.category;
    if (rawCat == null || !METHOD_CATEGORIES.has(String(rawCat).toLowerCase())) {
      warn.push(
        `${paperId}/${technique}: category missing/invalid ('${rawCat == null ? "" : rawCat}') — defaulting to 'standard'`
      );
    }
    records.push({
      paperId,
      paperGroup: pg,
      technique,
      category: normCategory(rawCat),
      purpose: str(t.purpose),
      evidenceTarget: str(t.evidence_target ?? t.evidenceTarget),
      figures: arr(t.figures).map((x) => String(x)),
      instrumentNotes: str(t.instrument_notes ?? t.instrumentNotes),
      analysisPipeline: pipeline,
      embedding: null, // filled by the builder
    });
  }
  return records.length ? records : null;
}

// Compose the embedding text for a single figure record (figure-set RAG),
// following the confirmed template (~300-400 token target). `journal` / `year`
// come from the corresponding paper's bibliographic metadata when available.
export function figureEmbeddingText(fig, { journal, year } = {}) {
  const paperLabel = journal || fig.paperId || "";
  const yr = year != null && year !== "" ? String(year) : "";
  const domain = arr(fig.domainTags).join(", ");
  const ftype = arr(fig.figureType).join("+");
  const panelsLine = arr(fig.panels)
    .map((p) => `(${p && p.label != null ? p.label : "?"}) ${(p && p.type) || ""}: ${(p && p.summary) || ""}`)
    .join(" ");
  return (
    `[Paper] ${paperLabel} ${yr} | ${domain}\n` +
    `[Figure ${fig.figIndex != null ? fig.figIndex : "?"}/${fig.figTotal != null ? fig.figTotal : "?"}] ` +
    `type: ${ftype} | role: ${fig.narrativeRole || ""} | ` +
    `panels: ${fig.panelCount != null ? fig.panelCount : "?"} (${fig.panelGrid || ""})\n` +
    `[Key message] ${fig.keyMessage || ""}\n` +
    `[Caption] ${fig.caption || ""}\n` +
    `[Panels] ${panelsLine}\n` +
    `[Narrative context] ${fig.narrativeContext || ""}`
  );
}

// Compose the embedding text for a single methodology record (methodology RAG),
// following the confirmed one-line template:
//   [Technique] {technique} ({category}) | [Purpose] {purpose} |
//   [Evidence] {evidence_target} | [Pipeline] {analysis_pipeline}
export function methodEmbeddingText(m) {
  return (
    `[Technique] ${m.technique || ""} (${m.category || ""}) | ` +
    `[Purpose] ${m.purpose || ""} | ` +
    `[Evidence] ${m.evidenceTarget || ""} | ` +
    `[Pipeline] ${m.analysisPipeline || ""}`
  );
}
