#!/usr/bin/env node
/**
 * build-corpus.mjs — build / update the local vector store from
 * paper-corpus-mining output (paragraph_reports/*.json).
 *
 * Usage:
 *   node scripts/ingest/build-corpus.mjs --input <dir> --group own|field [--force]
 *
 *   --input <dir>   directory of *.json reports (paragraph_extraction.md schema,
 *                   optionally combined with lexicon / ai_tell_candidates)
 *   --group         own | field  (own = your own papers, field = domain papers)
 *   --force         re-embed and overwrite papers already in the store
 *                   (default: skip papers already present — incremental)
 *
 * Progress -> stderr. Summary JSON -> stdout:
 *   { papers_added, papers_skipped, paragraphs_embedded, moves_added,
 *     vocabulary_added, aitells_added, api_calls, estimated_cost_usd,
 *     provider, dimensions, warnings }
 *
 * Cost: openai text-embedding-3-large ~= $0.13 / 1M tokens.
 *       gemini has a free tier (rate-limited) -> estimated_cost_usd = 0.
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig, providerApiKey } from "./config.mjs";
import { embedMany, providerModel } from "./embedding.mjs";
import {
  loadMeta,
  loadPapers,
  loadParagraphs,
  loadMoves,
  loadVocabulary,
  loadAitells,
  writeStore,
  parseReport,
  STORE_VERSION,
} from "./store.mjs";

const OPENAI_USD_PER_MTOK = 0.13; // text-embedding-3-large
const CHARS_PER_TOKEN = 4; // rough estimate

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      o[key] = val;
    }
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));

function die(msg, code = 1) {
  console.error("ERROR: " + msg);
  process.exit(code);
}

async function main() {
  const config = loadConfig();
  const dir = config.rag.local_corpus_dir;
  const provider = config.embedding.provider;
  const dimensions = config.embedding.dimensions;

  const inputDir = opts.input;
  if (!inputDir) die("--input <dir> required (directory of paragraph_reports/*.json)");
  if (!fs.existsSync(inputDir)) die(`--input dir not found: ${inputDir}`);
  const group = opts.group === "field" ? "field" : opts.group === "own" ? "own" : null;
  if (!group) die("--group own|field required");
  const force = !!opts.force;

  // ---- provider/dimension consistency with any existing store -------------
  const existingMeta = loadMeta(dir);
  if (existingMeta && existingMeta.embedding) {
    if (existingMeta.embedding.provider !== provider) {
      die(
        `existing corpus was built with provider '${existingMeta.embedding.provider}' but ` +
          `config.embedding.provider='${provider}'. Refusing to mix embeddings. ` +
          "Use a fresh corpus dir or align config."
      );
    }
    if (existingMeta.embedding.dimensions !== dimensions) {
      die(
        `existing corpus dimensions=${existingMeta.embedding.dimensions} but ` +
          `config.embedding.dimensions=${dimensions}. Refusing to mix.`
      );
    }
  }

  // ---- load existing store into memory ------------------------------------
  let papers = loadPapers(dir);
  let paragraphs = loadParagraphs(dir);
  let moves = loadMoves(dir);
  let vocabulary = loadVocabulary(dir);
  let aitells = loadAitells(dir);
  const existingPaperIds = new Set(papers.map((p) => p.paperId));

  // ---- read input reports -------------------------------------------------
  const files = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort();
  if (files.length === 0) die(`no *.json reports found in ${inputDir}`);

  const warnings = [];
  const toEmbed = []; // paragraph objects (by reference) needing embedding
  const summary = {
    papers_added: 0,
    papers_skipped: 0,
    paragraphs_embedded: 0,
    moves_added: 0,
    vocabulary_added: 0,
    aitells_added: 0,
    api_calls: 0,
    estimated_cost_usd: 0,
    provider,
    dimensions,
    warnings,
  };

  const newPapers = [];
  const newParagraphs = [];
  const newMoves = [];
  const newVocab = [];
  const newAitells = [];
  const rebuildIds = new Set(); // paperIds to purge (force re-ingest)
  const seenThisRun = new Set(); // paperIds already ingested during this run

  for (const file of files) {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf8"));
    } catch (e) {
      warnings.push(`${file}: json parse failed: ${e.message}`);
      continue;
    }
    const parsed = parseReport(report, { group });
    if (parsed.error) {
      warnings.push(`${file}: ${parsed.error}`);
      continue;
    }
    const { paperId } = parsed;

    // Guard against two files in the SAME run sharing a paperId — keep the
    // first, skip the rest (otherwise duplicate rows would be written).
    if (seenThisRun.has(paperId)) {
      warnings.push(
        `${file}: duplicate paperId '${paperId}' already ingested in this run — skipping (first occurrence kept)`
      );
      process.stderr.write(`skip (duplicate in run): ${paperId}\n`);
      continue;
    }

    if (existingPaperIds.has(paperId)) {
      if (!force) {
        summary.papers_skipped += 1;
        process.stderr.write(`skip (exists): ${paperId}\n`);
        continue;
      }
      rebuildIds.add(paperId); // purge old rows below
    }

    for (const w of parsed.warnings) warnings.push(w);
    newPapers.push(parsed.paper);
    for (const p of parsed.paragraphs) {
      newParagraphs.push(p);
      if (p.text && p.text.length > 0) toEmbed.push(p);
    }
    for (const m of parsed.moves) newMoves.push(m);
    for (const v of parsed.vocabulary) newVocab.push(v);
    for (const a of parsed.aitells) newAitells.push(a);
    seenThisRun.add(paperId);
    summary.papers_added += 1;
    process.stderr.write(`parsed: ${paperId} (${parsed.paragraphs.length} paragraphs)\n`);
  }

  if (newPapers.length === 0) {
    process.stderr.write("nothing to add.\n");
    // still (re)write meta counts consistently
  }

  // ---- purge rebuilt papers from existing arrays --------------------------
  if (rebuildIds.size) {
    papers = papers.filter((p) => !rebuildIds.has(p.paperId));
    paragraphs = paragraphs.filter((p) => !rebuildIds.has(p.paperId));
    moves = moves.filter((m) => !rebuildIds.has(m.paperId));
    vocabulary = vocabulary.filter((v) => !rebuildIds.has(v.paperId));
    aitells = aitells.filter((a) => !rebuildIds.has(a.paperId));
  }

  // ---- embed new paragraphs ----------------------------------------------
  if (toEmbed.length) {
    process.stderr.write(`embedding ${toEmbed.length} paragraphs via ${provider} (${dimensions}d)…\n`);
    const apiKey = providerApiKey(config, provider);
    const texts = toEmbed.map((p) => String(p.text).slice(0, 8000));
    const { vectors, apiCalls } = await embedMany(texts, {
      provider,
      dimensions,
      apiKey,
      batchSize: 100,
      onProgress: (done, total) => process.stderr.write(`  embedded ${done}/${total}\r`),
    });
    process.stderr.write("\n");
    for (let i = 0; i < toEmbed.length; i++) toEmbed[i].embedding = vectors[i];
    summary.api_calls = apiCalls;
    summary.paragraphs_embedded = toEmbed.length;

    const totalChars = texts.reduce((s, t) => s + t.length, 0);
    const tokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
    summary.estimated_cost_usd =
      provider === "openai" ? +((tokens / 1e6) * OPENAI_USD_PER_MTOK).toFixed(6) : 0;
  }

  // ---- merge & write ------------------------------------------------------
  const mergedPapers = papers.concat(newPapers);
  const mergedParagraphs = paragraphs.concat(newParagraphs);
  const mergedMoves = moves.concat(newMoves);
  const mergedVocab = vocabulary.concat(newVocab);
  const mergedAitells = aitells.concat(newAitells);

  summary.moves_added = newMoves.length;
  summary.vocabulary_added = newVocab.length;
  summary.aitells_added = newAitells.length;

  const groupCounts = { own: 0, field: 0 };
  for (const p of mergedPapers) groupCounts[p.paperGroup === "field" ? "field" : "own"] += 1;

  const now = new Date().toISOString();
  const meta = {
    version: STORE_VERSION,
    created_at: existingMeta && existingMeta.created_at ? existingMeta.created_at : now,
    updated_at: now,
    embedding: { provider, model: providerModel(provider), dimensions },
    counts: {
      papers: mergedPapers.length,
      paragraphs: mergedParagraphs.length,
      moves: mergedMoves.length,
      vocabulary: mergedVocab.length,
      aitells: mergedAitells.length,
    },
    paper_groups: groupCounts,
  };

  writeStore(dir, {
    meta,
    papers: mergedPapers,
    paragraphs: mergedParagraphs,
    moves: mergedMoves,
    vocabulary: mergedVocab,
    aitells: mergedAitells,
  });

  process.stderr.write(`corpus written to ${dir}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("ERROR: " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
