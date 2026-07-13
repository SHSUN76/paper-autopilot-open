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
 *   node retrieve.mjs paragraphs --query "We propose..." --section Introduction --claim contribution --k 5
 *   node retrieve.mjs next-paragraph --query "Figure 3 shows cycling..." --k 3
 *   node retrieve.mjs vocabulary --category verb --context "DFT cycling" --min-papers 5
 *   node retrieve.mjs aitells --threshold 5
 *   node retrieve.mjs section-distribution --section Introduction
 *   node retrieve.mjs move-transitions --from present_evidence
 *
 * Dev / test bypass for the embedding call (paragraphs, next-paragraph):
 *   --query-vector '[0.1, 0.2, ...]'   supply the query vector directly (skips embed + provider check)
 *   embedding.provider = "stub"        deterministic offline embedding (no network)
 *
 * Output: JSON to stdout. Errors to stderr.
 */

import { loadConfig, providerApiKey } from "./ingest/config.mjs";
import { embedOne } from "./ingest/embedding.mjs";
import {
  normalizeSection,
  cosine,
  loadStore,
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
];

function usageExit() {
  console.error(
    "Usage: node retrieve.mjs <" + VALID_CMDS.join("|") + "> [opts]"
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
  const dims = (corpusMeta && corpusMeta.embedding && corpusMeta.embedding.dimensions) || config.embedding.dimensions;
  const apiKey = providerApiKey(config, provider);
  return embedOne(text, { provider, dimensions: dims, apiKey });
}

// ===========================================================================
// LOCAL BACKEND
// ===========================================================================
async function runLocal() {
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
  }
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
    if (opts.group !== "own" && opts.group !== "field") {
      throw new Error("--group must be 'own' or 'field'");
    }
    // paperGroup lives on papers.json, not per-paragraph — map paperId -> group.
    const groupByPaper = new Map(store.papers.map((p) => [p.paperId, p.paperGroup]));
    rows = rows.filter((r) => groupByPaper.get(r.p.paperId) === opts.group);
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
  const sb = config.rag.supabase || {};
  const connectionString =
    sb.direct_url || sb.database_url || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: supabase mode requires rag.supabase.direct_url or rag.supabase.database_url in config.");
    console.error("  Config: ~/.claude/paper-autopilot-open/config.json");
    console.error("  Or switch rag.mode to 'local' (default, no external DB).");
    process.exit(1);
  }

  // The supabase schema fixes the embedding column to vector(1024).
  if (config.embedding.dimensions !== 1024) {
    console.error(
      `ERROR: supabase backend is fixed to vector(1024) but config.embedding.dimensions=${config.embedding.dimensions}. ` +
        "Set embedding.dimensions to 1024, or use rag.mode='local'."
    );
    process.exit(1);
  }

  // paperGroup is not stored in the supabase schema — --group cannot filter here.
  if (opts.group) {
    console.error(
      "WARN: --group is ignored in supabase mode (paperGroup is not stored in the supabase schema)."
    );
  }

  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const corpusMeta = await loadSupabaseMeta(client);
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
