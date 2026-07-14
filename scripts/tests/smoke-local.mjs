#!/usr/bin/env node
/**
 * smoke-local.mjs — end-to-end smoke test for the LOCAL RAG backend.
 *
 * No network / no real API keys. Uses embedding.provider = "stub" (deterministic
 * offline char-histogram embedding, 8 dimensions) so build-corpus.mjs and
 * retrieve.mjs run fully offline. Also exercises:
 *   - build-corpus incremental skip + own/field/review grouping
 *   - all retrieve commands (incl. figures / figure-arcs) + output-shape asserts
 *   - review group + field-profile.review_papers block (review not in style-profile)
 *   - figure-set RAG: ingest, search + --type/--role/--group filters, arc shape,
 *     paperGroup resolution, incremental skip / --force, not-built guard, report section
 *   - methodology RAG: ingest from figures.json methodology block, methods search +
 *     --technique/--category/--group filters, shape, analysis_pipeline replication,
 *     missing-category warning, incremental skip / --force, not-built guard,
 *     figures.json-without-methodology backward-compat, report section
 *   - rag.mode = "disabled" -> exit code 2; supabase local-only guards
 *   - --query-vector dev bypass (skips embedding entirely)
 *
 * Run:  node scripts/tests/smoke-local.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RETRIEVE = path.resolve(__dirname, "../retrieve.mjs");
const BUILD = path.resolve(__dirname, "../ingest/build-corpus.mjs");
const REPORT = path.resolve(__dirname, "../report/corpus-report.mjs");
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
  // spawnSync (not execFileSync) so stderr is captured on success too — some
  // commands emit informational notes (e.g. --since exclusions) on exit 0.
  const res = spawnSync(NODE, [script, ...args], {
    env: { ...baseEnv, ...(extraEnv || {}) },
    encoding: "utf8",
  });
  const code = res.status == null ? 1 : res.status;
  const stdout = (res.stdout || "").toString();
  const stderr = (res.stderr || "").toString();
  if (code !== 0 && !allowFail) {
    console.log("  (command failed) " + script + " " + args.join(" "));
    console.log("  stderr: " + stderr.slice(0, 500));
  }
  return { code, stdout, stderr };
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

// === 16. group profiles generated (style-profile.json / field-profile.json) ==
// The main corpus (own = alpha/beta, field = gamma) must, on every build, emit
// two profile artifacts with the documented shapes.
console.log("\n[profiles] style-profile.json + field-profile.json generated");
const stylePath = path.join(corpusDir, "style-profile.json");
const fieldPath = path.join(corpusDir, "field-profile.json");
check("style-profile.json exists", fs.existsSync(stylePath));
check("field-profile.json exists", fs.existsSync(fieldPath));

const styleProf = fs.existsSync(stylePath) ? json(fs.readFileSync(stylePath, "utf8")) : null;
const fieldProf = fs.existsSync(fieldPath) ? json(fs.readFileSync(fieldPath, "utf8")) : null;

check("style-profile group == own", styleProf && styleProf.group === "own");
check("style-profile papers == 2", styleProf && styleProf.papers === 2, styleProf && "got " + styleProf.papers);
check("style-profile paragraphs == 9", styleProf && styleProf.paragraphs === 9, styleProf && "got " + styleProf.paragraphs);
check(
  "style-profile voice has active/passive/mixed numbers",
  styleProf && styleProf.voice &&
    ["active", "passive", "mixed"].every((k) => typeof styleProf.voice[k] === "number")
);
check("style-profile has_active_we_rate is number", styleProf && typeof styleProf.has_active_we_rate === "number");
check(
  "style-profile hedge_by_claim keyed by claim w/ 4 hedge levels",
  styleProf && styleProf.hedge_by_claim && typeof styleProf.hedge_by_claim === "object" &&
    Object.values(styleProf.hedge_by_claim).every(
      (h) => h && ["none", "mild", "moderate", "strong"].every((k) => typeof h[k] === "number")
    )
);
check(
  "style-profile claim_distribution is object of numbers",
  styleProf && styleProf.claim_distribution &&
    Object.values(styleProf.claim_distribution).every((v) => typeof v === "number")
);
check(
  "style-profile move_transitions present_evidence -> interpret",
  styleProf && styleProf.move_transitions && styleProf.move_transitions.present_evidence &&
    typeof styleProf.move_transitions.present_evidence.interpret === "number"
);
check("style-profile avg_paragraph_words is number", styleProf && typeof styleProf.avg_paragraph_words === "number");
check(
  "style-profile top_vocabulary rows shape {phrase,category,count}",
  styleProf && Array.isArray(styleProf.top_vocabulary) && styleProf.top_vocabulary.length > 0 &&
    hasKeys(styleProf.top_vocabulary[0], ["phrase", "category", "count"])
);
check("style-profile generated_at present", styleProf && typeof styleProf.generated_at === "string");

check("field-profile group == field", fieldProf && fieldProf.group === "field");
check("field-profile papers == 1", fieldProf && fieldProf.papers === 1, fieldProf && "got " + fieldProf.papers);
check("field-profile paragraphs == 3", fieldProf && fieldProf.paragraphs === 3, fieldProf && "got " + fieldProf.paragraphs);
check(
  "field-profile years {min,max,histogram}",
  fieldProf && fieldProf.years && fieldProf.years.min === 2022 && fieldProf.years.max === 2022 &&
    fieldProf.years.histogram && fieldProf.years.histogram["2022"] === 1,
  fieldProf && "years=" + JSON.stringify(fieldProf.years)
);
check(
  "field-profile journals rows shape {name,count}",
  fieldProf && Array.isArray(fieldProf.journals) && fieldProf.journals.length > 0 &&
    hasKeys(fieldProf.journals[0], ["name", "count"]) &&
    fieldProf.journals.some((j) => j.name === "Nature Energy")
);
check(
  "field-profile claim_by_section is object of pct maps",
  fieldProf && fieldProf.claim_by_section && typeof fieldProf.claim_by_section === "object" &&
    Object.values(fieldProf.claim_by_section).every(
      (m) => m && typeof m === "object" && Object.values(m).every((v) => typeof v === "number")
    )
);
check(
  "field-profile top_method_vocabulary rows shape {phrase,count}",
  fieldProf && Array.isArray(fieldProf.top_method_vocabulary) &&
    (fieldProf.top_method_vocabulary.length === 0 ||
      hasKeys(fieldProf.top_method_vocabulary[0], ["phrase", "count"]))
);
check("field-profile top_vocabulary is array", fieldProf && Array.isArray(fieldProf.top_vocabulary));
check("field-profile generated_at present", fieldProf && typeof fieldProf.generated_at === "string");

// === 17. retrieve style-profile / field-profile commands =====================
console.log("\n[retrieve] style-profile / field-profile");
r = run(RETRIEVE, ["style-profile"]);
data = json(r.stdout);
check("retrieve style-profile exits 0", r.code === 0, "code=" + r.code);
check("retrieve style-profile group == own", data && data.group === "own");
r = run(RETRIEVE, ["field-profile"]);
data = json(r.stdout);
check("retrieve field-profile exits 0", r.code === 0, "code=" + r.code);
check("retrieve field-profile group == field", data && data.group === "field");

// missing profile (fresh empty corpus dir) -> exit 1 with build hint
const emptyDir = path.join(work, "corpus_empty");
fs.mkdirSync(emptyDir, { recursive: true });
r = run(RETRIEVE, ["style-profile"], { PAO_CORPUS_DIR: emptyDir }, true);
check("style-profile missing -> exit 1", r.code === 1, "code=" + r.code);
check("style-profile missing -> build hint", (r.stderr || "").includes("build-corpus"));

// supabase mode -> local-only feature, exit 1 (no DB contacted)
r = run(RETRIEVE, ["style-profile"], { PAO_RAG_MODE: "supabase" }, true);
check("style-profile supabase mode -> exit 1", r.code === 1, "code=" + r.code);
check("style-profile supabase mode -> local-only note", (r.stderr || "").includes("local-only"));

// === 18. paragraphs --since <year> filter ====================================
// Main corpus years: alpha2024=2024, beta2023=2023, gamma2022=2022.
console.log("\n[retrieve] paragraphs --since year filter");
r = run(RETRIEVE, ["paragraphs", "--query", "cathode electrolyte anode", "--since", "2024", "--k", "20"]);
data = json(r.stdout);
check("--since 2024 exits 0", r.code === 0, "code=" + r.code);
check("--since 2024 non-empty", Array.isArray(data) && data.length > 0);
check(
  "--since 2024 returns only alpha2024 (>= 2024)",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "alpha2024"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data)
);

// null-year exclusion note: build a corpus mixing a dated paper and an
// undated one (no metadata -> year null).
const corpusSince = path.join(work, "corpus_since");
const inputSince = path.join(work, "input_since");
fs.mkdirSync(inputSince, { recursive: true });
fs.writeFileSync(
  path.join(inputSince, "dated.json"),
  JSON.stringify({
    paper_id: "dated2021",
    source_file: "dated.pdf",
    metadata: { title: "Dated paper", journal: "J", year: 2021 },
    paragraphs: [para("Introduction", 0, "motivation", "A dated paper with a known publication year is included in this corpus test.")],
  })
);
fs.writeFileSync(
  path.join(inputSince, "undated.json"),
  JSON.stringify({
    paper_id: "undated0000",
    source_file: "undated.pdf",
    paragraphs: [para("Introduction", 0, "motivation", "An undated paper with no metadata and therefore an unknown null year value.")],
  })
);
r = run(BUILD, ["--input", inputSince, "--group", "field"], { PAO_CORPUS_DIR: corpusSince });
check("since-corpus build exits 0", r.code === 0, "code=" + r.code);
r = run(RETRIEVE, ["paragraphs", "--query", "paper corpus year", "--since", "2000", "--k", "20"], { PAO_CORPUS_DIR: corpusSince });
data = json(r.stdout);
check("--since null-year exits 0", r.code === 0, "code=" + r.code);
check(
  "--since excludes null-year paper (only dated2021 remains)",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "dated2021"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data)
);
check(
  "--since emits null-year exclusion note on stderr",
  (r.stderr || "").includes("unknown year"),
  "stderr=" + (r.stderr || "").slice(0, 200)
);

// === 19. corpus-report.mjs -> self-contained HTML ============================
console.log("\n[report] corpus-report.mjs self-contained HTML");
r = run(REPORT, []);
const reportSummary = json(r.stdout);
check("report exits 0", r.code === 0, "code=" + r.code);
check(
  "report summary shape {papers,paragraphs,edges,out}",
  reportSummary && hasKeys(reportSummary, ["papers", "paragraphs", "edges", "out"]),
  reportSummary && "keys=" + Object.keys(reportSummary || {}).join(",")
);
const reportPath = reportSummary && reportSummary.out ? reportSummary.out : path.join(corpusDir, "corpus-report.html");
check("report HTML file exists", reportSummary && fs.existsSync(reportPath));
if (reportSummary && fs.existsSync(reportPath)) {
  const htmlOut = fs.readFileSync(reportPath, "utf8");
  check("report HTML contains <svg", htmlOut.includes("<svg"));
  // No external http(s) references (src/href/etc.) — xmlns namespaces allowed.
  const stripped = htmlOut.replace(/xmlns(:\w+)?="[^"]*"/g, "");
  check(
    "report HTML has no external http(s) URL (xmlns excluded)",
    !/https?:\/\//.test(stripped),
    "found: " + ((stripped.match(/https?:\/\/[^\s"'<>]*/) || [])[0] || "")
  );
  check("report papers count == 3", reportSummary.papers === 3, "got " + reportSummary.papers);
}

// report on empty corpus -> exit 1 with build hint
r = run(REPORT, [], { PAO_CORPUS_DIR: emptyDir }, true);
check("report on empty corpus -> exit 1", r.code === 1, "code=" + r.code);
check("report on empty corpus -> build hint", (r.stderr || "").includes("빌드") || (r.stderr || "").includes("build"));

// === 20. review group + figure-set RAG =======================================
// A dedicated corpus (own + field + review paragraphs, then two figure reports)
// exercises the review group, field-profile.review_papers, figure ingest,
// figures search + filters, figure-arcs shape, incremental skip, the report
// figure section, and the "figure corpus 없음" guard.
console.log("\n[review+figures] dedicated corpus");
const corpusFig = path.join(work, "corpus_fig");
const inFigOwn = path.join(work, "in_fig_own");
const inFigField = path.join(work, "in_fig_field");
const inFigReview = path.join(work, "in_fig_review");
const inFigFigs = path.join(work, "in_fig_figs");
for (const d of [inFigOwn, inFigField, inFigReview, inFigFigs]) fs.mkdirSync(d, { recursive: true });

fs.writeFileSync(
  path.join(inFigOwn, "figown2024.json"),
  JSON.stringify({
    paper_id: "figown2024",
    source_file: "figown.pdf",
    metadata: { title: "Own coating paper", journal: "Joule", year: 2024 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "The own paper motivates a coating design for high nickel cathode stability."),
      para("Results", 0, "evidence", "The coated cathode retained ninety percent capacity after five hundred cycles here."),
    ],
  })
);
fs.writeFileSync(
  path.join(inFigField, "figfield2023.json"),
  JSON.stringify({
    paper_id: "figfield2023",
    source_file: "figfield.pdf",
    metadata: { title: "Field electrolyte paper", journal: "Nature Energy", year: 2023 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "The field paper surveys electrolyte additives forming protective interphases on cycling."),
      para("Results", 0, "evidence", "The additive lowered impedance and improved coulombic efficiency across two hundred cycles."),
    ],
  })
);
fs.writeFileSync(
  path.join(inFigReview, "figrev2020.json"),
  JSON.stringify({
    paper_id: "figrev2020",
    source_file: "figrev.pdf",
    metadata: { title: "Review of cathode coatings", journal: "Chem Rev", year: 2020 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "This review surveys coating strategies across a decade of high nickel cathode research."),
    ],
  })
);

// figure report helper (vision-analysis output schema)
function fig(figId, idx, total, types, role, panelCount, grid, panels, caption, keyMsg, ctx, qc, tags, isSi) {
  return {
    fig_id: figId, fig_index: idx, fig_total: total, is_si: !!isSi,
    figure_type: types, panel_count: panelCount, panel_grid: grid, panels,
    caption, key_message: keyMsg, narrative_role: role, narrative_context: ctx,
    quantitative_claims: qc || [], domain_tags: tags || [],
  };
}
fs.writeFileSync(
  path.join(inFigFigs, "figown2024.figures.json"),
  JSON.stringify({
    paper_id: "figown2024",
    figures: [
      fig("Fig1", 1, 2, ["schematic"], "design-concept", 2, "1x2",
        [{ label: "a", type: "schematic", summary: "coating concept" }, { label: "b", type: "schematic", summary: "interface" }],
        "Schematic of the coating design concept for the cathode.",
        "The coating forms a protective interphase.",
        "Design concept figure opening the results.", ["10 nm coating"], ["cathode", "coating"]),
      fig("Fig2", 2, 2, ["electrochemical"], "performance", 4, "2x2",
        [{ label: "a", type: "line", summary: "capacity retention" }],
        "Cycling performance of the coated cathode.",
        "Ninety percent retention after 500 cycles.",
        "Performance figure demonstrating cycle life.", ["90% at 500 cycles"], ["cycling", "capacity"]),
    ],
    arc_pattern: "design-concept → performance",
    arc_summary: "Opens with the coating design concept then proves cycle-life performance.",
    narrative_logic: "concept-then-proof",
  })
);
fs.writeFileSync(
  path.join(inFigFigs, "figfield2023.figures.json"),
  JSON.stringify({
    paper_id: "figfield2023",
    figures: [
      fig("Fig1", 1, 2, ["morphology", "microscopy"], "morphology", 3, "1x3",
        [{ label: "a", type: "SEM", summary: "particle morphology" }],
        "SEM morphology of the electrolyte additive film.",
        "Uniform film coverage observed.",
        "Morphology figure characterizing the additive film.", [], ["electrolyte", "additive"]),
      fig("Fig2", 2, 2, ["electrochemical"], "benchmark-comparison", 2, "1x2",
        [{ label: "a", type: "bar", summary: "impedance comparison" }],
        "Impedance comparison against a baseline electrolyte.",
        "Additive lowers impedance versus baseline.",
        "Benchmark comparison figure.", ["40% lower impedance"], ["impedance", "EIS"]),
    ],
    arc_pattern: "morphology → benchmark-comparison",
    arc_summary: "Characterizes film morphology then benchmarks impedance against baseline.",
    narrative_logic: "characterize-then-benchmark",
  })
);

const figEnv = { PAO_CORPUS_DIR: corpusFig };

// build own / field / review paragraphs
r = run(BUILD, ["--input", inFigOwn, "--group", "own"], figEnv);
check("fig-corpus build own exits 0", r.code === 0, "code=" + r.code);
r = run(BUILD, ["--input", inFigField, "--group", "field"], figEnv);
check("fig-corpus build field exits 0", r.code === 0, "code=" + r.code);
r = run(BUILD, ["--input", inFigReview, "--group", "review"], figEnv);
s = json(r.stdout);
check("fig-corpus build review exits 0", r.code === 0, "code=" + r.code);
check("build --group review papers_added == 1", s && s.papers_added === 1, s && "got " + s.papers_added);

// meta paper_groups now carries review
const figMeta = json(fs.readFileSync(path.join(corpusFig, "corpus-meta.json"), "utf8"));
check("meta paper_groups review == 1", figMeta && figMeta.paper_groups.review === 1, figMeta && JSON.stringify(figMeta && figMeta.paper_groups));
check("meta paper_groups own/field == 1/1", figMeta && figMeta.paper_groups.own === 1 && figMeta.paper_groups.field === 1);
check("meta embedding.task_type null (stub)", figMeta && figMeta.embedding && figMeta.embedding.task_type === null, figMeta && "got " + JSON.stringify(figMeta.embedding && figMeta.embedding.task_type));

// --group review filter on paragraphs
r = run(RETRIEVE, ["paragraphs", "--query", "coating cathode review", "--group", "review", "--k", "20"], figEnv);
data = json(r.stdout);
check("paragraphs --group review exits 0", r.code === 0, "code=" + r.code);
check("paragraphs --group review returns only figrev2020",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "figrev2020"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data));

// field-profile.review_papers block (review excluded from style-profile)
const figFieldProf = json(fs.readFileSync(path.join(corpusFig, "field-profile.json"), "utf8"));
check("field-profile has review_papers block", figFieldProf && figFieldProf.review_papers && typeof figFieldProf.review_papers === "object");
check("review_papers papers == 1", figFieldProf && figFieldProf.review_papers && figFieldProf.review_papers.papers === 1, figFieldProf && "got " + JSON.stringify(figFieldProf.review_papers));
check("review_papers years {min,max}==2020", figFieldProf && figFieldProf.review_papers && figFieldProf.review_papers.years &&
  figFieldProf.review_papers.years.min === 2020 && figFieldProf.review_papers.years.max === 2020);
check("review_papers journals shape {name,count} incl Chem Rev", figFieldProf && figFieldProf.review_papers &&
  Array.isArray(figFieldProf.review_papers.journals) && figFieldProf.review_papers.journals.some((j) => j.name === "Chem Rev" && j.count === 1));
const figStyleProf = json(fs.readFileSync(path.join(corpusFig, "style-profile.json"), "utf8"));
check("style-profile own papers == 1 (review NOT leaked in)", figStyleProf && figStyleProf.papers === 1, figStyleProf && "got " + figStyleProf.papers);

// figure RAG not built yet -> exit 1 with guidance
console.log("\n[figures] not-built guard");
r = run(RETRIEVE, ["figures", "--query", "coating"], figEnv, true);
check("figures (no figure corpus) -> exit 1", r.code === 1, "code=" + r.code);
check("figures (no figure corpus) -> guidance", (r.stderr || "").includes("figure corpus 없음"), "stderr=" + (r.stderr || "").slice(0, 160));
r = run(RETRIEVE, ["figure-arcs"], figEnv, true);
check("figure-arcs (no figure corpus) -> exit 1", r.code === 1, "code=" + r.code);
check("figure-arcs (no figure corpus) -> guidance", (r.stderr || "").includes("figure corpus 없음"));

// ingest figures — paperGroup resolves from the corresponding paragraph paper
console.log("\n[figures] ingest (2 figure reports)");
r = run(BUILD, ["--input", inFigFigs, "--group", "own"], figEnv);
s = json(r.stdout);
check("figures ingest exits 0", r.code === 0, "code=" + r.code);
check("figures_added == 4", s && s.figures_added === 4, s && "got " + s.figures_added);
check("arcs_added == 2", s && s.arcs_added === 2, s && "got " + s.arcs_added);
check("figures_skipped == 0 on first ingest", s && s.figures_skipped === 0, s && "got " + s.figures_skipped);

// figures.jsonl paperGroup resolution: figfield figures -> field (from paper), not --group own
const figLines = fs.readFileSync(path.join(corpusFig, "figures.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
check("figures.jsonl has 4 records", figLines.length === 4, "got " + figLines.length);
check("figown figures paperGroup == own", figLines.filter((f) => f.paperId === "figown2024").every((f) => f.paperGroup === "own"));
check("figfield figures paperGroup == field (resolved from paragraph paper, not --group)",
  figLines.filter((f) => f.paperId === "figfield2023").every((f) => f.paperGroup === "field"));

// figures search
console.log("\n[figures] search + filters");
r = run(RETRIEVE, ["figures", "--query", "coating cathode cycling performance", "--k", "10"], figEnv);
data = json(r.stdout);
check("figures search exits 0", r.code === 0, "code=" + r.code);
check("figures search returns array", Array.isArray(data) && data.length > 0);
check("figures row shape (output contract)",
  Array.isArray(data) && data.length > 0 &&
    hasKeys(data[0], ["paperId", "fig_id", "figure_type", "narrative_role", "panel_count", "panel_grid", "caption", "key_message", "narrative_context", "similarity"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(","));
check("figures similarity is number", Array.isArray(data) && typeof data[0]?.similarity === "number");
check("figures figure_type is array", Array.isArray(data) && Array.isArray(data[0]?.figure_type));

// --type filter (case-insensitive substring on figure_type[])
r = run(RETRIEVE, ["figures", "--query", "impedance", "--type", "ELECTRO", "--k", "10"], figEnv);
data = json(r.stdout);
check("figures --type filter exits 0", r.code === 0, "code=" + r.code);
check("figures --type ELECTRO -> only electrochemical figures",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.figure_type.some((t) => t.toLowerCase().includes("electro"))),
  data && "types=" + JSON.stringify(Array.isArray(data) ? data.map((x) => x.figure_type) : data));

// --role filter (exact)
r = run(RETRIEVE, ["figures", "--query", "cycle life", "--role", "performance", "--k", "10"], figEnv);
data = json(r.stdout);
check("figures --role performance -> only performance",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.narrative_role === "performance"),
  data && "roles=" + JSON.stringify(Array.isArray(data) ? data.map((x) => x.narrative_role) : data));

// --group filter
r = run(RETRIEVE, ["figures", "--query", "coating", "--group", "own", "--k", "10"], figEnv);
data = json(r.stdout);
check("figures --group own -> only figown2024",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "figown2024"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data));
r = run(RETRIEVE, ["figures", "--query", "impedance", "--group", "field", "--k", "10"], figEnv);
data = json(r.stdout);
check("figures --group field -> only figfield2023",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "figfield2023"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data));
r = run(RETRIEVE, ["figures", "--query", "x", "--group", "bogus"], figEnv, true);
check("figures --group bogus rejected (exit 1)", r.code === 1, "code=" + r.code);

// figure-arcs (all arcs, not a search)
console.log("\n[figure-arcs] full return + shape");
r = run(RETRIEVE, ["figure-arcs"], figEnv);
data = json(r.stdout);
check("figure-arcs exits 0", r.code === 0, "code=" + r.code);
check("figure-arcs returns all 2 arcs", Array.isArray(data) && data.length === 2, data && "len=" + (Array.isArray(data) ? data.length : data));
check("figure-arcs row shape (output contract)",
  Array.isArray(data) && data.length > 0 &&
    hasKeys(data[0], ["paperId", "group", "arc_pattern", "arc_summary", "narrative_logic", "figure_sequence"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(","));
check("figure-arcs figure_sequence row shape",
  Array.isArray(data) && data[0] && Array.isArray(data[0].figure_sequence) && data[0].figure_sequence.length > 0 &&
    hasKeys(data[0].figure_sequence[0], ["fig_id", "fig_index", "figure_type", "narrative_role", "key_message"]),
  data && data[0] && JSON.stringify(data[0].figure_sequence && data[0].figure_sequence[0]));
// group filter on arcs
r = run(RETRIEVE, ["figure-arcs", "--group", "field"], figEnv);
data = json(r.stdout);
check("figure-arcs --group field -> only figfield2023 arc",
  Array.isArray(data) && data.length === 1 && data[0].paperId === "figfield2023",
  data && "paperIds=" + (Array.isArray(data) ? data.map((x) => x.paperId).join(",") : data));

// increment: re-ingest same figure reports -> all skipped
console.log("\n[figures] incremental skip");
r = run(BUILD, ["--input", inFigFigs, "--group", "own"], figEnv);
s = json(r.stdout);
check("figures re-ingest exits 0", r.code === 0, "code=" + r.code);
check("figures re-ingest figures_added == 0", s && s.figures_added === 0, s && "got " + s.figures_added);
check("figures re-ingest figures_skipped == 4", s && s.figures_skipped === 4, s && "got " + s.figures_skipped);
const figLines2 = fs.readFileSync(path.join(corpusFig, "figures.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim());
check("figures.jsonl still 4 records after skip (no dupes)", figLines2.length === 4, "got " + figLines2.length);

// --force re-ingest -> re-embedded, still 4 (purge + re-add)
r = run(BUILD, ["--input", inFigFigs, "--group", "own", "--force"], figEnv);
s = json(r.stdout);
check("figures --force figures_added == 4", s && s.figures_added === 4, s && "got " + s.figures_added);
const figLines3 = fs.readFileSync(path.join(corpusFig, "figures.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim());
check("figures.jsonl still 4 records after --force (no dupes)", figLines3.length === 4, "got " + figLines3.length);

// figures / figure-arcs are local-only in supabase mode
console.log("\n[figures] supabase mode -> local-only exit 1");
r = run(RETRIEVE, ["figures", "--query", "x"], { ...figEnv, PAO_RAG_MODE: "supabase" }, true);
check("figures supabase -> exit 1", r.code === 1, "code=" + r.code);
check("figures supabase -> local-only note", (r.stderr || "").includes("local-only"));
r = run(RETRIEVE, ["figure-arcs"], { ...figEnv, PAO_RAG_MODE: "supabase" }, true);
check("figure-arcs supabase -> exit 1", r.code === 1, "code=" + r.code);
check("figure-arcs supabase -> local-only note", (r.stderr || "").includes("local-only"));

// report on the figure corpus includes the figure section
console.log("\n[report] figure section present when figures.jsonl exists");
r = run(REPORT, [], figEnv);
const figReportSummary = json(r.stdout);
check("report (fig corpus) exits 0", r.code === 0, "code=" + r.code);
const figReportPath = figReportSummary && figReportSummary.out ? figReportSummary.out : path.join(corpusFig, "corpus-report.html");
check("report (fig corpus) HTML exists", figReportSummary && fs.existsSync(figReportPath));
if (figReportSummary && fs.existsSync(figReportPath)) {
  const figHtml = fs.readFileSync(figReportPath, "utf8");
  check("report HTML has figure section header", figHtml.includes("Figure 구성 분석"));
  check("report HTML has figure_type chart", figHtml.includes("figure_type 분포"));
  check("report HTML has narrative_role chart", figHtml.includes("narrative_role 분포"));
  check("report HTML arc table lists a paperId", figHtml.includes("figfield2023") || figHtml.includes("figown2024"));
  const figStripped = figHtml.replace(/xmlns(:\w+)?="[^"]*"/g, "");
  check("report (fig corpus) HTML has no external http(s) URL", !/https?:\/\//.test(figStripped),
    "found: " + ((figStripped.match(/https?:\/\/[^\s"'<>]*/) || [])[0] || ""));
}

// report on a paragraph-only corpus (corpusDir) must NOT show the figure section
console.log("\n[report] no figure section on paragraph-only corpus");
r = run(REPORT, []);
if (r.code === 0) {
  const noFigPath = path.join(corpusDir, "corpus-report.html");
  const noFigHtml = fs.existsSync(noFigPath) ? fs.readFileSync(noFigPath, "utf8") : "";
  check("paragraph-only report omits figure section", !noFigHtml.includes("Figure 구성 분석"));
}

// figures-only ingest (no paragraph report) -> paperGroup falls back to --group
console.log("\n[figures] figures-only ingest falls back to --group");
const corpusFigOnly = path.join(work, "corpus_fig_only");
const inFigOnly = path.join(work, "in_fig_only");
fs.mkdirSync(inFigOnly, { recursive: true });
fs.writeFileSync(
  path.join(inFigOnly, "orphan2019.figures.json"),
  JSON.stringify({
    paper_id: "orphan2019",
    figures: [fig("Fig1", 1, 1, ["schematic"], "summary", 1, "1x1", [{ label: "a", type: "schematic", summary: "overview" }], "Overview schematic.", "Overview.", "Summary figure.", [], ["overview"])],
    arc_pattern: "summary",
    arc_summary: "Single overview figure.",
    narrative_logic: "single",
  })
);
r = run(BUILD, ["--input", inFigOnly, "--group", "field"], { PAO_CORPUS_DIR: corpusFigOnly });
s = json(r.stdout);
check("figures-only ingest exits 0", r.code === 0, "code=" + r.code);
check("figures-only figures_added == 1", s && s.figures_added === 1, s && "got " + s.figures_added);
const figOnlyLines = fs.readFileSync(path.join(corpusFigOnly, "figures.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
check("figures-only paperGroup == field (from --group fallback)", figOnlyLines.length === 1 && figOnlyLines[0].paperGroup === "field", figOnlyLines[0] && "got " + figOnlyLines[0].paperGroup);

// === 21. codex review regressions (task_type / dims guard / PCA / review 색) ==

// --- (a) legacy gemini corpus: task_type must stay absent -------------------
// Simulate a corpus built BEFORE task_type existed: build with stub, then
// hand-edit meta to provider=gemini with NO task_type key. An incremental
// build where every paper skips (no embedding, no API key needed) must NOT
// stamp RETRIEVAL_DOCUMENT into the meta.
console.log("\n[task_type] legacy gemini corpus preservation");
const corpusTT = path.join(work, "corpus_tt");
const inTT = path.join(work, "in_tt");
fs.mkdirSync(inTT, { recursive: true });
fs.writeFileSync(
  path.join(inTT, "tt2020.json"),
  JSON.stringify({
    paper_id: "tt2020",
    source_file: "tt.pdf",
    metadata: { title: "TT", journal: "J", year: 2020 },
    paragraphs: [para("Introduction", 0, "motivation", "Task type preservation test paragraph for the legacy corpus scenario.")],
  })
);
r = run(BUILD, ["--input", inTT, "--group", "own"], { PAO_CORPUS_DIR: corpusTT });
check("tt build (stub) exits 0", r.code === 0, "code=" + r.code);
const ttMetaPath = path.join(corpusTT, "corpus-meta.json");
const ttMeta = json(fs.readFileSync(ttMetaPath, "utf8"));
ttMeta.embedding.provider = "gemini";
ttMeta.embedding.model = "gemini-embedding-001";
delete ttMeta.embedding.task_type; // legacy: key entirely absent
fs.writeFileSync(ttMetaPath, JSON.stringify(ttMeta, null, 2));
r = run(BUILD, ["--input", inTT, "--group", "own"], { PAO_CORPUS_DIR: corpusTT, PAO_EMBED_PROVIDER: "gemini" });
s = json(r.stdout);
check("legacy incremental build exits 0", r.code === 0, "code=" + r.code);
check("legacy incremental build all skipped", s && s.papers_skipped === 1, s && "got " + s.papers_skipped);
const ttMeta2 = json(fs.readFileSync(ttMetaPath, "utf8"));
check(
  "legacy meta task_type stays absent (null) — NOT RETRIEVAL_DOCUMENT",
  ttMeta2 && ttMeta2.embedding && ttMeta2.embedding.task_type == null,
  "got " + JSON.stringify(ttMeta2 && ttMeta2.embedding && ttMeta2.embedding.task_type)
);

// Fresh gemini corpus (no pre-existing meta) records RETRIEVAL_DOCUMENT.
// Empty-text paragraphs -> nothing to embed -> no API call needed.
const corpusTTF = path.join(work, "corpus_ttf");
const inTTF = path.join(work, "in_ttf");
fs.mkdirSync(inTTF, { recursive: true });
fs.writeFileSync(
  path.join(inTTF, "ttf2021.json"),
  JSON.stringify({
    paper_id: "ttf2021",
    source_file: "ttf.pdf",
    metadata: { title: "TTF", journal: "J", year: 2021 },
    paragraphs: [{ section_name: "Introduction", position_in_section: 0, text: "", primary_claim_type: "motivation", moves: [] }],
  })
);
r = run(BUILD, ["--input", inTTF, "--group", "own"], { PAO_CORPUS_DIR: corpusTTF, PAO_EMBED_PROVIDER: "gemini" });
check("fresh gemini build (no embeds) exits 0", r.code === 0, "code=" + r.code);
const ttfMeta = json(fs.readFileSync(path.join(corpusTTF, "corpus-meta.json"), "utf8"));
check(
  "fresh gemini corpus records task_type=RETRIEVAL_DOCUMENT",
  ttfMeta && ttfMeta.embedding && ttfMeta.embedding.task_type === "RETRIEVAL_DOCUMENT",
  "got " + JSON.stringify(ttfMeta && ttfMeta.embedding && ttfMeta.embedding.task_type)
);

// --- (b) corpus/config dims consistency guard --------------------------------
console.log("\n[dims] corpus/config dimension guard (no fixed-3072 assumption)");
const corpusDimsT = path.join(work, "corpus_dims");
r = run(BUILD, ["--input", inTT, "--group", "own"], { PAO_CORPUS_DIR: corpusDimsT, PAO_EMBED_DIMS: "512" });
check("512d build exits 0", r.code === 0, "code=" + r.code);
r = run(RETRIEVE, ["paragraphs", "--query", "task type", "--k", "2"], { PAO_CORPUS_DIR: corpusDimsT, PAO_EMBED_DIMS: "512" });
data = json(r.stdout);
check("retrieve with matching dims (512) exits 0", r.code === 0, "code=" + r.code);
check("retrieve with matching dims returns rows", Array.isArray(data) && data.length > 0);
r = run(RETRIEVE, ["paragraphs", "--query", "task type", "--k", "2"], { PAO_CORPUS_DIR: corpusDimsT, PAO_EMBED_DIMS: "3072" }, true);
check("retrieve with mismatched dims (3072 vs 512) -> exit 1", r.code === 1, "code=" + r.code);
check(
  "mismatch message names corpus dims (512)",
  (r.stderr || "").includes("512") && /dimensions mismatch/i.test(r.stderr || ""),
  "stderr=" + (r.stderr || "").slice(0, 200)
);
// supabase hard 3072 guard removed: non-3072 config must now fail on the
// missing connection string (i.e. it got PAST the old constant-based die).
r = run(
  RETRIEVE,
  ["paragraphs", "--query", "x"],
  { PAO_CORPUS_DIR: corpusDimsT, PAO_EMBED_DIMS: "512", PAO_RAG_MODE: "supabase", DIRECT_URL: "", DATABASE_URL: "" },
  true
);
check("supabase 512d: old 'fixed to vector(3072)' guard is gone", !(r.stderr || "").includes("fixed to vector(3072)"), "stderr=" + (r.stderr || "").slice(0, 200));
check("supabase 512d: fails on missing connection string instead", (r.stderr || "").includes("direct_url"), "stderr=" + (r.stderr || "").slice(0, 200));

// --- (c) PCA downsampling on a large synthetic corpus ------------------------
console.log("\n[report] PCA downsampling (5000 paragraphs)");
const corpusBig = path.join(work, "corpus_big");
const inBig = path.join(work, "in_big");
fs.mkdirSync(inBig, { recursive: true });
const bigParas = [];
for (let i = 0; i < 5000; i++) {
  bigParas.push({
    section_name: i % 2 ? "Results" : "Introduction",
    position_in_section: i,
    text: "Paragraph number " + i + " discusses capacity retention and interphase stability in test cells.",
    primary_claim_type: "evidence",
    moves: [],
  });
}
fs.writeFileSync(
  path.join(inBig, "big2024.json"),
  JSON.stringify({ paper_id: "big2024", source_file: "big.pdf", metadata: { title: "Big", journal: "J", year: 2024 }, paragraphs: bigParas })
);
r = run(BUILD, ["--input", inBig, "--group", "own"], { PAO_CORPUS_DIR: corpusBig });
check("big corpus build exits 0", r.code === 0, "code=" + r.code);
const t0 = Date.now();
r = run(REPORT, [], { PAO_CORPUS_DIR: corpusBig });
const reportMs = Date.now() - t0;
const bigSummary = json(r.stdout);
check("big report exits 0", r.code === 0, "code=" + r.code);
check("big report covers all 5000 paragraphs in summary", bigSummary && bigSummary.paragraphs === 5000, bigSummary && "got " + bigSummary.paragraphs);
const bigHtmlPath = bigSummary && bigSummary.out ? bigSummary.out : path.join(corpusBig, "corpus-report.html");
const bigHtml = fs.existsSync(bigHtmlPath) ? fs.readFileSync(bigHtmlPath, "utf8") : "";
check("big report shows PCA sampling note", bigHtml.includes("PCA 표본"), "note missing");
check(
  "big report sampling note says n=2000 / N=5000",
  bigHtml.includes("n=2000") && bigHtml.includes("N=5000"),
  (bigHtml.match(/PCA 표본[^<]*/) || [])[0]
);
check("big report generated in sane time (<60s incl. node startup)", reportMs < 60000, reportMs + "ms");

// --- (d) review group colors + legend in the report ---------------------------
console.log("\n[report] review group 3-color support");
const figReportHtmlPath = path.join(corpusFig, "corpus-report.html");
// regenerate against the current renderer (corpus_fig has a review paper).
r = run(REPORT, [], figEnv);
check("fig corpus report regenerates", r.code === 0, "code=" + r.code);
const figHtml3 = fs.readFileSync(figReportHtmlPath, "utf8");
check("report legend includes review swatch color #5aa469", figHtml3.includes("#5aa469"));
check("report legend includes review label", figHtml3.includes("review (리뷰)"));
check("report group table includes review row", figHtml3.includes("review 논문"));
check("small corpus report has no PCA sampling note", !figHtml3.includes("PCA 표본"));

// === 22. methodology RAG ======================================================
// Dedicated corpus: own + field paragraph papers, each with a `.figures.json`
// that ALSO carries a top-level `methodology` block (advanced/standard mix, plus
// a technique with a missing category to exercise the warn+default path).
// Exercises methodology ingest, methods search + --technique/--category/--group
// filters, output shape, analysis_pipeline replication, incremental skip /
// --force, not-built guard, backward-compat (figures.json w/o methodology), and
// the report section.
console.log("\n[methodology] dedicated corpus");
const corpusMeth = path.join(work, "corpus_meth");
const inMethOwn = path.join(work, "in_meth_own");
const inMethField = path.join(work, "in_meth_field");
const inMethFigs = path.join(work, "in_meth_figs");
for (const d of [inMethOwn, inMethField, inMethFigs]) fs.mkdirSync(d, { recursive: true });

fs.writeFileSync(
  path.join(inMethOwn, "metha2024.json"),
  JSON.stringify({
    paper_id: "metha2024",
    source_file: "metha.pdf",
    metadata: { title: "Own operando study", journal: "Joule", year: 2024 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "The own paper tracks phase transitions during cycling of a high nickel cathode."),
      para("Results", 0, "evidence", "Operando diffraction revealed a reversible phase transition across the cycle."),
    ],
  })
);
fs.writeFileSync(
  path.join(inMethField, "methb2023.json"),
  JSON.stringify({
    paper_id: "methb2023",
    source_file: "methb.pdf",
    metadata: { title: "Field spectroscopy study", journal: "Nature Energy", year: 2023 },
    lexicon,
    paragraphs: [
      para("Introduction", 0, "motivation", "The field paper probes interfacial chemistry with in situ spectroscopy on cycling."),
      para("Results", 0, "evidence", "In situ Raman resolved the electrolyte decomposition products during cycling."),
    ],
  })
);

// figures.json report carrying a top-level methodology block
function figMethReport(paperId, figures, techniques, pipeline) {
  return {
    paper_id: paperId,
    figures,
    arc_pattern: "concept → proof",
    arc_summary: "Concept then proof.",
    narrative_logic: "concept-then-proof",
    methodology: { techniques, analysis_pipeline: pipeline },
  };
}

fs.writeFileSync(
  path.join(inMethFigs, "metha2024.figures.json"),
  JSON.stringify(
    figMethReport(
      "metha2024",
      [fig("Fig1", 1, 1, ["electrochemical"], "performance", 2, "1x2", [{ label: "a", type: "line", summary: "capacity" }], "Cycling.", "Retention.", "Perf.", [], ["cycling"])],
      [
        { technique: "operando XRD", category: "advanced", purpose: "충방전 중 상전이 실시간 추적", evidence_target: "mechanism: 용량 감쇠가 상전이 비가역성에서 온다는 주장의 직접 근거", figures: ["Fig3"], instrument_notes: "synchrotron beamline" },
        { technique: "SEM", category: "standard", purpose: "입자 형상 확인", evidence_target: "coating morphology", figures: ["Fig1"] },
      ],
      "operando XRD로 상전이를 추적하고 SEM으로 형상을 보조 확인하는 전략."
    )
  )
);
fs.writeFileSync(
  path.join(inMethFigs, "methb2023.figures.json"),
  JSON.stringify(
    figMethReport(
      "methb2023",
      [fig("Fig1", 1, 1, ["morphology"], "morphology", 1, "1x1", [{ label: "a", type: "SEM", summary: "film" }], "Film.", "Coverage.", "Morph.", [], ["film"])],
      [
        { technique: "in situ Raman", category: "advanced", purpose: "계면 반응 실시간 추적", evidence_target: "mechanism: 전해질 분해 경로", figures: ["Fig2"], instrument_notes: "532 nm laser" },
        { technique: "cyclic voltammetry", category: "standard", purpose: "산화환원 거동 확인", evidence_target: "redox reversibility", figures: ["Fig3"] },
        // technique with a MISSING category -> defaults to standard + warns (경고 1줄)
        { technique: "EIS", purpose: "임피던스 측정", evidence_target: "interfacial resistance", figures: ["Fig4"] },
      ],
      "in situ Raman과 CV, EIS로 계면 반응과 임피던스를 교차 확인."
    )
  )
);

const methEnv = { PAO_CORPUS_DIR: corpusMeth };

// build paragraph papers (own/field) so methodology paperGroup resolves
r = run(BUILD, ["--input", inMethOwn, "--group", "own"], methEnv);
check("meth build own exits 0", r.code === 0, "code=" + r.code);
r = run(BUILD, ["--input", inMethField, "--group", "field"], methEnv);
check("meth build field exits 0", r.code === 0, "code=" + r.code);

// methods not built yet -> specific guard message
console.log("\n[methodology] not-built guard");
r = run(RETRIEVE, ["methods", "--query", "phase transition"], methEnv, true);
check("methods (no methodology corpus) -> exit 1", r.code === 1, "code=" + r.code);
check("methods (no methodology corpus) -> guidance",
  (r.stderr || "").includes("methodology corpus 없음"), "stderr=" + (r.stderr || "").slice(0, 160));

// ingest figures + methodology (from the same .figures.json files)
console.log("\n[methodology] ingest");
r = run(BUILD, ["--input", inMethFigs, "--group", "own"], methEnv);
s = json(r.stdout);
check("meth ingest exits 0", r.code === 0, "code=" + r.code);
check("methods_added == 5 (2 + 3)", s && s.methods_added === 5, s && "got " + s.methods_added);
check("figures_added == 2 (co-ingested from same files)", s && s.figures_added === 2, s && "got " + s.figures_added);
check("meth ingest emits missing-category warning for EIS (경고 1줄)",
  s && Array.isArray(s.warnings) && s.warnings.some((w) => /category missing\/invalid/i.test(w) && /EIS/.test(w)),
  s && "warnings=" + JSON.stringify(s && s.warnings));

// methodology.jsonl records + shape
const methLines = fs.readFileSync(path.join(corpusMeth, "methodology.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
check("methodology.jsonl has 5 records", methLines.length === 5, "got " + methLines.length);
check("methodology record carries an 8-dim embedding (stub)",
  methLines.every((m) => Array.isArray(m.embedding) && m.embedding.length === 8));
check("methodology analysis_pipeline replicated onto each record",
  methLines.filter((m) => m.paperId === "metha2024").every((m) => typeof m.analysisPipeline === "string" && m.analysisPipeline.length > 0));
check("methodology figures[] preserved (operando XRD -> Fig3)",
  methLines.some((m) => m.technique === "operando XRD" && Array.isArray(m.figures) && m.figures.includes("Fig3")));
check("EIS technique defaulted to category=standard", methLines.some((m) => m.technique === "EIS" && m.category === "standard"));
check("metha methods paperGroup == own", methLines.filter((m) => m.paperId === "metha2024").every((m) => m.paperGroup === "own"));
check("methb methods paperGroup == field (resolved from paragraph paper, not --group own)",
  methLines.filter((m) => m.paperId === "methb2023").every((m) => m.paperGroup === "field"));

// methods search + output shape
console.log("\n[methodology] search + filters");
r = run(RETRIEVE, ["methods", "--query", "phase transition operando diffraction", "--k", "10"], methEnv);
data = json(r.stdout);
check("methods search exits 0", r.code === 0, "code=" + r.code);
check("methods search returns array", Array.isArray(data) && data.length > 0);
check("methods row shape (output contract)",
  Array.isArray(data) && data.length > 0 &&
    hasKeys(data[0], ["paperId", "technique", "category", "purpose", "evidence_target", "figures", "analysis_pipeline", "similarity"]),
  data && data[0] && "keys=" + Object.keys(data[0] || {}).join(","));
check("methods similarity is number", Array.isArray(data) && typeof data[0]?.similarity === "number");
check("methods figures is array", Array.isArray(data) && Array.isArray(data[0]?.figures));

// --technique (case-insensitive substring)
r = run(RETRIEVE, ["methods", "--query", "diffraction", "--technique", "xrd", "--k", "10"], methEnv);
data = json(r.stdout);
check("methods --technique xrd exits 0", r.code === 0, "code=" + r.code);
check("methods --technique xrd -> only operando XRD (case-insensitive substring)",
  Array.isArray(data) && data.length > 0 && data.every((x) => /xrd/i.test(x.technique)),
  data && "techs=" + JSON.stringify(Array.isArray(data) ? data.map((x) => x.technique) : data));

// --category advanced / standard (exact)
r = run(RETRIEVE, ["methods", "--query", "in situ mechanism", "--category", "advanced", "--k", "10"], methEnv);
data = json(r.stdout);
check("methods --category advanced -> only advanced",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.category === "advanced"),
  data && "cats=" + JSON.stringify(Array.isArray(data) ? data.map((x) => x.category) : data));
r = run(RETRIEVE, ["methods", "--query", "standard technique morphology", "--category", "standard", "--k", "10"], methEnv);
data = json(r.stdout);
check("methods --category standard -> only standard",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.category === "standard"),
  data && "cats=" + JSON.stringify(Array.isArray(data) ? data.map((x) => x.category) : data));

// --group
r = run(RETRIEVE, ["methods", "--query", "cathode", "--group", "own", "--k", "10"], methEnv);
data = json(r.stdout);
check("methods --group own -> only metha2024",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "metha2024"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data));
r = run(RETRIEVE, ["methods", "--query", "electrolyte", "--group", "field", "--k", "10"], methEnv);
data = json(r.stdout);
check("methods --group field -> only methb2023",
  Array.isArray(data) && data.length > 0 && data.every((x) => x.paperId === "methb2023"),
  data && "paperIds=" + (Array.isArray(data) ? [...new Set(data.map((x) => x.paperId))].join(",") : data));

// --category bogus rejected
r = run(RETRIEVE, ["methods", "--query", "x", "--category", "bogus"], methEnv, true);
check("methods --category bogus rejected (exit 1)", r.code === 1, "code=" + r.code);

// incremental skip
console.log("\n[methodology] incremental skip / --force");
r = run(BUILD, ["--input", inMethFigs, "--group", "own"], methEnv);
s = json(r.stdout);
check("meth re-ingest exits 0", r.code === 0, "code=" + r.code);
check("meth re-ingest methods_added == 0", s && s.methods_added === 0, s && "got " + s.methods_added);
check("meth re-ingest methods_skipped == 5", s && s.methods_skipped === 5, s && "got " + s.methods_skipped);
const methLines2 = fs.readFileSync(path.join(corpusMeth, "methodology.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim());
check("methodology.jsonl still 5 records after skip (no dupes)", methLines2.length === 5, "got " + methLines2.length);

// --force re-ingest -> purge + re-add, still 5
r = run(BUILD, ["--input", inMethFigs, "--group", "own", "--force"], methEnv);
s = json(r.stdout);
check("meth --force methods_added == 5", s && s.methods_added === 5, s && "got " + s.methods_added);
const methLines3 = fs.readFileSync(path.join(corpusMeth, "methodology.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim());
check("methodology.jsonl still 5 records after --force (no dupes)", methLines3.length === 5, "got " + methLines3.length);

// methods local-only in supabase mode
console.log("\n[methodology] supabase mode -> local-only exit 1");
r = run(RETRIEVE, ["methods", "--query", "x"], { ...methEnv, PAO_RAG_MODE: "supabase" }, true);
check("methods supabase -> exit 1", r.code === 1, "code=" + r.code);
check("methods supabase -> local-only note", (r.stderr || "").includes("local-only"));

// backward-compat: figures.json WITHOUT a methodology block (corpus_fig) -> figures
// ingested normally, NO methodology.jsonl created, methods query -> guard.
console.log("\n[methodology] backward-compat: figures.json without methodology block");
check("corpus_fig has NO methodology.jsonl (figure-only ingest)",
  !fs.existsSync(path.join(corpusFig, "methodology.jsonl")));
r = run(RETRIEVE, ["methods", "--query", "coating"], figEnv, true);
check("methods on methodology-less corpus -> exit 1 guard", r.code === 1, "code=" + r.code);
check("methods on methodology-less corpus -> guidance", (r.stderr || "").includes("methodology corpus 없음"));

// report block present on the methodology corpus
console.log("\n[report] methodology section present when methodology.jsonl exists");
r = run(REPORT, [], methEnv);
const methReportSummary = json(r.stdout);
check("report (meth corpus) exits 0", r.code === 0, "code=" + r.code);
const methReportPath = methReportSummary && methReportSummary.out ? methReportSummary.out : path.join(corpusMeth, "corpus-report.html");
check("report (meth corpus) HTML exists", methReportSummary && fs.existsSync(methReportPath));
if (methReportSummary && fs.existsSync(methReportPath)) {
  const methHtml = fs.readFileSync(methReportPath, "utf8");
  check("report HTML has methodology section header", methHtml.includes("분석 기법 구성"));
  check("report HTML has advanced 기법 chart", methHtml.includes("advanced 기법 상위"));
  check("report HTML has standard 기법 chart", methHtml.includes("standard 기법 상위"));
  check("report HTML lists a technique name (operando XRD)", methHtml.includes("operando XRD"));
  const methStripped = methHtml.replace(/xmlns(:\w+)?="[^"]*"/g, "");
  check("report (meth corpus) HTML has no external http(s) URL", !/https?:\/\//.test(methStripped),
    "found: " + ((methStripped.match(/https?:\/\/[^\s"'<>]*/) || [])[0] || ""));
}

// report on corpus_fig (no methodology) omits the methodology section
console.log("\n[report] no methodology section on methodology-less corpus");
r = run(REPORT, [], figEnv);
if (r.code === 0) {
  const noMethPath = path.join(corpusFig, "corpus-report.html");
  const noMethHtml = fs.existsSync(noMethPath) ? fs.readFileSync(noMethPath, "utf8") : "";
  check("methodology-less report omits methodology section", !noMethHtml.includes("분석 기법 구성"));
}

// --- cleanup -----------------------------------------------------------------
try { fs.rmSync(work, { recursive: true, force: true }); } catch {}

console.log(`\n=== ${passCount} passed, ${failCount} failed ===`);
process.exit(failCount === 0 ? 0 : 1);
