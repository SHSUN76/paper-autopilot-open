#!/usr/bin/env node
/**
 * smoke-local.mjs — end-to-end smoke test for the LOCAL RAG backend.
 *
 * No network / no real API keys. Uses embedding.provider = "stub" (deterministic
 * offline char-histogram embedding, 8 dimensions) so build-corpus.mjs and
 * retrieve.mjs run fully offline. Also exercises:
 *   - build-corpus incremental skip + own/field grouping
 *   - all 6 retrieve commands + output-shape assertions
 *   - rag.mode = "disabled" -> exit code 2
 *   - --query-vector dev bypass (skips embedding entirely)
 *
 * Run:  node scripts/tests/smoke-local.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RETRIEVE = path.resolve(__dirname, "../retrieve.mjs");
const BUILD = path.resolve(__dirname, "../ingest/build-corpus.mjs");
const NODE = process.execPath;

let passCount = 0;
let failCount = 0;
function check(name, cond, detail) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${name}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// --- build a small fake paragraph_reports corpus (paragraph_extraction schema,
//     with an added `lexicon` so vocabulary has data) --------------------------
function para(section, pos, claim, text, aiTells, moves) {
  return {
    section_name: section,
    position_in_section: pos,
    text,
    word_count: text.split(/\s+/).length,
    voice: pos % 2 === 0 ? "passive" : "active_we",
    hedge_level: ["none", "mild", "moderate", "strong"][pos % 4],
    tense_pattern: "past simple",
    has_active_we: pos % 2 === 1,
    primary_claim_type: claim,
    cites_count: pos,
    refs_figures: pos === 0 ? ["Fig 1"] : [],
    refs_equations: [],
    refs_tables: [],
    refs_prior_work: pos,
    ai_tell_phrases: aiTells || [],
    moves: moves || [
      { move_type: "present_evidence", position: 0, text_span: text.slice(0, 20) },
      { move_type: "interpret", position: 1, text_span: text.slice(20, 40) },
    ],
  };
}

const lexicon = {
  acronyms: [
    { abbr: "NCM", expansion: "nickel cobalt manganese", first_use_section: "Introduction", is_defined_at_first_use: true },
    { abbr: "SEI", expansion: "solid electrolyte interphase", first_use_section: "Results", is_defined_at_first_use: true },
  ],
  units: [{ unit: "mAh/g", context: "specific capacity" }],
  method_names: [{ name: "galvanostatic cycling", first_use_section: "Methods" }],
  instrument_names: [{ name: "Bruker D8", purpose: "XRD" }],
};

const reports = {
  alpha2024: {
    paper_id: "alpha2024",
    source_file: "alpha.pdf",
    metadata: { title: "Alpha cathode study", journal: "Joule", year: 2024 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "High nickel cathodes promise higher energy density for batteries and vehicles.", ["remarkable", "paving the way"]),
      para("Introduction", 1, "contribution", "In this work we propose a coating strategy that stabilizes the cathode surface layer."),
      para("Results and Discussion", 0, "evidence", "The coated cathode retained ninety percent capacity after five hundred cycles here."),
      para("Results and Discussion", 1, "mechanism", "The coating suppresses transition metal dissolution and reduces interfacial resistance growth."),
      para("Conclusion", 0, "contribution", "We demonstrated a scalable coating that extends high nickel cathode cycle life significantly."),
    ],
  },
  beta2023: {
    paper_id: "beta2023",
    source_file: "beta.pdf",
    metadata: { title: "Beta electrolyte study", journal: "Adv. Energy Mater.", year: 2023 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "Electrolyte decomposition limits the lifetime of high voltage lithium batteries today.", ["delve"]),
      para("Introduction", 1, "contribution", "Here we introduce an additive that forms a robust protective interphase on cycling."),
      para("Methods", 0, "method_description", "Cells were assembled in an argon glovebox and cycled galvanostatically at room temperature."),
      para("Results", 0, "evidence", "The additive lowered impedance and improved coulombic efficiency across two hundred cycles."),
    ],
  },
  gamma2022: {
    paper_id: "gamma2022",
    source_file: "gamma.pdf",
    metadata: { title: "Gamma anode review", journal: "Nature Energy", year: 2022 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "Silicon anodes offer large capacity but suffer severe volume expansion during lithiation.", ["landscape of"]),
      para("Discussion", 0, "caveat", "However the reported improvements may not translate to thick commercial electrode formats."),
      para("Conclusion", 0, "contribution", "This review maps design rules for durable silicon anode composites and binders."),
    ],
  },
};

// --- workspace ---------------------------------------------------------------
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pao-smoke-"));
const inputOwn = path.join(work, "input_own");
const inputField = path.join(work, "input_field");
const corpusDir = path.join(work, "corpus");
fs.mkdirSync(inputOwn, { recursive: true });
fs.mkdirSync(inputField, { recursive: true });
fs.writeFileSync(path.join(inputOwn, "alpha2024.json"), JSON.stringify(reports.alpha2024));
fs.writeFileSync(path.join(inputOwn, "beta2023.json"), JSON.stringify(reports.beta2023));
fs.writeFileSync(path.join(inputField, "gamma2022.json"), JSON.stringify(reports.gamma2022));

const configPath = path.join(work, "config.json");
fs.writeFileSync(
  configPath,
  JSON.stringify({
    rag: { mode: "local", local_corpus_dir: corpusDir, supabase: {} },
    embedding: { provider: "stub", dimensions: 8 },
    api_keys: {},
  })
);

const baseEnv = { ...process.env, PAO_CONFIG: configPath };

function run(script, args, extraEnv, allowFail) {
  try {
    const out = execFileSync(NODE, [script, ...args], {
      env: { ...baseEnv, ...(extraEnv || {}) },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout: out };
  } catch (e) {
    if (!allowFail) {
      console.log("  (command failed) " + script + " " + args.join(" "));
      console.log("  stderr: " + (e.stderr || "").toString().slice(0, 500));
    }
    return { code: e.status == null ? 1 : e.status, stdout: (e.stdout || "").toString(), stderr: (e.stderr || "").toString() };
  }
}

function json(out) {
  try { return JSON.parse(out); } catch { return null; }
}
function hasKeys(row, keys) {
  return row && typeof row === "object" && keys.every((k) => k in row);
}

console.log("paper-autopilot-open — local RAG smoke test");
console.log("workspace: " + work);

// === 1. build (own group) ====================================================
console.log("\n[build] own group (alpha, beta)");
let r = run(BUILD, ["--input", inputOwn, "--group", "own"]);
let s = json(r.stdout);
check("build own exits 0", r.code === 0, "code=" + r.code);
check("build own summary is JSON", !!s);
check("build own papers_added == 2", s && s.papers_added === 2, s && "got " + s.papers_added);
check("build own paragraphs_embedded == 9", s && s.paragraphs_embedded === 9, s && "got " + s.paragraphs_embedded);
check("build own api_calls == 0 (stub)", s && s.api_calls === 0);
check("build own estimated_cost_usd == 0 (stub)", s && s.estimated_cost_usd === 0);

// === 2. build (field group, incremental) =====================================
console.log("\n[build] field group (gamma), incremental");
r = run(BUILD, ["--input", inputField, "--group", "field"]);
s = json(r.stdout);
check("build field exits 0", r.code === 0, "code=" + r.code);
check("build field papers_added == 1", s && s.papers_added === 1, s && "got " + s.papers_added);

// === 3. build again (own) -> incremental skip ================================
console.log("\n[build] own group again -> skip");
r = run(BUILD, ["--input", inputOwn, "--group", "own"]);
s = json(r.stdout);
check("re-build own papers_added == 0", s && s.papers_added === 0, s && "got " + s.papers_added);
check("re-build own papers_skipped == 2", s && s.papers_skipped === 2, s && "got " + s.papers_skipped);

// verify meta groups
const meta = json(fs.readFileSync(path.join(corpusDir, "corpus-meta.json"), "utf8"));
check("meta paper_groups own=2 field=1", meta && meta.paper_groups.own === 2 && meta.paper_groups.field === 1);
check("meta counts.papers == 3", meta && meta.counts.papers === 3);
check("meta embedding provider=stub dims=8", meta && meta.embedding.provider === "stub" && meta.embedding.dimensions === 8);

// === 4. retrieve: paragraphs =================================================
console.log("\n[retrieve] paragraphs");
r = run(RETRIEVE, ["paragraphs", "--query", "coating stabilizes high nickel cathode surface", "--k", "3"]);
let data = json(r.stdout);
check("paragraphs exits 0", r.code === 0, "code=" + r.code);
check("paragraphs returns array", Array.isArray(data));
check("paragraphs non-empty", Array.isArray(data) && data.length > 0);
check(
  "paragraphs row shape",
  Array.isArray(data) && data.length > 0 &&
    hasKeys(data[0], ["id", "paperId", "section", "section_name", "claim", "hedge", "voice", "has_we", "text_excerpt", "full_text", "similarity"]),
  data && data[0] && "keys=" + Object.keys(data[0]).join(",")
);
check("paragraphs similarity is number", Array.isArray(data) && typeof data[0]?.similarity === "number");

// filtered by section + claim
r = run(RETRIEVE, ["paragraphs", "--query", "we propose a coating", "--section", "Introduction", "--claim", "contribution", "--k", "5"]);
data = json(r.stdout);
check("paragraphs section+claim filter returns only matching", Array.isArray(data) && data.every((x) => x.section === "Introduction" && x.claim === "contribution"));

// === 5. retrieve: next-paragraph =============================================
console.log("\n[retrieve] next-paragraph");
r = run(RETRIEVE, ["next-paragraph", "--query", "high nickel cathodes promise higher energy density", "--k", "3"]);
data = json(r.stdout);
check("next-paragraph exits 0", r.code === 0, "code=" + r.code);
check("next-paragraph returns array", Array.isArray(data));
check("next-paragraph non-empty", Array.isArray(data) && data.length > 0);
check(
  "next-paragraph row shape",
  Array.isArray(data) && data.length > 0 &&
    hasKeys(data[0], ["prior_similarity", "prior_id", "next_id", "next_claim", "next_hedge", "next_voice", "next_excerpt", "next_full_text"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(",")
);

// === 6. retrieve: vocabulary =================================================
console.log("\n[retrieve] vocabulary");
r = run(RETRIEVE, ["vocabulary", "--category", "acronym", "--min-papers", "1"]);
data = json(r.stdout);
check("vocabulary exits 0", r.code === 0, "code=" + r.code);
check("vocabulary returns array", Array.isArray(data));
check("vocabulary non-empty", Array.isArray(data) && data.length > 0);
check(
  "vocabulary row shape",
  Array.isArray(data) && data.length > 0 &&
    hasKeys(data[0], ["term", "category", "context", "paper_count", "total_occurrences"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(",")
);
check("vocabulary paper_count is string (pg-bigint parity)", Array.isArray(data) && typeof data[0]?.paper_count === "string");
check("vocabulary NCM appears in 3 papers", Array.isArray(data) && data.some((x) => x.term === "NCM" && x.paper_count === "3"));

// === 7. retrieve: aitells ====================================================
console.log("\n[retrieve] aitells");
r = run(RETRIEVE, ["aitells", "--threshold", "10"]);
data = json(r.stdout);
check("aitells exits 0", r.code === 0, "code=" + r.code);
check("aitells returns array", Array.isArray(data));
check("aitells non-empty", Array.isArray(data) && data.length > 0);
check(
  "aitells row shape",
  Array.isArray(data) && data.length > 0 && hasKeys(data[0], ["phrase", "paper_count", "total_occurrences"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(",")
);

// === 8. retrieve: section-distribution =======================================
console.log("\n[retrieve] section-distribution");
r = run(RETRIEVE, ["section-distribution", "--section", "Introduction"]);
data = json(r.stdout);
check("section-distribution exits 0", r.code === 0, "code=" + r.code);
check("section-distribution returns array", Array.isArray(data));
check("section-distribution non-empty", Array.isArray(data) && data.length > 0);
check(
  "section-distribution row shape",
  Array.isArray(data) && data.length > 0 && hasKeys(data[0], ["claim", "n", "pct"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(",")
);
check("section-distribution n is string, pct is string", Array.isArray(data) && typeof data[0]?.n === "string" && typeof data[0]?.pct === "string");

// === 9. retrieve: move-transitions ===========================================
console.log("\n[retrieve] move-transitions");
r = run(RETRIEVE, ["move-transitions", "--from", "present_evidence"]);
data = json(r.stdout);
check("move-transitions exits 0", r.code === 0, "code=" + r.code);
check("move-transitions returns array", Array.isArray(data));
check("move-transitions non-empty", Array.isArray(data) && data.length > 0);
check(
  "move-transitions row shape",
  Array.isArray(data) && data.length > 0 && hasKeys(data[0], ["next", "n", "pct"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(",")
);
check("move-transitions present_evidence -> interpret", Array.isArray(data) && data.some((x) => x.next === "interpret"));

// === 10. --query-vector bypass ==============================================
console.log("\n[retrieve] --query-vector bypass (no embedding)");
r = run(RETRIEVE, ["paragraphs", "--query", "ignored", "--query-vector", "[1,0,0,0,0,0,0,0]", "--k", "2"]);
data = json(r.stdout);
check("query-vector exits 0", r.code === 0, "code=" + r.code);
check("query-vector returns array with similarity", Array.isArray(data) && data.length > 0 && typeof data[0].similarity === "number");

// === 11. disabled mode -> exit 2 ============================================
console.log("\n[mode] disabled -> exit code 2");
r = run(RETRIEVE, ["paragraphs", "--query", "x"], { PAO_RAG_MODE: "disabled" }, true);
check("disabled mode exit code == 2", r.code === 2, "code=" + r.code);

// === 12. provider mismatch guard ============================================
console.log("\n[guard] provider mismatch -> error exit 1");
r = run(RETRIEVE, ["paragraphs", "--query", "x"], { PAO_EMBED_PROVIDER: "openai" }, true);
check("provider mismatch exit code == 1", r.code === 1, "code=" + r.code);
check("provider mismatch message mentions mismatch", (r.stderr || "").includes("mismatch"));

// === 13. string-form moves acceptance =======================================
// A report whose `moves` are bare strings (not { move_type, ... } objects) must
// be accepted verbatim. If they were silently coerced to "interpret", the
// present_evidence -> compare_prior transition below would never appear.
console.log("\n[feature] string-form moves accepted");
const corpusStr = path.join(work, "corpus_strmoves");
const inputStr = path.join(work, "input_strmoves");
fs.mkdirSync(inputStr, { recursive: true });
const strMovesReport = {
  paper_id: "strmoves2020",
  source_file: "strmoves.pdf",
  metadata: { title: "String moves paper", journal: "Test J.", year: 2020 },
  paragraphs: [
    {
      section_name: "Results",
      position_in_section: 0,
      text: "The additive raised capacity retention which we attribute to a stable interphase forming.",
      primary_claim_type: "evidence",
      moves: ["present_evidence", "compare_prior", "interpret"],
    },
  ],
};
fs.writeFileSync(path.join(inputStr, "strmoves.json"), JSON.stringify(strMovesReport));
r = run(BUILD, ["--input", inputStr, "--group", "own"], { PAO_CORPUS_DIR: corpusStr });
s = json(r.stdout);
check("string-moves build exits 0", r.code === 0, "code=" + r.code);
check("string-moves papers_added == 1", s && s.papers_added === 1, s && "got " + s.papers_added);
check("string-moves moves_added == 3", s && s.moves_added === 3, s && "got " + s.moves_added);

r = run(RETRIEVE, ["move-transitions", "--from", "present_evidence"], { PAO_CORPUS_DIR: corpusStr });
data = json(r.stdout);
check("string-moves move-transitions exits 0", r.code === 0, "code=" + r.code);
check("string-moves move-transitions non-empty", Array.isArray(data) && data.length > 0);
check(
  "string-moves present_evidence -> compare_prior (verbatim, not 'interpret')",
  Array.isArray(data) && data.some((x) => x.next === "compare_prior"),
  data && "rows=" + JSON.stringify(data)
);

// === 14. local --group filter (paragraphs) ==================================
// Main corpus has alpha/beta = own, gamma = field. --group must restrict rows.
console.log("\n[feature] local --group filter");
r = run(RETRIEVE, ["paragraphs", "--query", "electrolyte additive interphase", "--group", "field", "--k", "20"]);
data = json(r.stdout);
check("group=field exits 0", r.code === 0, "code=" + r.code);
check("group=field non-empty", Array.isArray(data) && data.length > 0);
check(
  "group=field returns only field-group papers (gamma)",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "gamma2022"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data)
);

r = run(RETRIEVE, ["paragraphs", "--query", "coating cathode", "--group", "own", "--k", "20"]);
data = json(r.stdout);
check("group=own exits 0", r.code === 0, "code=" + r.code);
check(
  "group=own returns only own-group papers (alpha/beta)",
  Array.isArray(data) && data.length > 0 &&
    data.every((x) => x.paperId === "alpha2024" || x.paperId === "beta2023"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data)
);

r = run(RETRIEVE, ["paragraphs", "--query", "x", "--group", "bogus"], null, true);
check("group=bogus rejected (exit 1)", r.code === 1, "code=" + r.code);

// === 15. same-run duplicate paperId dedup (build-corpus) ====================
// Two report files, same paper_id, single run -> keep first, skip second + warn.
console.log("\n[feature] same-run duplicate paperId dedup");
const corpusDup = path.join(work, "corpus_dup");
const inputDup = path.join(work, "input_dup");
fs.mkdirSync(inputDup, { recursive: true });
const dupReport = {
  paper_id: "dup2019",
  source_file: "dup.pdf",
  metadata: { title: "Dup paper", journal: "Test", year: 2019 },
  paragraphs: [
    para("Introduction", 0, "motivation", "A duplicate paper id appears in two report files within one build run here."),
  ],
};
fs.writeFileSync(path.join(inputDup, "a_dup.json"), JSON.stringify(dupReport));
fs.writeFileSync(path.join(inputDup, "b_dup.json"), JSON.stringify(dupReport));
r = run(BUILD, ["--input", inputDup, "--group", "own"], { PAO_CORPUS_DIR: corpusDup });
s = json(r.stdout);
check("dedup build exits 0", r.code === 0, "code=" + r.code);
check("dedup papers_added == 1 (not 2)", s && s.papers_added === 1, s && "got " + s.papers_added);
check(
  "dedup emits duplicate-paperId warning",
  s && Array.isArray(s.warnings) && s.warnings.some((w) => /duplicate paperId/i.test(w)),
  s && "warnings=" + JSON.stringify(s && s.warnings)
);

// --- cleanup -----------------------------------------------------------------
try { fs.rmSync(work, { recursive: true, force: true }); } catch {}

console.log(`\n=== ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
