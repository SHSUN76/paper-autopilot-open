#!/usr/bin/env node
/**
 * paper-autopilot-open — Bash-callable RAG helper for the writing corpus.
 *
 * Dual backend, selected by rag.mode in ~/.claude/paper-autopilot-open/config.json:
 *   local     (default) — brute-force cosine over a local vector store, no external DB
 *   supabase  (opt-in)  — pgvector queries against your own Supabase project
 *   disabled            — clear message + exit code 2
 *
 * Commands (identical output shape across backends):
 *   node retrieve.mjs paragraphs --query "We propose..." --section Introduction --claim contribution --k 5 [--since 2020]
 *   node retrieve.mjs next-paragraph --query "Figure 3 shows cycling..." --k 3
 *   node retrieve.mjs vocabulary --category verb --context "DFT cycling" --min-papers 5
 *   node retrieve.mjs aitells --threshold 5
 *   node retrieve.mjs section-distribution --section Introduction
 *   node retrieve.mjs move-transitions --from present_evidence
 *   node retrieve.mjs style-profile          (local only — dumps style-profile.json)
 *   node retrieve.mjs field-profile          (local only — dumps field-profile.json)
 *   node retrieve.mjs figures --query "Nyquist EIS panel" --type electrochemical --role performance --group field --k 5   (local only — figure-set RAG search)
 *   node retrieve.mjs figure-arcs --group own    (local only — returns ALL figure arcs; not a search)
 *   node retrieve.mjs methods --query "operando phase transition" --technique XRD --category advanced --group field --k 5   (local only — methodology RAG search)
 *
 * Dev / test bypass for the embedding call (paragraphs, next-paragraph):
 *   --query-vector '[0.1, 0.2, ...]'   supply the query vector directly (skips embed + provider check)
 *   embedding.provider = "stub"        deterministic offline embedding (no network)
 *
 * Output: JSON to stdout. Errors to stderr.
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig, providerApiKey } from "./ingest/config.mjs";
import { embedOne } from "./ingest/embedding.mjs";
import {
  normalizeSection,
  cosine,
  loadStore,
  loadFigures,
  loadFigureArcs,
  loadMethodology,
  arr,
} from "./ingest/store.mjs";

const config = loadConfig();

// ---- arg parsing (unchanged CLI grammar) ----------------------------------
const args = process.argv.slice(2);
const cmd = args[0];
const opts = {};
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
    opts[key] = val;
  }
}

const VALID_CMDS = [
  "paragraphs",
  "next-paragraph",
  "vocabulary",
  "aitells",
  "section-distribution",
  "move-transitions",
  "style-profile",
  "field-profile",
  "figures",
  "figure-arcs",
  "methods",
];

// style-profile / field-profile are local-only artifacts (no supabase analogue).
const LOCAL_ONLY_CMDS = new Set(["style-profile", "field-profile"]);
// figures / figure-arcs (figure-set RAG) are local-only too — no supabase schema.
const FIGURE_CMDS = new Set(["figures", "figure-arcs"]);
// methods (methodology RAG) is local-only too — no supabase schema.
const METHOD_CMDS = new Set(["methods"]);

function usageExit() {
  console.error(
    "Usage: node retrieve.mjs <" + VALID_CMDS.join("|") + "> [opts]\n" +
      "  paragraphs   --query <t> [--section S] [--claim C] [--group own|field|review] [--since <year>] [--k N]\n" +
      "  figures      --query <t> [--type X] [--role Y] [--group own|field|review] [--k N]\n" +
      "  figure-arcs  [--group own|field|review]   (returns all arcs; not a search)\n" +
      "  methods      --query <t> [--technique T] [--category standard|advanced] [--group own|field|review] [--k N]\n" +
      "  style-profile | field-profile | figures | figure-arcs | methods   (local mode only; run build-corpus.mjs first)"
  );
  process.exit(1);
}

if (!cmd || !VALID_CMDS.includes(cmd)) usageExit();

// ---- query embedding (shared by both backends) ----------------------------
// Honors --query-vector dev override and enforces provider consistency with
// the corpus that was actually built.
async function embedQuery(text, corpusMeta) {
  if (opts["query-vector"]) {
    let v;
    try {
      v = JSON.parse(opts["query-vector"]);
    } catch (e) {
      throw new Error("--query-vector must be a JSON array: " + e.message);
    }
    if (!Array.isArray(v)) throw new Error("--query-vector must be a JSON array");
    return v;
  }
  const provider = config.embedding.provider;
  if (corpusMeta && corpusMeta.embedding && corpusMeta.embedding.provider !== provider) {
    throw new Error(
      `Embedding provider mismatch: corpus was built with '${corpusMeta.embedding.provider}' ` +
        `but config.embedding.provider='${provider}'. ` +
        "Rebuild the corpus with the matching provider, or fix config.embedding.provider."
    );
  }
  // Corpus/config dimension consistency (both backends). When the corpus meta
  // records dimensions (local corpus-meta.json or supabase CorpusMeta row), the
  // config MUST match it — whatever the value (1024-era supabase corpora keep
  // working with a matching config; there is NO fixed-3072 assumption here).
  const metaDims =
    corpusMeta && corpusMeta.embedding && corpusMeta.embedding.dimensions != null
      ? Number(corpusMeta.embedding.dimensions)
      : null;
  if (metaDims != null && metaDims !== Number(config.embedding.dimensions)) {
    throw new Error(
      `Embedding dimensions mismatch: corpus was built with ${metaDims}d but ` +
        `config.embedding.dimensions=${config.embedding.dimensions}. ` +
        `Set embedding.dimensions to ${metaDims} (corpus 생성 당시 값) — ` +
        "차원을 바꾸려면 corpus 전체 재적재가 필요합니다."
    );
  }
  const dims = metaDims || config.embedding.dimensions;
  const apiKey = providerApiKey(config, provider);
  // gemini taskType compat: only send RETRIEVAL_QUERY when the corpus was built
  // WITH a task_type recorded in meta. Corpora built before task_type existed
  // (meta.embedding.task_type absent/null) are queried WITHOUT taskType so the
  // query embedding stays consistent with how those documents were embedded.
  const taskType =
    corpusMeta && corpusMeta.embedding && corpusMeta.embedding.task_type
      ? "RETRIEVAL_QUERY"
      : undefined;
  return embedOne(text, { provider, dimensions: dims, apiKey, taskType });
}

// ===========================================================================
// LOCAL BACKEND
// ===========================================================================
async function runLocal() {
  // Profile commands read a prebuilt JSON artifact directly (no store load, no
  // embedding) so they give a precise "build first" message when absent.
  if (LOCAL_ONLY_CMDS.has(cmd)) return localProfile(cmd);
  // figure-arcs returns ALL arcs verbatim (not a search) — no store / no embed.
  if (cmd === "figure-arcs") return localFigureArcs();

  const store = loadStore(config.rag.local_corpus_dir);
  const meta = store.meta;

  switch (cmd) {
    case "paragraphs":
      return localParagraphs(store, meta);
    case "next-paragraph":
      return localNextParagraph(store, meta);
    case "vocabulary":
      return localVocabulary(store);
    case "aitells":
      return localAitells(store);
    case "section-distribution":
      return localSectionDistribution(store);
    case "move-transitions":
      return localMoveTransitions(store);
    case "figures":
      return localFigures(meta);
    case "methods":
      return localMethods(meta);
  }
}

// figure-set RAG "not built yet" guard (figures.jsonl / figure-arcs.json absent).
function figureCorpusMissing() {
  console.error("figure corpus 없음 — vision figure 분석 후 build-corpus 재실행");
  process.exit(1);
}

function figureGroupOpt() {
  if (opts.group && !["own", "field", "review"].includes(opts.group)) {
    throw new Error("--group must be 'own', 'field', or 'review'");
  }
  return opts.group || null;
}

// figures: pre-filter (type substring / role exact / group) then cosine top-k.
async function localFigures(meta) {
  const figures = loadFigures(config.rag.local_corpus_dir);
  if (!figures.length) figureCorpusMissing();
  if (!opts.query) throw new Error("--query required");
  const k = parseInt(opts.k || "5", 10);
  const group = figureGroupOpt();
  const vec = await embedQuery(opts.query, meta);

  let rows = figures.slice();
  if (opts.type) {
    const t = String(opts.type).toLowerCase();
    rows = rows.filter((f) => arr(f.figureType).some((x) => String(x).toLowerCase().includes(t)));
  }
  if (opts.role) rows = rows.filter((f) => f.narrativeRole === opts.role);
  if (group) rows = rows.filter((f) => f.paperGroup === group);

  const scored = rows.map((f) => ({ f, similarity: cosine(vec, f.embedding || []) }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k).map(({ f, similarity }) => ({
    paperId: f.paperId,
    fig_id: f.figId,
    figure_type: f.figureType,
    narrative_role: f.narrativeRole ?? null,
    panel_count: f.panelCount ?? null,
    panel_grid: f.panelGrid ?? null,
    caption: f.caption ?? null,
    key_message: f.keyMessage ?? null,
    narrative_context: f.narrativeContext ?? null,
    similarity,
  }));
}

// figure-arcs: return ALL arcs (optionally group-filtered). Not a search.
function localFigureArcs() {
  const arcs = loadFigureArcs(config.rag.local_corpus_dir);
  if (!arcs.length) figureCorpusMissing();
  const group = figureGroupOpt();
  const rows = group ? arcs.filter((a) => a.group === group) : arcs;
  return rows.map((a) => ({
    paperId: a.paperId,
    group: a.group,
    arc_pattern: a.arcPattern ?? null,
    arc_summary: a.arcSummary ?? null,
    narrative_logic: a.narrativeLogic ?? null,
    figure_sequence: arr(a.figureSequence).map((f) => ({
      fig_id: f.figId,
      fig_index: f.figIndex ?? null,
      figure_type: f.figureType,
      narrative_role: f.narrativeRole ?? null,
      key_message: f.keyMessage ?? null,
    })),
  }));
}

// methodology RAG "not built yet" guard (methodology.jsonl absent / empty).
function methodologyCorpusMissing() {
  console.error(
    "methodology corpus 없음 — vision 분석에 methodology 블록 포함 후 build-corpus 재실행"
  );
  process.exit(1);
}

// methods: pre-filter (technique case-insensitive substring / category exact /
// group) then cosine top-k. Output contract is fixed (M3 wiring):
//   [{ paperId, technique, category, purpose, evidence_target, figures,
//      analysis_pipeline, similarity }]
async function localMethods(meta) {
  const methods = loadMethodology(config.rag.local_corpus_dir);
  if (!methods.length) methodologyCorpusMissing();
  if (!opts.query) throw new Error("--query required");
  const k = parseInt(opts.k || "5", 10);
  const group = figureGroupOpt();
  if (opts.category && !["standard", "advanced"].includes(opts.category)) {
    throw new Error("--category must be 'standard' or 'advanced'");
  }
  const vec = await embedQuery(opts.query, meta);

  let rows = methods.slice();
  if (opts.technique) {
    const t = String(opts.technique).toLowerCase();
    rows = rows.filter((m) => String(m.technique || "").toLowerCase().includes(t));
  }
  if (opts.category) rows = rows.filter((m) => m.category === opts.category);
  if (group) rows = rows.filter((m) => m.paperGroup === group);

  const scored = rows.map((m) => ({ m, similarity: cosine(vec, m.embedding || []) }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k).map(({ m, similarity }) => ({
    paperId: m.paperId,
    technique: m.technique ?? null,
    category: m.category ?? null,
    purpose: m.purpose ?? null,
    evidence_target: m.evidenceTarget ?? null,
    figures: arr(m.figures),
    analysis_pipeline: m.analysisPipeline ?? null,
    similarity,
  }));
}

// Dump a prebuilt profile artifact (style-profile.json / field-profile.json).
function localProfile(which) {
  const fname = which === "style-profile" ? "style-profile.json" : "field-profile.json";
  const fpath = path.join(config.rag.local_corpus_dir, fname);
  if (!fs.existsSync(fpath)) {
    console.error("corpus를 먼저 빌드하세요 (build-corpus.mjs)");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(fpath, "utf8"));
}

async function localParagraphs(store, meta) {
  if (!opts.query) throw new Error("--query required");
  const k = parseInt(opts.k || "5", 10);
  const vec = await embedQuery(opts.query, meta);

  let rows = store.paragraphs.map((p) => ({
    p,
    section: normalizeSection(p.sectionName),
    similarity: cosine(vec, p.embedding || []),
  }));
  if (opts.section) rows = rows.filter((r) => r.section === opts.section);
  if (opts.claim) rows = rows.filter((r) => r.p.primaryClaimType === opts.claim);
  if (opts.group) {
    if (!["own", "field", "review"].includes(opts.group)) {
      throw new Error("--group must be 'own', 'field', or 'review'");
    }
    // paperGroup lives on papers.json, not per-paragraph — map paperId -> group.
    const groupByPaper = new Map(store.papers.map((p) => [p.paperId, p.paperGroup]));
    rows = rows.filter((r) => groupByPaper.get(r.p.paperId) === opts.group);
  }
  // --since <year>: keep papers with year >= since. Papers with an unknown year
  // (year == null) are excluded; the drop count is noted to stderr (1 line).
  if (opts.since != null && opts.since !== true) {
    const since = parseInt(opts.since, 10);
    if (Number.isFinite(since)) {
      const yearByPaper = new Map(store.papers.map((p) => [p.paperId, p.year ?? null]));
      let droppedNullYear = 0;
      const droppedPapers = new Set();
      rows = rows.filter((r) => {
        const y = yearByPaper.get(r.p.paperId);
        if (y == null) {
          droppedNullYear += 1;
          droppedPapers.add(r.p.paperId);
          return false;
        }
        return y >= since;
      });
      if (droppedNullYear > 0) {
        process.stderr.write(
          `--since ${since}: excluded ${droppedNullYear} paragraph(s) from ` +
            `${droppedPapers.size} paper(s) with unknown year\n`
        );
      }
    }
  }
  rows.sort((a, b) => b.similarity - a.similarity);
  rows = rows.slice(0, k);

  return rows.map(({ p, section, similarity }) => ({
    id: p.id,
    paperId: p.paperId,
    section,
    section_name: p.sectionName,
    claim: p.primaryClaimType ?? null,
    hedge: p.hedgeLevel ?? null,
    voice: p.voice ?? null,
    has_we: !!p.hasActiveWe,
    text_excerpt: String(p.text).substring(0, 600),
    full_text: p.text,
    similarity,
  }));
}

async function localNextParagraph(store, meta) {
  if (!opts.query) throw new Error("--query required");
  const k = parseInt(opts.k || "3", 10);
  const vec = await embedQuery(opts.query, meta);

  // index by paper + section + position for O(1) "next" lookup
  const SEP = "\x00";
  const byKey = new Map();
  for (const p of store.paragraphs) {
    byKey.set(`${p.paperId}${SEP}${p.sectionName}${SEP}${p.positionInSection}`, p);
  }

  // Mirror the SQL: take the top-k closest first, then keep those that have a
  // following paragraph, order by prior similarity desc, limit k.
  const scored = store.paragraphs.map((p) => ({ p, sim: cosine(vec, p.embedding || []) }));
  scored.sort((a, b) => b.sim - a.sim);
  const topK = scored.slice(0, k);

  const joined = [];
  for (const { p, sim } of topK) {
    const np = byKey.get(`${p.paperId}${SEP}${p.sectionName}${SEP}${p.positionInSection + 1}`);
    if (!np) continue;
    joined.push({
      prior_similarity: sim,
      prior_id: p.id,
      next_id: np.id,
      next_claim: np.primaryClaimType ?? null,
      next_hedge: np.hedgeLevel ?? null,
      next_voice: np.voice ?? null,
      next_excerpt: String(np.text).substring(0, 600),
      next_full_text: np.text,
    });
  }
  joined.sort((a, b) => b.prior_similarity - a.prior_similarity);
  return joined.slice(0, k);
}

function localVocabulary(store) {
  const category = opts.category;
  if (!category) throw new Error("--category required (verb|noun|adj|...)");
  const ctx = opts.context ? String(opts.context).toLowerCase() : null;
  const minPapers = parseInt(opts["min-papers"] || "3", 10);

  const SEP = "\x00";
  const groups = new Map();
  for (const v of store.vocabulary) {
    if (v.category !== category) continue;
    if (ctx && !String(v.context || "").toLowerCase().includes(ctx)) continue;
    const key = `${v.term}${SEP}${v.category}${SEP}${v.context || ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { term: v.term, category: v.category, context: v.context ?? null, papers: new Set(), total: 0 };
      groups.set(key, g);
    }
    g.papers.add(v.paperId);
    g.total += 1;
  }

  let rows = [...groups.values()].filter((g) => g.papers.size >= minPapers);
  rows.sort((a, b) => b.papers.size - a.papers.size || b.total - a.total);
  rows = rows.slice(0, 50);

  // paper_count / total_occurrences are strings to mirror pg bigint output.
  return rows.map((g) => ({
    term: g.term,
    category: g.category,
    context: g.context,
    paper_count: String(g.papers.size),
    total_occurrences: String(g.total),
  }));
}

function localAitells(store) {
  const threshold = parseInt(opts.threshold || "10", 10);
  const groups = new Map();
  for (const a of store.aitells) {
    if (!a.phrase) continue;
    let g = groups.get(a.phrase);
    if (!g) {
      g = { phrase: a.phrase, papers: new Set(), total: 0 };
      groups.set(a.phrase, g);
    }
    g.papers.add(a.paperId);
    g.total += 1;
  }
  let rows = [...groups.values()].filter((g) => g.papers.size <= threshold);
  rows.sort(
    (a, b) => b.total - a.total || (a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : 0)
  );
  rows = rows.slice(0, 100);
  return rows.map((g) => ({
    phrase: g.phrase,
    paper_count: String(g.papers.size),
    total_occurrences: String(g.total),
  }));
}

function pct1(n, sum) {
  if (!sum) return "0.0";
  return (Math.round((n * 100) / sum * 10) / 10).toFixed(1);
}

function localSectionDistribution(store) {
  const section = opts.section;
  if (!section) throw new Error("--section required");
  const counts = new Map();
  let sum = 0;
  for (const p of store.paragraphs) {
    if (normalizeSection(p.sectionName) !== section) continue;
    if (p.primaryClaimType == null) continue;
    counts.set(p.primaryClaimType, (counts.get(p.primaryClaimType) || 0) + 1);
    sum += 1;
  }
  const rows = [...counts.entries()].map(([claim, n]) => ({ claim, n }));
  rows.sort((a, b) => b.n - a.n);
  return rows.map((r) => ({ claim: r.claim, n: String(r.n), pct: pct1(r.n, sum) }));
}

function localMoveTransitions(store) {
  const from = opts.from;
  if (!from) throw new Error("--from required (move_type)");
  const byPara = new Map();
  for (const m of store.moves) {
    if (!byPara.has(m.paragraphId)) byPara.set(m.paragraphId, []);
    byPara.get(m.paragraphId).push(m);
  }
  const nextCounts = new Map();
  let sum = 0;
  for (const moves of byPara.values()) {
    moves.sort((a, b) => a.positionInParagraph - b.positionInParagraph);
    for (let i = 0; i < moves.length - 1; i++) {
      if (moves[i].moveType !== from) continue;
      const next = moves[i + 1].moveType;
      if (next == null) continue;
      nextCounts.set(next, (nextCounts.get(next) || 0) + 1);
      sum += 1;
    }
  }
  const rows = [...nextCounts.entries()].map(([next, n]) => ({ next, n }));
  rows.sort((a, b) => b.n - a.n);
  return rows.map((r) => ({ next: r.next, n: String(r.n), pct: pct1(r.n, sum) }));
}

// ===========================================================================
// SUPABASE BACKEND (opt-in; SQL logic preserved from v1)
// ===========================================================================
const SECTION_NORMALIZER = `
  CASE
    WHEN lower(s.name) ~ '(introduction|background)' THEN 'Introduction'
    WHEN lower(s.name) ~ '(method|experiment|materials)' AND lower(s.name) NOT LIKE '%result%' THEN 'Methods'
    WHEN lower(s.name) ~ '(result.*discussion|discussion.*result)' THEN 'Results+Discussion'
    WHEN lower(s.name) ~ 'result' THEN 'Results'
    WHEN lower(s.name) ~ 'discussion' THEN 'Discussion'
    WHEN lower(s.name) ~ '(conclusion|summary|outlook)' THEN 'Conclusion'
    ELSE 'Other'
  END
`;

// Load the single-row CorpusMeta into the shape embedQuery expects
// ({ embedding: { provider, model, dimensions } }). Returns null (with a
// warning) if the table is absent (old schema) so retrieval still works.
async function loadSupabaseMeta(client) {
  try {
    const r = await client.query(
      `SELECT provider, model, dimensions FROM "CorpusMeta" WHERE id = 1`
    );
    if (!r.rows.length) return null;
    const m = r.rows[0];
    return {
      embedding: {
        provider: m.provider,
        model: m.model,
        dimensions: m.dimensions == null ? null : Number(m.dimensions),
      },
    };
  } catch (e) {
    if (e && e.code === "42P01") {
      console.error(
        "WARN: CorpusMeta table not found (old schema) — skipping provider/dimension guard. " +
          "Re-apply scripts/setup/corpus-schema.sql to enable it."
      );
      return null;
    }
    throw e;
  }
}

async function runSupabase() {
  // Profiles, figure-set RAG, and methodology RAG are local-only features — no
  // supabase analogue.
  if (LOCAL_ONLY_CMDS.has(cmd) || FIGURE_CMDS.has(cmd) || METHOD_CMDS.has(cmd)) {
    console.error(
      `${cmd} is a local-only feature (rag.mode='local'). ` +
        "It has no supabase backend — build a local corpus and query it there."
    );
    process.exit(1);
  }

  const sb = config.rag.supabase || {};
  const connectionString =
    sb.direct_url || sb.database_url || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: supabase mode requires rag.supabase.direct_url or rag.supabase.database_url in config.");
    console.error("  Config: ~/.claude/paper-autopilot-open/config.json");
    console.error("  Or switch rag.mode to 'local' (default, no external DB).");
    process.exit(1);
  }

  // Dimension policy: CorpusMeta is authoritative — there is NO fixed-3072
  // pre-check here. The schema DEFAULT is vector(3072), but corpora created on
  // the old vector(1024) schema must keep working: when a CorpusMeta row exists,
  // embedQuery dies on any config/meta dims mismatch (whatever the value); when
  // it does not (legacy schema), we proceed and wrap pgvector dimension errors
  // with config guidance (see the catch below).

  // paperGroup is not stored in the supabase schema — --group cannot filter here.
  if (opts.group) {
    console.error(
      "WARN: --group is ignored in supabase mode (paperGroup is not stored in the supabase schema)."
    );
  }
  // paper year is not stored in the supabase schema — --since cannot filter here.
  if (opts.since) {
    console.error(
      "WARN: --since is ignored in supabase mode (paper year is not stored in the supabase schema)."
    );
  }

  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const corpusMeta = await loadSupabaseMeta(client);
    if (!corpusMeta) {
      console.error(
        "WARN: cannot verify embedding dimensions (no CorpusMeta) — if a vector " +
          "dimension error follows, set config embedding.dimensions to the value " +
          "the corpus was originally ingested with (구 스키마는 1024였을 수 있음)."
      );
    }
    switch (cmd) {
      case "paragraphs":
        return await sbParagraphs(client, corpusMeta);
      case "next-paragraph":
        return await sbNextParagraph(client, corpusMeta);
      case "vocabulary":
        return await sbVocabulary(client);
      case "aitells":
        return await sbAitells(client);
      case "section-distribution":
        return await sbSectionDistribution(client);
      case "move-transitions":
        return await sbMoveTransitions(client);
    }
  } catch (e) {
    // pgvector dimension mismatch (legacy schema without CorpusMeta, or manual
    // schema edits) — rewrap with actionable config guidance.
    if (e && /different vector dimensions|expected \d+ dimensions/i.test(e.message || "")) {
      throw new Error(
        e.message +
          "\n  → config의 embedding.dimensions를 corpus 생성 당시 값으로 맞추세요 " +
          "(차원 변경은 corpus 전체 재적재가 필요합니다)."
      );
    }
    throw e;
  } finally {
    await client.end();
  }
}

async function sbParagraphs(client, corpusMeta) {
  const query = opts.query;
  const section = opts.section;
  const claim = opts.claim;
  const k = parseInt(opts.k || "5", 10);
  if (!query) throw new Error("--query required");

  const vec = await embedQuery(query, corpusMeta);
  const vecLit = "[" + vec.join(",") + "]";

  const where = [];
  const params = [vecLit, k];
  if (section) {
    params.push(section);
    where.push(`${SECTION_NORMALIZER} = $${params.length}`);
  }
  if (claim) {
    params.push(claim);
    where.push(`p."primaryClaimType" = $${params.length}`);
  }
  const whereClause = where.length ? "AND " + where.join(" AND ") : "";

  const r = await client.query(
    `
    SELECT p.id, p."paperId",
           ${SECTION_NORMALIZER} AS section,
           s.name AS section_name,
           p."primaryClaimType" AS claim,
           p."hedgeLevel" AS hedge,
           p.voice,
           p."hasActiveWe" AS has_we,
           substring(p.text, 1, 600) AS text_excerpt,
           p.text AS full_text,
           1 - (p.embedding <=> $1::vector) AS similarity
    FROM "CorpusParagraph" p
    JOIN "CorpusSection" s ON s.id = p."sectionId"
    WHERE p.embedding IS NOT NULL ${whereClause}
    ORDER BY p.embedding <=> $1::vector
    LIMIT $2
  `,
    params
  );
  return r.rows;
}

async function sbNextParagraph(client, corpusMeta) {
  const query = opts.query;
  const k = parseInt(opts.k || "3", 10);
  if (!query) throw new Error("--query required");

  const vec = await embedQuery(query, corpusMeta);
  const vecLit = "[" + vec.join(",") + "]";

  const r = await client.query(
    `
    WITH closest AS (
      SELECT p.id, p."paperId", p."sectionId", p."positionInSection",
             1 - (p.embedding <=> $1::vector) AS sim
      FROM "CorpusParagraph" p
      WHERE p.embedding IS NOT NULL
      ORDER BY p.embedding <=> $1::vector
      LIMIT $2
    )
    SELECT
      c.sim AS prior_similarity,
      c.id AS prior_id,
      np.id AS next_id,
      np."primaryClaimType" AS next_claim,
      np."hedgeLevel" AS next_hedge,
      np.voice AS next_voice,
      substring(np.text, 1, 600) AS next_excerpt,
      np.text AS next_full_text
    FROM closest c
    JOIN "CorpusParagraph" np
      ON np."paperId" = c."paperId"
     AND np."sectionId" = c."sectionId"
     AND np."positionInSection" = c."positionInSection" + 1
    ORDER BY c.sim DESC
    LIMIT $2
  `,
    [vecLit, k]
  );
  return r.rows;
}

async function sbVocabulary(client) {
  const category = opts.category;
  const ctx = opts.context;
  const minPapers = parseInt(opts["min-papers"] || "3", 10);
  if (!category) throw new Error("--category required (verb|noun|adj|...)");

  const params = [category, minPapers];
  let ctxFilter = "";
  if (ctx) {
    params.push("%" + ctx + "%");
    ctxFilter = `AND v.context ILIKE $${params.length}`;
  }

  // Column is "phrase" in the schema; aliased to term to preserve output shape.
  const r = await client.query(
    `
    SELECT v.phrase AS term, v.category, v.context,
           COUNT(DISTINCT v."paperId") AS paper_count,
           COUNT(*) AS total_occurrences
    FROM "CorpusVocabulary" v
    WHERE v.category = $1 ${ctxFilter}
    GROUP BY v.phrase, v.category, v.context
    HAVING COUNT(DISTINCT v."paperId") >= $2
    ORDER BY paper_count DESC, total_occurrences DESC
    LIMIT 50
  `,
    params
  );
  return r.rows;
}

async function sbAitells(client) {
  const threshold = parseInt(opts.threshold || "10", 10);
  const r = await client.query(
    `
    SELECT phrase,
           COUNT(DISTINCT "paperId") AS paper_count,
           COUNT(*) AS total_occurrences
    FROM "CorpusAiTell"
    GROUP BY phrase
    HAVING COUNT(DISTINCT "paperId") <= $1
    ORDER BY total_occurrences DESC, phrase
    LIMIT 100
  `,
    [threshold]
  );
  return r.rows;
}

async function sbSectionDistribution(client) {
  const section = opts.section;
  if (!section) throw new Error("--section required");

  const r = await client.query(
    `
    SELECT p."primaryClaimType" AS claim,
           COUNT(*) AS n,
           ROUND(COUNT(*)::numeric*100/SUM(COUNT(*)) OVER (), 1) AS pct
    FROM "CorpusParagraph" p
    JOIN "CorpusSection" s ON s.id = p."sectionId"
    WHERE ${SECTION_NORMALIZER} = $1 AND p."primaryClaimType" IS NOT NULL
    GROUP BY 1
    ORDER BY n DESC
  `,
    [section]
  );
  return r.rows;
}

async function sbMoveTransitions(client) {
  const move = opts.from;
  if (!move) throw new Error("--from required (move_type)");

  const r = await client.query(
    `
    WITH ordered AS (
      SELECT m."moveType" AS curr,
             LEAD(m."moveType") OVER (PARTITION BY m."paragraphId" ORDER BY m."positionInParagraph") AS next
      FROM "CorpusMove" m
    )
    SELECT next, COUNT(*) AS n,
           ROUND(COUNT(*)::numeric*100/SUM(COUNT(*)) OVER (), 1) AS pct
    FROM ordered
    WHERE curr = $1 AND next IS NOT NULL
    GROUP BY next
    ORDER BY n DESC
  `,
    [move]
  );
  return r.rows;
}

// ===========================================================================
// DISPATCH
// ===========================================================================
async function main() {
  const mode = config.rag.mode;

  if (mode === "disabled") {
    console.error("RAG is disabled (rag.mode = 'disabled').");
    console.error(
      "  Corpus retrieval is unavailable. To enable it, set rag.mode to 'local' " +
        "(default, no external DB) or 'supabase' in " +
        "~/.claude/paper-autopilot-open/config.json, then build a corpus with " +
        "scripts/ingest/build-corpus.mjs."
    );
    process.exit(2);
  }

  let result;
  if (mode === "local") {
    result = await runLocal();
  } else if (mode === "supabase") {
    result = await runSupabase();
  } else {
    console.error(
      `ERROR: unknown rag.mode '${mode}'. Expected one of: local | supabase | disabled.`
    );
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("ERROR: " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
