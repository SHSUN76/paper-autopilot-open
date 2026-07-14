// paper-autopilot-open — provider-abstracted text embeddings.
//
// Output dimensionality is driven by config.embedding.dimensions (default 3072)
// and passed through to each provider — never hard-coded in this module.
//
// Providers:
//   openai — text-embedding-3-large (native `dimensions` param, default 3072)
//   gemini — gemini-embedding-001 (`outputDimensionality`; 3072 is the model's
//            native/default dimension, so no re-normalization is required)
//   stub   — deterministic offline hash embedding (tests only, no network)
//
// gemini free tier exists (rate-limited); openai text-embedding-3-large is
// billed at ~$0.13 / 1M tokens.

const OPENAI_MODEL = "text-embedding-3-large";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/embeddings";
const GEMINI_MODEL = "gemini-embedding-001";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const PROVIDER_MODEL = {
  openai: OPENAI_MODEL,
  gemini: GEMINI_MODEL,
  stub: "stub-hash",
};

export function providerModel(provider) {
  const m = PROVIDER_MODEL[provider];
  if (!m) throw new Error(`Unknown embedding provider: ${provider}`);
  return m;
}

// Deterministic offline embedding for tests: character histogram, L2-normalized.
// Same text -> same vector, so a query embedding is comparable to a stored one.
export function stubEmbed(text, dims) {
  const v = new Array(dims).fill(0);
  const t = String(text).toLowerCase();
  for (let i = 0; i < t.length; i++) v[t.charCodeAt(i) % dims] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function embedOpenAI(texts, dims, apiKey) {
  if (!apiKey) throw new Error("openai embedding requires api_keys.openai in config");
  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: texts, dimensions: dims }),
  });
  if (!res.ok) {
    throw new Error(`openai embeddings failed: ${res.status} ${await res.text()}`);
  }
  const j = await res.json();
  return j.data.map((d) => d.embedding);
}

async function embedGemini(texts, dims, apiKey, taskType) {
  if (!apiKey) throw new Error("gemini embedding requires api_keys.gemini in config");
  // taskType (RETRIEVAL_DOCUMENT for ingest, RETRIEVAL_QUERY for queries) is
  // added to the request body only when provided — omitted keeps legacy behavior.
  const tt = taskType ? { taskType } : {};
  // Single text -> embedContent (documented shape). Batch -> batchEmbedContents.
  if (texts.length === 1) {
    const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:embedContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: texts[0] }] },
        outputDimensionality: dims,
        ...tt,
      }),
    });
    if (!res.ok) {
      throw new Error(`gemini embedContent failed: ${res.status} ${await res.text()}`);
    }
    const j = await res.json();
    return [j.embedding.values];
  }
  const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:batchEmbedContents`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((t) => ({
        model: `models/${GEMINI_MODEL}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: dims,
        ...tt,
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(`gemini batchEmbedContents failed: ${res.status} ${await res.text()}`);
  }
  const j = await res.json();
  return j.embeddings.map((e) => e.values);
}

async function embedChunk(texts, provider, dims, apiKey, taskType) {
  if (provider === "stub") return texts.map((t) => stubEmbed(t, dims));
  if (provider === "openai") return embedOpenAI(texts, dims, apiKey); // openai: no taskType concept
  if (provider === "gemini") return embedGemini(texts, dims, apiKey, taskType);
  throw new Error(`Unknown embedding provider: ${provider}`);
}

// Embed a single text. Returns number[]. `taskType` (gemini-only) is ignored by
// openai/stub. Queries should pass RETRIEVAL_QUERY when the corpus was built
// with a task_type (see retrieve.mjs).
export async function embedOne(text, { provider, dimensions, apiKey, taskType }) {
  const [v] = await embedChunk([text], provider, dimensions, apiKey, taskType);
  return v;
}

// Embed many texts. Returns { vectors: number[][], apiCalls: number }.
// Batches by batchSize (default 100). stub makes 0 API calls. `taskType`
// (gemini-only) is threaded through — ingest passes RETRIEVAL_DOCUMENT.
export async function embedMany(
  texts,
  { provider, dimensions, apiKey, batchSize = 100, onProgress, taskType } = {}
) {
  const vectors = [];
  let apiCalls = 0;
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const vecs = await embedChunk(chunk, provider, dimensions, apiKey, taskType);
    for (const v of vecs) vectors.push(v);
    if (provider !== "stub") apiCalls += 1;
    if (onProgress) onProgress(vectors.length, texts.length);
  }
  return { vectors, apiCalls };
}
