// paper-autopilot-open — group profile computation (style / field).
//
// Produces two corpus artifacts consumed by the writing agents and the
// corpus report:
//   style-profile.json  — own group   → author writing STYLE (voice, hedging,
//                                        claim mix, move transitions, vocabulary)
//   field-profile.json  — field group → domain KNOWLEDGE (years, journals,
//                                        section→claim conventions, method lexicon)
//
// Both are recomputed on every build (see build-corpus.mjs). Empty groups get a
// minimal `{ group, papers: 0, note }` shape so downstream tools can detect them.
//
// A `store` here is the in-memory shape { papers, paragraphs, moves, vocabulary }
// (extra keys ignored). Percentages are numbers rounded to 1 decimal place.

import fs from "node:fs";
import path from "node:path";
import { normalizeSection, normGroup } from "./store.mjs";

const HEDGE_LEVELS = ["none", "mild", "moderate", "strong"];
const TOP_VOCAB_LIMIT = 20;

// Percentage of `n` out of `sum`, rounded to 1 decimal (number, not string).
function pct1(n, sum) {
  if (!sum) return 0;
  return Math.round((n * 1000) / sum) / 10;
}

// Map a free-form voice string onto {active, passive, mixed} (or null).
// Handles corpus variants like "active_we", "active voice", "passive", "mixed".
function classifyVoice(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return null;
  if (s.includes("mixed")) return "mixed";
  if (s.includes("active")) return "active";
  if (s.includes("passive")) return "passive";
  return null;
}

// Distinguishes own / field / review so review papers never leak into the
// own-only style profile (they are knowledge-only).
function groupOf(paper) {
  return normGroup(paper.paperGroup);
}

function paperIdsForGroup(papers, group) {
  return new Set(papers.filter((p) => groupOf(p) === group).map((p) => p.paperId));
}

// Word count for a paragraph — prefer the stored count, fall back to text.
function wordsOf(p) {
  if (Number.isFinite(p.wordCount)) return p.wordCount;
  const t = String(p.text || "").trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

// Aggregate vocabulary rows for the papers in `idSet` into {phrase, category,
// count} entries, sorted by count desc (phrase asc tiebreak). `categories`
// optionally restricts to a set of vocabulary categories.
function aggregateVocab(vocab, idSet, { categories } = {}) {
  const SEP = "\x00";
  const map = new Map();
  for (const v of vocab) {
    if (!idSet.has(v.paperId)) continue;
    if (categories && !categories.includes(v.category)) continue;
    const phrase = v.term;
    if (!phrase) continue;
    const key = `${phrase}${SEP}${v.category}`;
    let g = map.get(key);
    if (!g) {
      g = { phrase, category: v.category, count: 0 };
      map.set(key, g);
    }
    g.count += 1;
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || (a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : 0)
  );
}

// Intra-paragraph move transition matrix, restricted to papers in `idSet`.
// Returns { <from>: { <to>: pct } } with each `from` row summing to ~100.
function computeMoveTransitions(moves, idSet) {
  const byPara = new Map();
  for (const m of moves) {
    if (idSet && !idSet.has(m.paperId)) continue;
    if (!byPara.has(m.paragraphId)) byPara.set(m.paragraphId, []);
    byPara.get(m.paragraphId).push(m);
  }
  const fromCounts = new Map(); // from -> Map(to -> count)
  const fromTotals = new Map(); // from -> total
  for (const ms of byPara.values()) {
    ms.sort((a, b) => a.positionInParagraph - b.positionInParagraph);
    for (let i = 0; i < ms.length - 1; i++) {
      const from = ms[i].moveType;
      const to = ms[i + 1].moveType;
      if (from == null || to == null) continue;
      if (!fromCounts.has(from)) fromCounts.set(from, new Map());
      const tc = fromCounts.get(from);
      tc.set(to, (tc.get(to) || 0) + 1);
      fromTotals.set(from, (fromTotals.get(from) || 0) + 1);
    }
  }
  const out = {};
  for (const [from, tc] of fromCounts) {
    const total = fromTotals.get(from);
    const obj = {};
    for (const [to, n] of [...tc.entries()].sort((a, b) => b[1] - a[1])) {
      obj[to] = pct1(n, total);
    }
    out[from] = obj;
  }
  return out;
}

// ---- style profile (own group) --------------------------------------------
export function computeStyleProfile(store) {
  const ids = paperIdsForGroup(store.papers || [], "own");
  const paras = (store.paragraphs || []).filter((p) => ids.has(p.paperId));
  if (paras.length === 0) {
    return { group: "own", papers: 0, note: "own corpus 비어있음" };
  }
  const papers = (store.papers || []).filter((p) => ids.has(p.paperId));

  // voice distribution
  const voiceCounts = { active: 0, passive: 0, mixed: 0 };
  let voiceTotal = 0;
  for (const p of paras) {
    const c = classifyVoice(p.voice);
    if (c) {
      voiceCounts[c] += 1;
      voiceTotal += 1;
    }
  }
  const voice = {
    active: pct1(voiceCounts.active, voiceTotal),
    passive: pct1(voiceCounts.passive, voiceTotal),
    mixed: pct1(voiceCounts.mixed, voiceTotal),
  };

  // active-"we" rate (over all own paragraphs)
  const weCount = paras.filter((p) => p.hasActiveWe).length;
  const has_active_we_rate = pct1(weCount, paras.length);

  // claim distribution + hedge-by-claim
  const claimTotals = new Map();
  const hedgeByClaim = new Map(); // claim -> { none, mild, moderate, strong, _sum }
  let claimSum = 0;
  for (const p of paras) {
    const claim = p.primaryClaimType;
    if (claim == null) continue;
    claimTotals.set(claim, (claimTotals.get(claim) || 0) + 1);
    claimSum += 1;
    const hl = String(p.hedgeLevel || "").toLowerCase();
    if (HEDGE_LEVELS.includes(hl)) {
      if (!hedgeByClaim.has(claim)) {
        hedgeByClaim.set(claim, { none: 0, mild: 0, moderate: 0, strong: 0, _sum: 0 });
      }
      const h = hedgeByClaim.get(claim);
      h[hl] += 1;
      h._sum += 1;
    }
  }
  const hedge_by_claim = {};
  for (const [claim, h] of hedgeByClaim) {
    hedge_by_claim[claim] = {
      none: pct1(h.none, h._sum),
      mild: pct1(h.mild, h._sum),
      moderate: pct1(h.moderate, h._sum),
      strong: pct1(h.strong, h._sum),
    };
  }
  const claim_distribution = {};
  for (const [claim, n] of [...claimTotals.entries()].sort((a, b) => b[1] - a[1])) {
    claim_distribution[claim] = pct1(n, claimSum);
  }

  const move_transitions = computeMoveTransitions(store.moves || [], ids);

  const totalWords = paras.reduce((s, p) => s + wordsOf(p), 0);
  const avg_paragraph_words = Math.round((totalWords / paras.length) * 10) / 10;

  const top_vocabulary = aggregateVocab(store.vocabulary || [], ids)
    .slice(0, TOP_VOCAB_LIMIT)
    .map((g) => ({ phrase: g.phrase, category: g.category, count: g.count }));

  return {
    group: "own",
    papers: papers.length,
    paragraphs: paras.length,
    voice,
    has_active_we_rate,
    hedge_by_claim,
    claim_distribution,
    move_transitions,
    avg_paragraph_words,
    top_vocabulary,
    generated_at: new Date().toISOString(),
  };
}

// ---- review-papers aggregate (knowledge-only, embedded in field profile) ---
// Domain review papers: a light aggregate for knowledge lookup. No style / claim
// analysis (reviews aren't the author's voice, and are knowledge-only).
function computeReviewBlock(store) {
  const ids = paperIdsForGroup(store.papers || [], "review");
  const papers = (store.papers || []).filter((p) => ids.has(p.paperId));
  const paras = (store.paragraphs || []).filter((p) => ids.has(p.paperId));
  if (papers.length === 0) {
    return { papers: 0, paragraphs: 0, years: { min: null, max: null }, journals: [] };
  }
  const years = papers.map((p) => p.year).filter((y) => Number.isFinite(y));
  const jc = new Map();
  for (const p of papers) {
    if (!p.journal) continue;
    jc.set(p.journal, (jc.get(p.journal) || 0) + 1);
  }
  const journals = [...jc.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name, count]) => ({ name, count }));
  return {
    papers: papers.length,
    paragraphs: paras.length,
    years: years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null },
    journals,
  };
}

// ---- field profile (field group) ------------------------------------------
export function computeFieldProfile(store) {
  const review_papers = computeReviewBlock(store);
  const ids = paperIdsForGroup(store.papers || [], "field");
  const paras = (store.paragraphs || []).filter((p) => ids.has(p.paperId));
  if (paras.length === 0) {
    return { group: "field", papers: 0, note: "field corpus 비어있음", review_papers };
  }
  const papers = (store.papers || []).filter((p) => ids.has(p.paperId));

  // years
  const years = papers.map((p) => p.year).filter((y) => Number.isFinite(y));
  const histogram = {};
  for (const y of years) {
    const key = String(y);
    histogram[key] = (histogram[key] || 0) + 1;
  }
  const yearsObj = years.length
    ? { min: Math.min(...years), max: Math.max(...years), histogram }
    : { min: null, max: null, histogram: {} };

  // journals
  const jc = new Map();
  for (const p of papers) {
    const j = p.journal;
    if (!j) continue;
    jc.set(j, (jc.get(j) || 0) + 1);
  }
  const journals = [...jc.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name, count]) => ({ name, count }));

  // claim-by-section
  const sectionClaims = new Map(); // section -> Map(claim -> count)
  const sectionTotals = new Map();
  for (const p of paras) {
    if (p.primaryClaimType == null) continue;
    const sec = normalizeSection(p.sectionName);
    if (!sectionClaims.has(sec)) sectionClaims.set(sec, new Map());
    const cm = sectionClaims.get(sec);
    cm.set(p.primaryClaimType, (cm.get(p.primaryClaimType) || 0) + 1);
    sectionTotals.set(sec, (sectionTotals.get(sec) || 0) + 1);
  }
  const claim_by_section = {};
  for (const [sec, cm] of sectionClaims) {
    const total = sectionTotals.get(sec);
    const obj = {};
    for (const [claim, n] of [...cm.entries()].sort((a, b) => b[1] - a[1])) {
      obj[claim] = pct1(n, total);
    }
    claim_by_section[sec] = obj;
  }

  const top_method_vocabulary = aggregateVocab(store.vocabulary || [], ids, {
    categories: ["method", "instrument"],
  })
    .slice(0, TOP_VOCAB_LIMIT)
    .map((g) => ({ phrase: g.phrase, count: g.count }));

  const top_vocabulary = aggregateVocab(store.vocabulary || [], ids)
    .slice(0, TOP_VOCAB_LIMIT)
    .map((g) => ({ phrase: g.phrase, category: g.category, count: g.count }));

  return {
    group: "field",
    papers: papers.length,
    paragraphs: paras.length,
    years: yearsObj,
    journals,
    claim_by_section,
    top_method_vocabulary,
    top_vocabulary,
    review_papers,
    generated_at: new Date().toISOString(),
  };
}

// Compute both profiles and write them into the corpus dir. Returns the pair.
export function writeProfiles(dir, store) {
  const style = computeStyleProfile(store);
  const field = computeFieldProfile(store);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "style-profile.json"), JSON.stringify(style, null, 2));
  fs.writeFileSync(path.join(dir, "field-profile.json"), JSON.stringify(field, null, 2));
  return { style, field };
}
