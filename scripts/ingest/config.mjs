// paper-autopilot-open — shared config loader.
//
// Reads ~/.claude/paper-autopilot-open/config.json (HOME || USERPROFILE).
// Embedding API keys resolve with a 3-tier fallback (see providerApiKey):
//   (1) config.json api_keys → (2) scripts/.env → (3) process.env.
//
// Env overrides (all optional):
//   PAO_CONFIG         — absolute path to a config.json (takes priority)
//   PAO_CORPUS_DIR     — overrides rag.local_corpus_dir
//   PAO_RAG_MODE       — overrides rag.mode (local|supabase|disabled)
//   PAO_EMBED_PROVIDER — overrides embedding.provider
//   PAO_EMBED_DIMS     — overrides embedding.dimensions

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, ".."); // .../scripts

const HOME = process.env.HOME || process.env.USERPROFILE || os.homedir() || "";

export function homeDir() {
  return HOME;
}

// Expand a leading ~ to the home directory (cross-platform).
export function expandHome(p) {
  if (!p || typeof p !== "string") return p;
  if (p === "~") return HOME;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(HOME, p.slice(2));
  return p;
}

function configCandidates() {
  const list = [];
  if (process.env.PAO_CONFIG) list.push(process.env.PAO_CONFIG);
  list.push(path.join(HOME, ".claude", "paper-autopilot-open", "config.json"));
  list.push(path.join(HOME, ".config", "paper-autopilot-open", "config.json"));
  return list;
}

// Load and normalize the plugin config into a stable shape with defaults.
// Missing config file is tolerated (returns defaults); malformed JSON throws.
export function loadConfig() {
  let raw = {};
  let usedPath = null;
  for (const p of configCandidates()) {
    if (p && fs.existsSync(p)) {
      raw = JSON.parse(fs.readFileSync(p, "utf8"));
      usedPath = p;
      break;
    }
  }

  const rag = raw.rag || {};
  const embedding = raw.embedding || {};
  const localDir =
    process.env.PAO_CORPUS_DIR ||
    rag.local_corpus_dir ||
    path.join(HOME, ".claude", "paper-autopilot-open", "corpus");

  return {
    _path: usedPath,
    rag: {
      mode: process.env.PAO_RAG_MODE || rag.mode || "local",
      local_corpus_dir: expandHome(localDir),
      supabase: rag.supabase || {},
    },
    embedding: {
      provider: process.env.PAO_EMBED_PROVIDER || embedding.provider || "gemini",
      dimensions: parseInt(
        process.env.PAO_EMBED_DIMS || embedding.dimensions || 3072,
        10
      ),
    },
    api_keys: raw.api_keys || {},
  };
}

// Minimal manual .env parser (no dotenv dependency). Mirrors the pattern used
// by scripts/parse/storm_parse.py. Never throws — returns {} on any problem.
function loadEnvFile(p) {
  const out = {};
  try {
    const txt = fs.readFileSync(p, "utf8");
    for (let line of txt.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (key) out[key] = val;
    }
  } catch {
    /* .env is optional */
  }
  return out;
}

const ENV_KEY_BY_PROVIDER = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };

// Resolve the API key for a given embedding provider with a 3-tier fallback:
//   (1) config.json  -> api_keys.<provider>
//   (2) scripts/.env -> GEMINI_API_KEY / OPENAI_API_KEY  (manual parser)
//   (3) process.env  -> GEMINI_API_KEY / OPENAI_API_KEY
// stub / disabled providers need no key and return null.
export function providerApiKey(config, provider) {
  // (1) config.json api_keys
  const fromConfig =
    provider === "openai"
      ? config.api_keys.openai
      : provider === "gemini"
      ? config.api_keys.gemini
      : null;
  if (fromConfig) return fromConfig;

  const envKey = ENV_KEY_BY_PROVIDER[provider];
  if (!envKey) return null; // stub / disabled

  // (2) scripts/.env (checked first) then repo-root/.env
  for (const p of [
    path.join(SCRIPTS_DIR, ".env"),
    path.join(SCRIPTS_DIR, "..", ".env"),
  ]) {
    const env = loadEnvFile(p);
    if (env[envKey]) return env[envKey];
  }

  // (3) process environment
  if (process.env[envKey]) return process.env[envKey];

  return null;
}
