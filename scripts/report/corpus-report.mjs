#!/usr/bin/env node
/**
 * corpus-report.mjs — self-contained HTML relationship report for a local
 * paper-autopilot-open corpus.
 *
 * Reads the local vector store (papers.json + paragraphs.jsonl + moves +
 * vocabulary) and renders ONE fully self-contained .html file — every asset is
 * inline SVG / CSS / JS. Zero external CDN / network / image references.
 *
 * Sections:
 *   1. Paper similarity network  — per-paper mean embedding → cosine edges
 *      (>= threshold) → Fruchterman–Reingold force layout → static SVG.
 *   2. Paragraph 2D map          — all paragraph embeddings → 2-component PCA
 *      via pure-JS power iteration → scatter SVG (colour = group, shape = section).
 *   3. Statistics panels         — group counts, claim/hedge/voice bars,
 *      field year histogram, style-profile summary table.
 *
 * Usage:
 *   node scripts/report/corpus-report.mjs [--out <path>] [--threshold 0.55]
 *
 * Default --out is <corpus_dir>/corpus-report.html. On success prints a summary
 * JSON { papers, paragraphs, edges, out } to stdout.
 */

import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../ingest/config.mjs";
import {
  loadStore,
  normalizeSection,
  cosine,
  loadFigures,
  loadFigureArcs,
} from "../ingest/store.mjs";
import { computeStyleProfile, computeFieldProfile } from "../ingest/profiles.mjs";

// ---- args ------------------------------------------------------------------
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

// ---- constants -------------------------------------------------------------
const COLOR_OWN = "#e8833a";
const COLOR_FIELD = "#4a7fb5";
const NET_W = 820;
const NET_H = 560;
const MAP_W = 820;
const MAP_H = 560;
const SECTION_ORDER = [
  "Introduction",
  "Methods",
  "Results",
  "Discussion",
  "Results+Discussion",
  "Conclusion",
  "Other",
];
const SECTION_SHAPE = {
  Introduction: "circle",
  Methods: "square",
  Results: "triangle",
  Discussion: "diamond",
  "Results+Discussion": "triangle-down",
  Conclusion: "cross",
  Other: "ring",
};

// ---- deterministic PRNG (mulberry32) so output is reproducible --------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- html escaping ---------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---- vector helpers --------------------------------------------------------
function meanVector(vectors) {
  if (!vectors.length) return null;
  const d = vectors[0].length;
  const m = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) m[i] += v[i];
  for (let i = 0; i < d; i++) m[i] /= vectors.length;
  return m;
}

// ---- force-directed layout (Fruchterman–Reingold) -------------------------
function forceLayout(n, edges, { width, height, iterations = 220 }) {
  const rnd = mulberry32(0x9e3779b1);
  const pos = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / Math.max(1, n);
    pos.push({
      x: width / 2 + Math.cos(ang) * (width / 4) + (rnd() - 0.5) * 12,
      y: height / 2 + Math.sin(ang) * (height / 4) + (rnd() - 0.5) * 12,
    });
  }
  if (n <= 1) return pos;

  const area = width * height;
  const k = Math.sqrt(area / n) * 0.72;
  let temp = width / 10;
  const cool = temp / (iterations + 1);

  for (let it = 0; it < iterations; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    // repulsive (all pairs)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rep = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        disp[i].x += ux * rep;
        disp[i].y += uy * rep;
        disp[j].x -= ux * rep;
        disp[j].y -= uy * rep;
      }
    }
    // attractive (edges, weighted by similarity)
    for (const e of edges) {
      let dx = pos[e.a].x - pos[e.b].x;
      let dy = pos[e.a].y - pos[e.b].y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const att = ((dist * dist) / k) * (0.5 + e.sim);
      const ux = dx / dist;
      const uy = dy / dist;
      disp[e.a].x -= ux * att;
      disp[e.a].y -= uy * att;
      disp[e.b].x += ux * att;
      disp[e.b].y += uy * att;
    }
    // displace, capped by temperature, clamped to viewport
    for (let i = 0; i < n; i++) {
      let dx = disp[i].x;
      let dy = disp[i].y;
      let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const lim = Math.min(d, temp);
      pos[i].x += (dx / d) * lim;
      pos[i].y += (dy / d) * lim;
      pos[i].x = Math.max(24, Math.min(width - 24, pos[i].x));
      pos[i].y = Math.max(24, Math.min(height - 24, pos[i].y));
    }
    temp = Math.max(temp - cool, 1);
  }
  return pos;
}

// ---- 2-component PCA via power iteration (no external deps) ----------------
function pca2(vectors, iterations = 60) {
  const n = vectors.length;
  if (n === 0) return [];
  const d = vectors[0].length;

  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i];
  for (let i = 0; i < d; i++) mean[i] /= n;

  // w = X^T X v  where X is the centered data (never materialised).
  function covMul(vec) {
    const out = new Array(d).fill(0);
    for (const v of vectors) {
      let dot = 0;
      for (let i = 0; i < d; i++) dot += (v[i] - mean[i]) * vec[i];
      for (let i = 0; i < d; i++) out[i] += dot * (v[i] - mean[i]);
    }
    return out;
  }
  function normalize(v) {
    let s = 0;
    for (const x of v) s += x * x;
    s = Math.sqrt(s) || 1;
    return v.map((x) => x / s);
  }
  const rnd = mulberry32(0x1b873593);
  function powerIter(orth) {
    let v = normalize(new Array(d).fill(0).map(() => rnd() - 0.5));
    for (let it = 0; it < iterations; it++) {
      let w = covMul(v);
      if (orth) {
        let dot = 0;
        for (let i = 0; i < d; i++) dot += w[i] * orth[i];
        for (let i = 0; i < d; i++) w[i] -= dot * orth[i];
      }
      v = normalize(w);
    }
    return v;
  }
  const pc1 = powerIter(null);
  const pc2 = powerIter(pc1);

  return vectors.map((v) => {
    let x = 0;
    let y = 0;
    for (let i = 0; i < d; i++) {
      const c = v[i] - mean[i];
      x += c * pc1[i];
      y += c * pc2[i];
    }
    return { x, y };
  });
}

// Scale raw coords into a [pad, size-pad] box.
function scaleCoords(coords, w, h, pad) {
  if (!coords.length) return coords;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of coords) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return coords.map((c) => ({
    x: pad + ((c.x - minX) / spanX) * (w - 2 * pad),
    y: pad + ((c.y - minY) / spanY) * (h - 2 * pad),
  }));
}

// ---- SVG marker for a section shape ----------------------------------------
function marker(shape, x, y, s, fill) {
  const cx = x.toFixed(1);
  const cy = y.toFixed(1);
  switch (shape) {
    case "square":
      return `<rect x="${(x - s).toFixed(1)}" y="${(y - s).toFixed(1)}" width="${(2 * s).toFixed(1)}" height="${(2 * s).toFixed(1)}" fill="${fill}" fill-opacity="0.8"/>`;
    case "triangle":
      return `<polygon points="${x.toFixed(1)},${(y - s).toFixed(1)} ${(x - s).toFixed(1)},${(y + s).toFixed(1)} ${(x + s).toFixed(1)},${(y + s).toFixed(1)}" fill="${fill}" fill-opacity="0.8"/>`;
    case "triangle-down":
      return `<polygon points="${x.toFixed(1)},${(y + s).toFixed(1)} ${(x - s).toFixed(1)},${(y - s).toFixed(1)} ${(x + s).toFixed(1)},${(y - s).toFixed(1)}" fill="${fill}" fill-opacity="0.8"/>`;
    case "diamond":
      return `<polygon points="${x.toFixed(1)},${(y - s).toFixed(1)} ${(x + s).toFixed(1)},${cy} ${x.toFixed(1)},${(y + s).toFixed(1)} ${(x - s).toFixed(1)},${cy}" fill="${fill}" fill-opacity="0.8"/>`;
    case "cross":
      return `<path d="M${(x - s).toFixed(1)},${cy} H${(x + s).toFixed(1)} M${cx},${(y - s).toFixed(1)} V${(y + s).toFixed(1)}" stroke="${fill}" stroke-width="2" fill="none"/>`;
    case "ring":
      return `<circle cx="${cx}" cy="${cy}" r="${s.toFixed(1)}" fill="none" stroke="${fill}" stroke-width="1.6"/>`;
    case "circle":
    default:
      return `<circle cx="${cx}" cy="${cy}" r="${s.toFixed(1)}" fill="${fill}" fill-opacity="0.8"/>`;
  }
}

// ---- horizontal bar chart SVG ----------------------------------------------
function barChartSvg(title, rows, color) {
  const w = 380;
  const rowH = 26;
  const labelW = 130;
  const barMax = w - labelW - 52;
  const h = 28 + rows.length * rowH + 8;
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
  let bars = "";
  rows.forEach((r, i) => {
    const y = 28 + i * rowH;
    const bw = Math.max(1, (r.value / max) * barMax);
    bars +=
      `<text x="0" y="${y + 13}" class="bl">${esc(r.label)}</text>` +
      `<rect x="${labelW}" y="${y + 3}" width="${bw.toFixed(1)}" height="16" rx="2" fill="${color}"/>` +
      `<text x="${labelW + bw + 6}" y="${y + 16}" class="bv">${esc(r.display != null ? r.display : r.value)}</text>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">` +
    `<text x="0" y="16" class="ct">${esc(title)}</text>${bars}</svg>`
  );
}

// ===========================================================================
// MAIN
// ===========================================================================
function main() {
  const config = loadConfig();
  const dir = config.rag.local_corpus_dir;

  let store;
  try {
    store = loadStore(dir);
  } catch (e) {
    console.error("corpus를 먼저 빌드하세요 (build-corpus.mjs)");
    console.error("  " + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }

  const threshold = Number.isFinite(parseFloat(opts.threshold))
    ? parseFloat(opts.threshold)
    : 0.55;
  const outPath =
    typeof opts.out === "string" && opts.out
      ? opts.out
      : path.join(dir, "corpus-report.html");

  const styleProfile = computeStyleProfile(store);
  const fieldProfile = computeFieldProfile(store);

  // ---- per-paper aggregation ----------------------------------------------
  const paraByPaper = new Map();
  for (const p of store.paragraphs) {
    if (!paraByPaper.has(p.paperId)) paraByPaper.set(p.paperId, []);
    paraByPaper.get(p.paperId).push(p);
  }

  const nodes = store.papers.map((paper) => {
    const paras = paraByPaper.get(paper.paperId) || [];
    const embs = paras.map((p) => p.embedding).filter((e) => Array.isArray(e) && e.length);
    return {
      id: paper.paperId,
      group: paper.paperGroup === "field" ? "field" : "own",
      title: paper.title || null,
      year: paper.year ?? null,
      journal: paper.journal || null,
      paraCount: paras.length,
      mean: meanVector(embs),
    };
  });

  // ---- similarity edges ----------------------------------------------------
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (!nodes[i].mean || !nodes[j].mean) continue;
      const sim = cosine(nodes[i].mean, nodes[j].mean);
      if (sim >= threshold) edges.push({ a: i, b: j, sim });
    }
  }

  const pos = forceLayout(nodes.length, edges, { width: NET_W, height: NET_H });

  // ---- network SVG ---------------------------------------------------------
  const networkSvg = renderNetwork(nodes, edges, pos, threshold);

  // ---- paragraph 2D map ----------------------------------------------------
  const mapParas = store.paragraphs.filter((p) => Array.isArray(p.embedding) && p.embedding.length);
  const mapSvg = renderParagraphMap(mapParas, store);

  // ---- statistics ----------------------------------------------------------
  const statsHtml = renderStats(store, styleProfile, fieldProfile);

  // ---- figure-set section (only when a figure corpus exists) ---------------
  const figures = loadFigures(dir);
  const figureArcs = loadFigureArcs(dir);
  const figuresHtml = figures.length ? renderFigures(figures, figureArcs) : null;

  // ---- assemble ------------------------------------------------------------
  const provider = (store.meta && store.meta.embedding) || {};
  const nowIso = new Date().toISOString();
  const kst = kstStamp(new Date());
  const html = renderPage({
    dir,
    nowIso,
    kst,
    provider,
    counts: store.meta ? store.meta.counts : {},
    groups: store.meta ? store.meta.paper_groups : {},
    threshold,
    networkSvg,
    mapSvg,
    statsHtml,
    figuresHtml,
    edgeCount: edges.length,
    mapCount: mapParas.length,
    figureCount: figures.length,
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);

  console.log(
    JSON.stringify(
      {
        papers: store.papers.length,
        paragraphs: store.paragraphs.length,
        edges: edges.length,
        out: outPath,
      },
      null,
      2
    )
  );
}

// KST (UTC+9) timestamp — vault convention is Korean Standard Time.
function kstStamp(date) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} KST`;
}

function renderNetwork(nodes, edges, pos, threshold) {
  let edgeSvg = "";
  for (const e of edges) {
    const t = threshold >= 1 ? 1 : (e.sim - threshold) / (1 - threshold);
    const sw = (0.5 + Math.max(0, Math.min(1, t)) * 4).toFixed(2);
    edgeSvg += `<line x1="${pos[e.a].x.toFixed(1)}" y1="${pos[e.a].y.toFixed(1)}" x2="${pos[e.b].x.toFixed(1)}" y2="${pos[e.b].y.toFixed(1)}" stroke="#c8ccd2" stroke-width="${sw}" stroke-opacity="0.7"/>`;
  }
  let nodeSvg = "";
  nodes.forEach((n, i) => {
    const r = Math.max(6, Math.min(26, 5 + Math.sqrt(n.paraCount) * 2.4));
    const fill = n.group === "own" ? COLOR_OWN : COLOR_FIELD;
    const label = n.title ? n.title.slice(0, 30) : n.id;
    const tip = `${n.id}${n.title ? " — " + n.title : ""} (${n.group}, ${n.paraCount} paras${n.year ? ", " + n.year : ""})`;
    nodeSvg +=
      `<g class="node">` +
      `<circle cx="${pos[i].x.toFixed(1)}" cy="${pos[i].y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" fill-opacity="0.9" stroke="#fff" stroke-width="1.5"><title>${esc(tip)}</title></circle>` +
      `<text x="${pos[i].x.toFixed(1)}" y="${(pos[i].y + r + 11).toFixed(1)}" class="nl" text-anchor="middle">${esc(label)}</text>` +
      `</g>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${NET_W}" height="${NET_H}" viewBox="0 0 ${NET_W} ${NET_H}" class="graph" role="img" aria-label="paper similarity network">` +
    `<g class="edges">${edgeSvg}</g><g class="nodes">${nodeSvg}</g></svg>`
  );
}

function renderParagraphMap(mapParas, store) {
  if (mapParas.length === 0) {
    return `<p class="empty">임베딩된 문단이 없어 지도를 그릴 수 없습니다.</p>`;
  }
  const groupByPaper = new Map(store.papers.map((p) => [p.paperId, p.paperGroup === "field" ? "field" : "own"]));
  const raw = pca2(mapParas.map((p) => p.embedding));
  const scaled = scaleCoords(raw, MAP_W, MAP_H, 30);
  let pts = "";
  const usedSections = new Set();
  mapParas.forEach((p, i) => {
    const sec = normalizeSection(p.sectionName);
    usedSections.add(sec);
    const shape = SECTION_SHAPE[sec] || "circle";
    const grp = groupByPaper.get(p.paperId) || "own";
    const fill = grp === "own" ? COLOR_OWN : COLOR_FIELD;
    const tip = `${p.paperId} · ${sec}${p.primaryClaimType ? " · " + p.primaryClaimType : ""}`;
    pts += `<g><title>${esc(tip)}</title>${marker(shape, scaled[i].x, scaled[i].y, 4.5, fill)}</g>`;
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}" class="graph" role="img" aria-label="paragraph 2D map">` +
    `<g>${pts}</g></svg>` +
    sectionLegend(usedSections)
  );
}

function sectionLegend(usedSections) {
  const items = SECTION_ORDER.filter((s) => usedSections.has(s)).map((s) => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">${marker(SECTION_SHAPE[s] || "circle", 9, 9, 5.5, "#555")}</svg>`;
    return `<span class="legend-item">${svg}${esc(s)}</span>`;
  });
  const groupItems =
    `<span class="legend-item"><span class="swatch" style="background:${COLOR_OWN}"></span>own (본인)</span>` +
    `<span class="legend-item"><span class="swatch" style="background:${COLOR_FIELD}"></span>field (분야)</span>`;
  return `<div class="legend"><strong>그룹</strong> ${groupItems} &nbsp;&nbsp; <strong>섹션</strong> ${items.join(" ")}</div>`;
}

function renderStats(store, styleProfile, fieldProfile) {
  // corpus-wide distributions
  const claimCounts = new Map();
  const hedgeCounts = { none: 0, mild: 0, moderate: 0, strong: 0 };
  const voiceCounts = { active: 0, passive: 0, mixed: 0 };
  for (const p of store.paragraphs) {
    if (p.primaryClaimType != null) claimCounts.set(p.primaryClaimType, (claimCounts.get(p.primaryClaimType) || 0) + 1);
    const hl = String(p.hedgeLevel || "").toLowerCase();
    if (hl in hedgeCounts) hedgeCounts[hl] += 1;
    const vv = String(p.voice || "").toLowerCase();
    if (vv.includes("mixed")) voiceCounts.mixed += 1;
    else if (vv.includes("active")) voiceCounts.active += 1;
    else if (vv.includes("passive")) voiceCounts.passive += 1;
  }
  const claimRows = [...claimCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({ label, value }));
  const hedgeRows = ["none", "mild", "moderate", "strong"].map((k) => ({ label: k, value: hedgeCounts[k] }));
  const voiceRows = ["active", "passive", "mixed"].map((k) => ({ label: k, value: voiceCounts[k] }));

  const claimChart = barChartSvg("claim 분포 (전체)", claimRows, "#6a8fc0");
  const hedgeChart = barChartSvg("hedge 분포 (전체)", hedgeRows, "#8ab06a");
  const voiceChart = barChartSvg("voice 분포 (전체)", voiceRows, "#c0846a");

  // field year histogram
  let yearChart = `<p class="empty">field 그룹 연도 정보 없음</p>`;
  if (fieldProfile.years && fieldProfile.years.histogram && Object.keys(fieldProfile.years.histogram).length) {
    const yr = Object.entries(fieldProfile.years.histogram)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([label, value]) => ({ label, value }));
    yearChart = barChartSvg("field 연도 히스토그램", yr, "#4a7fb5");
  }

  // style-profile summary table
  let styleTable = `<p class="empty">own(style) 프로파일 비어있음</p>`;
  if (styleProfile.voice) {
    const topClaims = Object.entries(styleProfile.claim_distribution || {})
      .slice(0, 3)
      .map(([c, p]) => `${esc(c)} ${p}%`)
      .join(", ");
    styleTable =
      `<table class="kv">` +
      `<tr><th>own 논문 / 문단</th><td>${styleProfile.papers} / ${styleProfile.paragraphs}</td></tr>` +
      `<tr><th>voice (active / passive / mixed)</th><td>${styleProfile.voice.active}% / ${styleProfile.voice.passive}% / ${styleProfile.voice.mixed}%</td></tr>` +
      `<tr><th>active "we" 비율</th><td>${styleProfile.has_active_we_rate}%</td></tr>` +
      `<tr><th>평균 문단 단어수</th><td>${styleProfile.avg_paragraph_words}</td></tr>` +
      `<tr><th>상위 claim</th><td>${topClaims || "—"}</td></tr>` +
      `</table>`;
  }

  // journals (field)
  let journalTable = `<p class="empty">field 저널 정보 없음</p>`;
  if (Array.isArray(fieldProfile.journals) && fieldProfile.journals.length) {
    const rows = fieldProfile.journals
      .slice(0, 10)
      .map((j) => `<tr><th>${esc(j.name)}</th><td>${j.count}</td></tr>`)
      .join("");
    journalTable = `<table class="kv">${rows}</table>`;
  }

  const g = store.meta ? store.meta.paper_groups || {} : {};
  const c = store.meta ? store.meta.counts || {} : {};
  const groupTable =
    `<table class="kv">` +
    `<tr><th>own 논문</th><td>${g.own || 0}</td></tr>` +
    `<tr><th>field 논문</th><td>${g.field || 0}</td></tr>` +
    `<tr><th>총 문단</th><td>${c.paragraphs || 0}</td></tr>` +
    `<tr><th>총 moves</th><td>${c.moves || 0}</td></tr>` +
    `<tr><th>vocabulary</th><td>${c.vocabulary || 0}</td></tr>` +
    `<tr><th>ai-tell</th><td>${c.aitells || 0}</td></tr>` +
    `</table>`;

  return (
    `<div class="grid">` +
    `<div class="card"><h3>그룹 요약</h3>${groupTable}</div>` +
    `<div class="card"><h3>style-profile 요약 (own)</h3>${styleTable}</div>` +
    `<div class="card"><h3>${claimChart}</h3></div>` +
    `<div class="card"><h3>${hedgeChart}</h3></div>` +
    `<div class="card"><h3>${voiceChart}</h3></div>` +
    `<div class="card"><h3>${yearChart}</h3></div>` +
    `<div class="card"><h3>field 저널 분포</h3>${journalTable}</div>` +
    `</div>`
  );
}

// ---- figure-set section ----------------------------------------------------
function renderFigures(figures, figureArcs) {
  // figure_type distribution (a figure can carry multiple types)
  const typeCounts = new Map();
  const roleCounts = new Map();
  for (const f of figures) {
    for (const t of Array.isArray(f.figureType) ? f.figureType : []) {
      if (t) typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    }
    const role = f.narrativeRole || "(none)";
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }
  const typeRows = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 12)
    .map(([label, value]) => ({ label, value }));
  const roleRows = [...roleCounts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([label, value]) => ({ label, value }));

  const typeChart = typeRows.length
    ? barChartSvg("figure_type 분포", typeRows, "#8a6ac0")
    : `<p class="empty">figure_type 정보 없음</p>`;
  const roleChart = roleRows.length
    ? barChartSvg("narrative_role 분포", roleRows, "#6ac0a0")
    : `<p class="empty">narrative_role 정보 없음</p>`;

  // arc table (paperId | group | arc_pattern)
  let arcTable = `<p class="empty">아크 정보 없음</p>`;
  if (Array.isArray(figureArcs) && figureArcs.length) {
    const rows = figureArcs
      .map(
        (a) =>
          `<tr><td class="mono">${esc(a.paperId)}</td><td>${esc(a.group || "")}</td>` +
          `<td>${esc(a.arcPattern || "—")}</td></tr>`
      )
      .join("");
    arcTable =
      `<div class="scroll"><table class="arc">` +
      `<thead><tr><th>paperId</th><th>group</th><th>arc_pattern</th></tr></thead>` +
      `<tbody>${rows}</tbody></table></div>`;
  }

  return (
    `<div class="grid">` +
    `<div class="card"><h3>${typeChart}</h3></div>` +
    `<div class="card"><h3>${roleChart}</h3></div>` +
    `</div>` +
    `<h3 class="subh">아크 구성 (figure-arcs)</h3>${arcTable}`
  );
}

function renderPage(ctx) {
  const {
    dir, nowIso, kst, provider, counts, groups, threshold,
    networkSvg, mapSvg, statsHtml, figuresHtml, edgeCount, mapCount, figureCount,
  } = ctx;
  const css = `
:root{--fg:#23272e;--muted:#6b7280;--line:#e4e7eb;--bg:#f7f8fa;--card:#fff;}
*{box-sizing:border-box;}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:var(--fg);background:var(--bg);line-height:1.5;}
header{background:#20242b;color:#f2f4f7;padding:22px 28px;}
header h1{margin:0 0 6px;font-size:20px;font-weight:650;}
header .meta{font-size:12.5px;color:#aab2bd;word-break:break-all;}
header .meta b{color:#dfe4ea;font-weight:600;}
main{max-width:1100px;margin:0 auto;padding:24px 20px 60px;}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:0 0 22px;}
section>h2{margin:0 0 4px;font-size:16px;}
section>.hint{margin:0 0 14px;color:var(--muted);font-size:12.5px;}
.graph{width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fcfcfd;}
.nl{font-size:9.5px;fill:#3a3f47;}
.bl{font-size:12px;fill:#3a3f47;}
.bv{font-size:11px;fill:#6b7280;}
.ct{font-size:12.5px;font-weight:600;fill:#23272e;}
.legend{margin-top:10px;font-size:12px;color:#4b5563;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;}
.legend-item{display:inline-flex;align-items:center;gap:4px;}
.legend .swatch{width:12px;height:12px;border-radius:3px;display:inline-block;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;}
.card{border:1px solid var(--line);border-radius:8px;padding:14px 16px;background:#fff;}
.card h3{margin:0 0 8px;font-size:13px;font-weight:600;}
.card h3 svg{display:block;}
table.kv{width:100%;border-collapse:collapse;font-size:12.5px;}
table.kv th{text-align:left;font-weight:500;color:#4b5563;padding:3px 8px 3px 0;vertical-align:top;}
table.kv td{text-align:right;padding:3px 0;font-variant-numeric:tabular-nums;}
.empty{color:var(--muted);font-size:12.5px;font-style:italic;margin:4px 0;}
.scroll{overflow-x:auto;}
.subh{margin:18px 0 8px;font-size:13px;font-weight:600;}
table.arc{width:100%;border-collapse:collapse;font-size:12px;min-width:520px;}
table.arc th{text-align:left;font-weight:600;color:#4b5563;padding:5px 10px;border-bottom:2px solid var(--line);}
table.arc td{padding:5px 10px;border-bottom:1px solid var(--line);vertical-align:top;}
table.arc td.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;}
footer{max-width:1100px;margin:0 auto;padding:0 20px 40px;color:var(--muted);font-size:11.5px;}
.node:hover circle{stroke:#20242b;stroke-width:2;}
`;
  const js = `
document.querySelectorAll('.graph g > *').forEach(function(el){
  el.addEventListener('mouseenter',function(){ el.parentNode.appendChild(el); });
});
`;
  return (
    "<!doctype html>\n" +
    '<html lang="ko"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    "<title>Corpus 관계도 리포트 — paper-autopilot-open</title>" +
    `<style>${css}</style></head><body>` +
    `<header><h1>Corpus 관계도 리포트</h1>` +
    `<div class="meta">` +
    `생성: <b>${esc(kst)}</b> (<span>${esc(nowIso)}</span>) &nbsp;·&nbsp; ` +
    `임베딩: <b>${esc(provider.provider || "?")}</b> / ${esc(provider.model || "?")} / ${esc(String(provider.dimensions || "?"))}d &nbsp;·&nbsp; ` +
    `유사도 임계값: <b>${threshold}</b><br/>` +
    `corpus: <b>${esc(dir)}</b>` +
    `</div></header><main>` +
    `<section><h2>1. 논문 유사도 네트워크</h2>` +
    `<p class="hint">노드 = 논문(색: own=주황 / field=파랑, 크기 ∝ 문단수), 엣지 = 논문 평균 임베딩 cosine ≥ ${threshold} (두께 ∝ 유사도). 엣지 ${edgeCount}개.</p>` +
    `<div class="scroll">${networkSvg}</div></section>` +
    `<section><h2>2. 문단 2D 지도 (PCA)</h2>` +
    `<p class="hint">전체 문단 임베딩을 2-성분 PCA(power iteration)로 투영. 색 = 그룹, 모양 = 섹션. 문단 ${mapCount}개.</p>` +
    `<div class="scroll">${mapSvg}</div></section>` +
    `<section><h2>3. 통계 패널</h2>` +
    `<p class="hint">claim / hedge / voice 분포(전체), field 연도 히스토그램, style-profile 요약.</p>` +
    `${statsHtml}</section>` +
    (figuresHtml
      ? `<section><h2>4. Figure 구성 분석 (figure-set RAG)</h2>` +
          `<p class="hint">figure_type / narrative_role 분포와 논문별 아크 구성. figure ${figureCount || 0}개.</p>` +
          `${figuresHtml}</section>`
      : "") +
    `</main>` +
    `<footer>paper-autopilot-open · corpus-report.mjs · 논문 ${counts && counts.papers != null ? counts.papers : "?"}편 / 문단 ${counts && counts.paragraphs != null ? counts.paragraphs : "?"}개 (own ${groups && groups.own || 0} · field ${groups && groups.field || 0}) · 완전 self-contained (외부 네트워크 참조 없음)</footer>` +
    `<script>${js}</script>` +
    `</body></html>\n`
  );
}

main();
