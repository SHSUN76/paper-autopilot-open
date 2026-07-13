#!/usr/bin/env node
/**
 * ingest-supabase.mjs — optional Supabase path (mirrors the local builder).
 *
 * Loads paper-corpus-mining output (paragraph_reports/*.json) into a Supabase
 * project whose schema was created by scripts/setup/corpus-schema.sql, then
 * generates pgvector embeddings. Fully config-driven — no external .env files.
 *
 * Consolidates the logic of the original 01/03/04 corpus_analysis scripts:
 *   - upserts a minimal CorpusPaper row (FK target)
 *   - creates CorpusSection rows from distinct section names
 *   - inserts CorpusParagraph + CorpusMove
 *   - inserts CorpusVocabulary + CorpusAiTell when the report carries them
 *   - embeds paragraphs (config provider) in batches of 100
 *
 * Usage:
 *   node scripts/ingest/ingest-supabase.mjs --input <dir> --group own|field [--force]
 *
 * Requires config: rag.supabase.direct_url (or database_url), api_keys.<provider>,
 * embedding.provider/dimensions. Progress -> stderr, summary JSON -> stdout.
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig, providerApiKey } from "./config.mjs";
import { embedMany, providerModel } from "./embedding.mjs";
import { parseReport } from "./store.mjs";

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

// CorpusSection.type — coarse bucket used only for filtering (not the
// normalized display section). Mirrors the original 01 script sectionType().
function sectionType(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("abstract")) return "Abstract";
  if (n.includes("introduction") || n === "intro") return "Introduction";
  if (n.includes("method") || n.includes("experimental")) return "Methods";
  if (n.includes("result")) return "Results";
  if (n.includes("discussion")) return "Discussion";
  if (n.includes("conclusion") || n.includes("summary")) return "Conclusion";
  return "Other";
}

async function main() {
  const config = loadConfig();
  const sb = config.rag.supabase || {};
  const connectionString = sb.direct_url || sb.database_url;
  if (!connectionString) {
    die("rag.supabase.direct_url or rag.supabase.database_url required in config");
  }
  const provider = config.embedding.provider;
  const dimensions = config.embedding.dimensions;
  const apiKey = providerApiKey(config, provider);

  const inputDir = opts.input;
  if (!inputDir) die("--input <dir> required");
  if (!fs.existsSync(inputDir)) die(`--input dir not found: ${inputDir}`);
  // --group is OPTIONAL in supabase mode: paperGroup is not stored in the
  // supabase schema, so it is accepted for CLI parity with the local builder
  // but ignored (with a note). Absence is fine.
  let group = null;
  if (opts.group === "own" || opts.group === "field") {
    group = opts.group;
    process.stderr.write(
      `note: --group '${group}' is ignored in supabase mode (paperGroup is not stored in the schema)\n`
    );
  } else if (opts.group) {
    die("--group must be 'own' or 'field' when provided");
  }
  const force = !!opts.force;

  const files = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort();
  if (files.length === 0) die(`no *.json reports found in ${inputDir}`);

  const pg = (await import("pg")).default;
  const client = new pg.Client({ connectionString });
  await client.connect();

  const summary = {
    papers: 0,
    papers_skipped: 0,
    paragraphs: 0,
    moves: 0,
    vocabulary: 0,
    aitells: 0,
    paragraphs_embedded: 0,
    api_calls: 0,
    warnings: [],
    failed: [],
    provider,
    dimensions,
  };

  try {
    await client.query("SET statement_timeout = '120s'");

    // ---- CorpusMeta guard: enforce a single embedding provider/dimensions ----
    // Refuse to mix embeddings from different providers/dims in one corpus.
    try {
      const metaRes = await client.query(
        `SELECT provider, dimensions FROM "CorpusMeta" WHERE id = 1`
      );
      if (metaRes.rows.length) {
        const m = metaRes.rows[0];
        if (m.provider && m.provider !== provider) {
          die(
            `existing CorpusMeta.provider='${m.provider}' but config.embedding.provider='${provider}'. ` +
              "Refusing to mix embeddings. Use a fresh Supabase project or align config.embedding.provider."
          );
        }
        if (m.dimensions != null && Number(m.dimensions) !== Number(dimensions)) {
          die(
            `existing CorpusMeta.dimensions=${m.dimensions} but config.embedding.dimensions=${dimensions}. ` +
              "Refusing to mix. Use a fresh Supabase project or align config.embedding.dimensions."
          );
        }
      }
      await client.query(
        `INSERT INTO "CorpusMeta" (id, provider, model, dimensions, "updatedAt")
         VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           dimensions = EXCLUDED.dimensions,
           "updatedAt" = now()`,
        [provider, providerModel(provider), dimensions]
      );
    } catch (e) {
      if (e && e.code === "42P01") {
        // undefined_table: old schema without CorpusMeta — warn and continue.
        summary.warnings.push(
          "CorpusMeta table not found (old schema) — provider/dimension guard skipped. " +
            "Re-apply scripts/setup/corpus-schema.sql to enable it."
        );
        process.stderr.write("WARN: CorpusMeta table missing — skipping embedding metadata guard.\n");
      } else {
        throw e;
      }
    }

    for (const file of files) {
      let report;
      try {
        report = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf8"));
      } catch (e) {
        summary.failed.push({ file, reason: "json parse: " + e.message });
        continue;
      }
      const parsed = parseReport(report, { group });
      if (parsed.error) {
        summary.failed.push({ file, reason: parsed.error });
        continue;
      }
      const { paperId, paper } = parsed;
      for (const w of parsed.warnings) summary.warnings.push(w);

      // exists?
      const exists = await client.query(
        `SELECT 1 FROM "CorpusPaper" WHERE "paperId" = $1`,
        [paperId]
      );
      if (exists.rows.length && !force) {
        summary.papers_skipped += 1;
        process.stderr.write(`skip (exists): ${paperId}\n`);
        continue;
      }

      await client.query("BEGIN");
      try {
        // Minimal paper upsert (FK target). Title/journal/year best-effort.
        await client.query(
          `
          INSERT INTO "CorpusPaper" (id, "paperId", title, journal, year, "sourceFile")
          VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)
          ON CONFLICT ("paperId") DO UPDATE SET
            title = EXCLUDED.title,
            journal = EXCLUDED.journal,
            year = EXCLUDED.year,
            "sourceFile" = EXCLUDED."sourceFile",
            "updatedAt" = now()
          `,
          [
            paperId,
            paper.title || "Untitled",
            paper.journal || "Unknown",
            Number.isFinite(paper.year) ? paper.year : 0,
            paper.source_file || null,
          ]
        );

        // Purge children (idempotent / force)
        await client.query(`DELETE FROM "CorpusParagraph" WHERE "paperId" = $1`, [paperId]);
        await client.query(`DELETE FROM "CorpusSection" WHERE "paperId" = $1`, [paperId]);
        await client.query(`DELETE FROM "CorpusVocabulary" WHERE "paperId" = $1`, [paperId]);
        await client.query(`DELETE FROM "CorpusAiTell" WHERE "paperId" = $1`, [paperId]);

        // Sections: distinct section names in first-seen order
        const sectionOrder = [];
        const sectionSeen = new Set();
        for (const p of parsed.paragraphs) {
          if (!sectionSeen.has(p.sectionName)) {
            sectionSeen.add(p.sectionName);
            sectionOrder.push(p.sectionName);
          }
        }
        const sectionIdByName = new Map();
        for (let i = 0; i < sectionOrder.length; i++) {
          const name = sectionOrder[i];
          const ins = await client.query(
            `INSERT INTO "CorpusSection" (id, "paperId", type, name, "orderInPaper")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id`,
            [paperId, sectionType(name), name, i]
          );
          sectionIdByName.set(name, ins.rows[0].id);
        }

        // Paragraphs + moves. Track DB paragraph id per local paragraph id.
        const paraDbId = new Map();
        let globalIndex = 0;
        for (const p of parsed.paragraphs) {
          const sectionId = sectionIdByName.get(p.sectionName);
          const ins = await client.query(
            `
            INSERT INTO "CorpusParagraph" (
              id, "paperId", "sectionId", "positionInSection", "globalIndex",
              text, "wordCount", voice, "hedgeLevel", "tensePattern", "hasActiveWe",
              "primaryClaimType", "citesCount", "refsFigures", "refsEquations",
              "refsTables", "refsPriorWork", "aiTellPhrases"
            ) VALUES (
              gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17
            ) RETURNING id
            `,
            [
              paperId,
              sectionId,
              p.positionInSection,
              globalIndex++,
              p.text,
              p.wordCount,
              p.voice,
              p.hedgeLevel,
              p.tensePattern,
              p.hasActiveWe,
              p.primaryClaimType,
              p.citesCount,
              p.refsFigures,
              p.refsEquations,
              p.refsTables,
              p.refsPriorWork,
              p.aiTellPhrases,
            ]
          );
          paraDbId.set(p.id, ins.rows[0].id);
          summary.paragraphs += 1;
        }

        for (const m of parsed.moves) {
          const dbParaId = paraDbId.get(m.paragraphId);
          if (!dbParaId) continue;
          await client.query(
            `INSERT INTO "CorpusMove" (id, "paragraphId", "moveType", "positionInParagraph", "textSpan")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
            [dbParaId, m.moveType, m.positionInParagraph, m.textSpan]
          );
          summary.moves += 1;
        }

        for (const v of parsed.vocabulary) {
          await client.query(
            `INSERT INTO "CorpusVocabulary" (id, "paperId", category, phrase, expansion, context, "countInPaper", "firstUseSection", "isDefinedAtFirstUse")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 1, $6, $7)`,
            [paperId, v.category, v.term, v.expansion, v.context, v.firstUseSection, v.isDefinedAtFirstUse]
          );
          summary.vocabulary += 1;
        }

        for (const a of parsed.aitells) {
          await client.query(
            `INSERT INTO "CorpusAiTell" (id, "paperId", phrase, section, context, rationale)
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
            [paperId, a.phrase, a.section, a.context || "", a.rationale]
          );
          summary.aitells += 1;
        }

        await client.query("COMMIT");
        summary.papers += 1;
        process.stderr.write(`ingested: ${paperId}\n`);
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch {}
        summary.failed.push({ paperId, reason: e.message });
        process.stderr.write(`FAIL ${paperId}: ${e.message}\n`);
      }
    }

    // ---- embeddings: fill NULL paragraph embeddings in batches of 100 ------
    process.stderr.write(`embedding paragraphs via ${provider} (${dimensions}d)…\n`);
    while (true) {
      const rows = (
        await client.query(
          `SELECT id, text FROM "CorpusParagraph"
           WHERE embedding IS NULL AND text IS NOT NULL AND length(text) > 30
           LIMIT 100`
        )
      ).rows;
      if (rows.length === 0) break;
      const texts = rows.map((r) => String(r.text).slice(0, 8000));
      const { vectors, apiCalls } = await embedMany(texts, {
        provider,
        dimensions,
        apiKey,
        batchSize: 100,
      });
      summary.api_calls += apiCalls;
      for (let i = 0; i < rows.length; i++) {
        const lit = "[" + vectors[i].join(",") + "]";
        await client.query(
          `UPDATE "CorpusParagraph" SET embedding = $1::vector WHERE id = $2`,
          [lit, rows[i].id]
        );
        summary.paragraphs_embedded += 1;
      }
      process.stderr.write(`  embedded ${summary.paragraphs_embedded}\r`);
    }
    process.stderr.write("\n");
  } finally {
    await client.end();
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("ERROR: " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
