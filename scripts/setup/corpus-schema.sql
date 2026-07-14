-- =====================================================================
-- paper-autopilot-open — standalone writing-corpus schema (Supabase mode)
--
-- Run ONCE in a fresh Supabase project (SQL Editor) or via:
--   psql "$DIRECT_URL" -f corpus-schema.sql
--
-- This is the OPTIONAL supabase backend. The default backend is the local
-- vector store (no database required) — see scripts/ingest/build-corpus.mjs.
--
-- Access model: this schema assumes connections are made with the Supabase
-- SERVICE ROLE key (server-side, full access). It deliberately does NOT
-- enable Row Level Security, define auth policies, or reference a User table.
-- Do not expose these tables to the anon/public API.
--
-- Idempotent: every object uses IF NOT EXISTS / OR REPLACE. Safe to re-run.
-- =====================================================================

BEGIN;

-- 1. Extensions ---------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- 2. Tables -------------------------------------------------------------
-- Minimal CorpusPaper (FK target). The open ingester populates a subset of
-- columns; the rest are optional and default to NULL.
CREATE TABLE IF NOT EXISTS "CorpusPaper" (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paperId"              TEXT UNIQUE NOT NULL,
  title                  TEXT NOT NULL DEFAULT 'Untitled',
  journal                TEXT NOT NULL DEFAULT 'Unknown',
  year                   INTEGER NOT NULL DEFAULT 0,
  doi                    TEXT,
  subdomain              TEXT,
  "sourceFile"           TEXT,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "CorpusSection" (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paperId"       TEXT NOT NULL REFERENCES "CorpusPaper"("paperId") ON DELETE CASCADE,
  type            TEXT NOT NULL,
  name            TEXT NOT NULL,
  "orderInPaper"  INTEGER NOT NULL,
  "wordCount"     INTEGER,
  voice           TEXT,
  "tensePattern"  TEXT,
  text            TEXT,
  embedding       vector(3072)
);

CREATE TABLE IF NOT EXISTS "CorpusParagraph" (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paperId"           TEXT NOT NULL REFERENCES "CorpusPaper"("paperId") ON DELETE CASCADE,
  "sectionId"         TEXT NOT NULL REFERENCES "CorpusSection"(id) ON DELETE CASCADE,
  "positionInSection" INTEGER NOT NULL,
  "globalIndex"       INTEGER NOT NULL,
  text                TEXT NOT NULL,
  "wordCount"         INTEGER,
  voice               TEXT,
  "hedgeLevel"        TEXT,
  "tensePattern"      TEXT,
  "hasActiveWe"       BOOLEAN NOT NULL DEFAULT FALSE,
  "primaryClaimType"  TEXT,
  "citesCount"        INTEGER NOT NULL DEFAULT 0,
  "refsFigures"       TEXT[] NOT NULL DEFAULT '{}',
  "refsEquations"     TEXT[] NOT NULL DEFAULT '{}',
  "refsTables"        TEXT[] NOT NULL DEFAULT '{}',
  "refsPriorWork"     INTEGER NOT NULL DEFAULT 0,
  "aiTellPhrases"     TEXT[] NOT NULL DEFAULT '{}',
  embedding           vector(3072)
);

CREATE TABLE IF NOT EXISTS "CorpusMove" (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paragraphId"         TEXT NOT NULL REFERENCES "CorpusParagraph"(id) ON DELETE CASCADE,
  "moveType"            TEXT NOT NULL,
  "positionInParagraph" INTEGER NOT NULL,
  "textSpan"            TEXT NOT NULL,
  "precedingMoveId"     TEXT,
  "followingMoveId"     TEXT
);

CREATE TABLE IF NOT EXISTS "CorpusVocabulary" (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paperId"             TEXT NOT NULL REFERENCES "CorpusPaper"("paperId") ON DELETE CASCADE,
  category              TEXT NOT NULL,
  phrase                TEXT NOT NULL,
  expansion             TEXT,
  context               TEXT,
  "countInPaper"        INTEGER NOT NULL DEFAULT 1,
  "firstUseSection"     TEXT,
  "isDefinedAtFirstUse" BOOLEAN
);

CREATE TABLE IF NOT EXISTS "CorpusAiTell" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "paperId"     TEXT NOT NULL REFERENCES "CorpusPaper"("paperId") ON DELETE CASCADE,
  phrase        TEXT NOT NULL,
  section       TEXT,
  context       TEXT NOT NULL,
  rationale     TEXT,
  "userVerdict" TEXT
);

-- Single-row table recording which embedding provider/model/dimensions this
-- corpus was built with. The ingester upserts it and refuses to mix providers;
-- retrieve.mjs reads it to enforce query/corpus embedding consistency.
CREATE TABLE IF NOT EXISTS "CorpusMeta" (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  provider     TEXT,
  model        TEXT,
  dimensions   INTEGER,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT corpus_meta_singleton CHECK (id = 1)
);

-- 3. Indexes ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS corpus_paper_journal_idx     ON "CorpusPaper" (journal);
CREATE INDEX IF NOT EXISTS corpus_paper_year_idx        ON "CorpusPaper" (year);

CREATE INDEX IF NOT EXISTS corpus_section_paper_idx     ON "CorpusSection" ("paperId");
CREATE INDEX IF NOT EXISTS corpus_section_type_idx      ON "CorpusSection" (type);

CREATE INDEX IF NOT EXISTS corpus_paragraph_paper_idx   ON "CorpusParagraph" ("paperId");
CREATE INDEX IF NOT EXISTS corpus_paragraph_section_idx ON "CorpusParagraph" ("sectionId");
CREATE INDEX IF NOT EXISTS corpus_paragraph_claim_idx   ON "CorpusParagraph" ("primaryClaimType");
CREATE INDEX IF NOT EXISTS corpus_paragraph_voice_idx   ON "CorpusParagraph" (voice);
CREATE INDEX IF NOT EXISTS corpus_paragraph_hedge_idx   ON "CorpusParagraph" ("hedgeLevel");

CREATE INDEX IF NOT EXISTS corpus_move_paragraph_idx    ON "CorpusMove" ("paragraphId");
CREATE INDEX IF NOT EXISTS corpus_move_type_idx         ON "CorpusMove" ("moveType");

CREATE INDEX IF NOT EXISTS corpus_vocabulary_paper_idx    ON "CorpusVocabulary" ("paperId");
CREATE INDEX IF NOT EXISTS corpus_vocabulary_category_idx ON "CorpusVocabulary" (category);
CREATE INDEX IF NOT EXISTS corpus_vocabulary_phrase_idx   ON "CorpusVocabulary" (phrase);
CREATE INDEX IF NOT EXISTS corpus_vocabulary_phrase_trgm  ON "CorpusVocabulary" USING GIN (phrase gin_trgm_ops);

CREATE INDEX IF NOT EXISTS corpus_aitell_paper_idx      ON "CorpusAiTell" ("paperId");
CREATE INDEX IF NOT EXISTS corpus_aitell_phrase_idx     ON "CorpusAiTell" (phrase);

-- NOTE: 기존 vector(1024) 구스키마의 업그레이드는 전체 재적재 필요 — CREATE TABLE IF NOT EXISTS는 기존 컬럼 차원을 바꾸지 않는다.

-- Vector cosine search index.
-- NOTE: embeddings are vector(3072). pgvector's HNSW/IVFFlat indexes only
-- support up to 2000 dimensions, so a vector(3072) column CANNOT be HNSW-indexed
-- directly — the CREATE INDEX ... USING hnsw statements are intentionally
-- omitted here. For a small corpus (a few thousand paragraphs) an exact
-- sequential scan of the cosine distance is fast enough and is what runs by
-- default. For a large corpus, cast to halfvec(3072) (which HNSW supports up to
-- 4000 dims) and index the cast expression, e.g.:
--
--   CREATE INDEX IF NOT EXISTS corpus_paragraph_embedding_halfvec_hnsw
--     ON "CorpusParagraph" USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
--
-- (then query with `embedding::halfvec(3072) <=> $1::halfvec(3072)`).

-- 4. Updated-at trigger for CorpusPaper --------------------------------
CREATE OR REPLACE FUNCTION public.pao_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS corpus_paper_updated_at ON "CorpusPaper";
CREATE TRIGGER corpus_paper_updated_at
  BEFORE UPDATE ON "CorpusPaper"
  FOR EACH ROW EXECUTE FUNCTION public.pao_set_updated_at();

COMMIT;

-- =====================================================================
-- After applying, load data with:
--   node scripts/ingest/ingest-supabase.mjs --input <paragraph_reports> --group own
-- (requires rag.mode='supabase' + rag.supabase.* + api_keys in config.json)
-- =====================================================================
