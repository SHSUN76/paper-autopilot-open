#!/usr/bin/env node
/**
 * build-corpus.mjs — build / update the local vector store from
 * paper-corpus-mining output (paragraph_reports/*.json).
 *
 * Usage:
 *   node scripts/ingest/build-corpus.mjs --input <dir> --group own|field|review [--force]
 *
 *   --input <dir>   directory of *.json reports (paragraph_extraction.md schema,
 *                   optionally combined with lexicon / ai_tell_candidates).
 *                   `<paper_id>.figures.json` files in the same dir are auto-
 *                   detected and ingested into the figure-set RAG store.
 *   --group         own | field | review  (own = your own papers, field = domain
 *                   papers, review = domain review papers — knowledge only)
 *   --force         re-embed and overwrite papers already in the store
 *                   (default: skip papers already present — incremental)
 *
 * Progress -> stderr. Summary JSON -> stdout:
 *   { papers_added, papers_skipped, paragraphs_embedded, moves_added,
 *     vocabulary_added, aitells_added, figures_added, arcs_added,
 *     figures_skipped, api_calls, estimated_cost_usd,
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
  loadFigures,
  loadFigureArcs,
  writeStore,
  writeFigureStore,
  parseReport,
  parseFigureReport,
  figureEmbeddingText,
  normGroup,
  PAPER_GROUPS,
  STORE_VERSION,
} from "./store.mjs";
import { writeProfiles } from "./profiles.mjs";

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
  const group = PAPER_GROUPS.includes(opts.group) ? opts.group : null;
  if (!group) die("--group own|field|review required");
  const force = !!opts.force;

  // Provider DEFAULT task type for document ingestion. gemini benefits from
  // taskType (RETRIEVAL_DOCUMENT on ingest / RETRIEVAL_QUERY on queries);
  // openai/stub have no such concept -> null. The EFFECTIVE task type used for
  // this run's embeddings AND recorded in meta (corpusTaskType) is resolved
  // against any existing corpus meta — see the task-type policy block below.
  const docTaskType = provider === "gemini" ? "RETRIEVAL_DOCUMENT" : null;

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
  // Figure reports are auto-detected by the `.figures.json` suffix; everything
  // else ending in `.json` is a paragraph report.
  const allJson = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort();
  const figureFiles = allJson.filter((f) => f.toLowerCase().endsWith(".figures.json"));
  const files = allJson.filter((f) => !f.toLowerCase().endsWith(".figures.json"));
  if (allJson.length === 0) die(`no *.json reports found in ${inputDir}`);

  const warnings = [];
  const toEmbed = []; // paragraph objects (by reference) needing embedding
  const summary = {
    papers_added: 0,
    papers_skipped: 0,
    paragraphs_embedded: 0,
    moves_added: 0,
    vocabulary_added: 0,
    aitells_added: 0,
    figures_added: 0,
    arcs_added: 0,
    figures_skipped: 0,
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

  // ---- resolve the EFFECTIVE corpus task type ------------------------------
  // Task-type policy:
  //   (a) fresh corpus (no existing meta)   -> record the provider default
  //       (RETRIEVAL_DOCUMENT for gemini; null for openai/stub).
  //   (b) existing corpus WITH task_type    -> keep using the recorded value.
  //   (c) existing corpus WITHOUT task_type -> LEGACY: its stored vectors were
  //       embedded with no taskType. Preserve the absent state (null) AND embed
  //       this run's additions WITHOUT taskType so stored/query embeddings stay
  //       consistent. Never silently stamp RETRIEVAL_DOCUMENT here — retrieve.mjs
  //       would then start querying with RETRIEVAL_QUERY against task-type-less
  //       vectors (mismatch), and incremental builds would mix vector spaces.
  //       A legacy corpus upgrades ONLY on a full re-embed: --force with input
  //       covering every stored paper AND every stored figure-paper, i.e. no
  //       legacy vector survives this run.
  let corpusTaskType;
  if (!existingMeta) {
    corpusTaskType = docTaskType; // (a) fresh corpus
  } else if (existingMeta.embedding && existingMeta.embedding.task_type) {
    corpusTaskType = existingMeta.embedding.task_type; // (b) keep recorded value
  } else {
    corpusTaskType = null; // (c) legacy — preserve absent
    if (force && docTaskType) {
      // full re-embed check: all pre-existing papers purged above…
      const paragraphPapersCovered = papers.length === 0;
      // …and every stored figure-paper re-appears in this run's figure files.
      let figurePapersCovered = true;
      const existingFiguresForCheck = loadFigures(dir);
      if (existingFiguresForCheck.length) {
        const figIdsInRun = new Set();
        for (const f of figureFiles) {
          try {
            const j = JSON.parse(fs.readFileSync(path.join(inputDir, f), "utf8"));
            const id = j.paper_id || j.paperId;
            if (id) figIdsInRun.add(id);
          } catch {
            /* parse errors are reported by the figure ingest loop below */
          }
        }
        figurePapersCovered = existingFiguresForCheck.every((fg) => figIdsInRun.has(fg.paperId));
      }
      if (paragraphPapersCovered && figurePapersCovered) {
        corpusTaskType = docTaskType;
        process.stderr.write(
          `legacy corpus fully re-embedded — recording task_type=${docTaskType}\n`
        );
      }
    }
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
      taskType: corpusTaskType,
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

  const groupCounts = { own: 0, field: 0, review: 0 };
  for (const p of mergedPapers) groupCounts[normGroup(p.paperGroup)] += 1;

  const now = new Date().toISOString();
  const meta = {
    version: STORE_VERSION,
    created_at: existingMeta && existingMeta.created_at ? existingMeta.created_at : now,
    updated_at: now,
    embedding: { provider, model: providerModel(provider), dimensions, task_type: corpusTaskType },
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

  // ---- recompute group profiles every build (even with no new papers) -----
  const { style, field } = writeProfiles(dir, {
    papers: mergedPapers,
    paragraphs: mergedParagraphs,
    moves: mergedMoves,
    vocabulary: mergedVocab,
  });
  summary.style_profile_paragraphs = style.paragraphs || 0;
  summary.field_profile_paragraphs = field.paragraphs || 0;
  process.stderr.write(
    `profiles written: style-profile.json (own=${style.paragraphs || 0} paras), ` +
      `field-profile.json (field=${field.paragraphs || 0} paras)\n`
  );

  // ---- figure-set RAG ingest (optional) -----------------------------------
  // Only touch figure artifacts when *.figures.json files are present this run;
  // paragraph-only builds leave any existing figure store untouched.
  if (figureFiles.length > 0) {
    let figures = loadFigures(dir);
    let arcs = loadFigureArcs(dir);
    const existingFigurePaperIds = new Set(figures.map((f) => f.paperId));

    // paperGroup / journal / year resolution from the merged paper set.
    const groupByPaper = new Map(mergedPapers.map((p) => [p.paperId, normGroup(p.paperGroup)]));
    const metaByPaper = new Map(
      mergedPapers.map((p) => [p.paperId, { journal: p.journal, year: p.year }])
    );

    const newFigures = [];
    const newFigureTexts = []; // parallel to newFigures (kept aligned across skips)
    const newArcs = [];
    const figRebuildIds = new Set();
    const seenFigThisRun = new Set();

    for (const file of figureFiles) {
      let report;
      try {
        report = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf8"));
      } catch (e) {
        warnings.push(`${file}: json parse failed: ${e.message}`);
        continue;
      }
      const rawId = report.paper_id || report.paperId;
      // paperGroup comes from the corresponding paragraph report's paper when
      // that paper exists in the store; otherwise the --group value is used.
      const paperGroup = (rawId && groupByPaper.get(rawId)) || group;
      const parsed = parseFigureReport(report, { paperGroup });
      if (parsed.error) {
        warnings.push(`${file}: ${parsed.error}`);
        continue;
      }
      const { paperId } = parsed;

      if (seenFigThisRun.has(paperId)) {
        warnings.push(
          `${file}: duplicate figure paperId '${paperId}' already ingested in this run — skipping`
        );
        process.stderr.write(`skip figures (duplicate in run): ${paperId}\n`);
        continue;
      }
      if (existingFigurePaperIds.has(paperId)) {
        if (!force) {
          summary.figures_skipped += parsed.figures.length;
          process.stderr.write(`skip figures (exists): ${paperId}\n`);
          continue;
        }
        figRebuildIds.add(paperId); // purge old figure rows below
      }

      for (const w of parsed.warnings) warnings.push(w);
      const bib = metaByPaper.get(paperId) || {};
      for (const fig of parsed.figures) {
        newFigures.push(fig);
        newFigureTexts.push(figureEmbeddingText(fig, { journal: bib.journal, year: bib.year }));
      }
      newArcs.push(parsed.arc);
      seenFigThisRun.add(paperId);
      process.stderr.write(`parsed figures: ${paperId} (${parsed.figures.length} figures)\n`);
    }

    // purge rebuilt papers (force) from existing arrays
    if (figRebuildIds.size) {
      figures = figures.filter((f) => !figRebuildIds.has(f.paperId));
      arcs = arcs.filter((a) => !figRebuildIds.has(a.paperId));
    }

    // embed new figures
    if (newFigures.length) {
      process.stderr.write(
        `embedding ${newFigures.length} figures via ${provider} (${dimensions}d)…\n`
      );
      const apiKey = providerApiKey(config, provider);
      const texts = newFigureTexts.map((t) => String(t).slice(0, 8000));
      const { vectors, apiCalls } = await embedMany(texts, {
        provider,
        dimensions,
        apiKey,
        batchSize: 100,
        taskType: corpusTaskType,
        onProgress: (done, total) => process.stderr.write(`  embedded figs ${done}/${total}\r`),
      });
      process.stderr.write("\n");
      for (let i = 0; i < newFigures.length; i++) newFigures[i].embedding = vectors[i];
      summary.api_calls += apiCalls;
      if (provider === "openai") {
        const totalChars = texts.reduce((s, t) => s + t.length, 0);
        const tokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
        summary.estimated_cost_usd = +(
          summary.estimated_cost_usd +
          (tokens / 1e6) * OPENAI_USD_PER_MTOK
        ).toFixed(6);
      }
    }

    const mergedFigures = figures.concat(newFigures);
    const mergedArcs = arcs.concat(newArcs);
    writeFigureStore(dir, { figures: mergedFigures, figureArcs: mergedArcs });
    summary.figures_added = newFigures.length;
    summary.arcs_added = newArcs.length;
    process.stderr.write(
      `figure store written: ${mergedFigures.length} figures / ${mergedArcs.length} arcs ` +
        `(added ${newFigures.length} figs, ${newArcs.length} arcs)\n`
    );
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("ERROR: " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
