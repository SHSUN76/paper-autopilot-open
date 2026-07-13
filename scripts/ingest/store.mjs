// paper-autopilot-open — local vector store (zero external deps).
//
// Layout (rag.local_corpus_dir):
//   corpus-meta.json  — { version, created_at, updated_at, embedding:{provider,model,dimensions}, counts, paper_groups }
//   papers.json       — [ { paperId, paperGroup:"own"|"field", title?, journal?, year?, source_file?, added_at } ]
//   paragraphs.jsonl  — one paragraph object per line, includes `embedding` (number[])
//   moves.jsonl       — one move object per line
//   vocabulary.json   — [ { paperId, category, term, expansion?, context?, firstUseSection?, isDefinedAtFirstUse? } ]
//   aitells.json      — [ { paperId, phrase, section?, context?, rationale? } ]
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

  // paper-level metadata (best effort — combined report may carry it)
  const meta = report.metadata || {};
  const paper = {
    paperId,
    paperGroup: group === "field" ? "field" : "own",
    title: str(meta.title),
    journal: str(meta.journal),
    year: intOrNull(meta.year),
    source_file: str(report.source_file),
    added_at: new Date().toISOString(),
  };

  return { paperId, paper, paragraphs, moves, aitells, vocabulary, warnings };
}
