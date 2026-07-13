# Corpus Build — Phase 3 상세

사용자 본인 논문에서 로컬 RAG corpus를 만드는 절차. SKILL.md Phase 3에서 참조한다.

## 왜 self-built corpus인가

이 플러그인은 **공유·독점 corpus를 배포하지 않는다**. 대신:
- **번들된 108편 집계 통계** (`skills/academic-writing/references/corpus-evidence.md`) = 리뷰 규칙의 정량 prior (claim/hedge/move 분포, AI-tell 임계값 등). 원문 텍스트는 없고 통계만.
- **사용자 self-built corpus** = 원문 문단 임베딩. exemplar 검색(`retrieve.mjs paragraphs`)과 문체 grounding 담당.

두 층이 짝을 이룬다: 통계는 "무엇이 정상인지"를, 사용자 corpus는 "당신 분야에서 실제로 어떻게 쓰는지"를 제공한다.

## 1. PDF 준비 레이아웃

사용자에게 두 그룹을 별도 폴더로 준비하도록 요청한다:

```
<papers_root>/_corpus_input/
├── own/      ← 본인(공저 포함) 논문 PDF ~5편  → --group own
└── field/    ← 본인 분야 대표 논문 PDF ~5편   → --group field
```

- `own`: 당신의 목소리·자주 쓰는 표현의 기준. 로컬 모드에서는 `retrieve.mjs paragraphs --group own` 필터로 본인 논문만 검색할 수 있다 (supabase 백엔드는 group을 저장하지 않으므로 필터 불가 — 전체 corpus에서 검색됨).
- `field`: 분야 관례(용어·구조)의 기준.
- **법적 안내(1줄, 반드시)**: 본인이 정당하게 소장한 논문의 로컬 저장·개인 분석은 사적 이용이다. 만들어진 corpus(원문 문단 포함)는 **재배포 금지** — 개인 로컬에서만 쓴다.

## 2. PDF → 문단 분석 JSON (paragraph_reports)

각 PDF를 번들된 `paper-corpus-mining` 스킬 워크플로우로 태깅해 논문당 1개의 JSON을 만든다. 출력 디렉토리 예: `<papers_root>/_corpus_input/own_reports/`, `.../field_reports/`.

**태깅은 Claude Code 서브에이전트로 수행한다 → API 비용 0** (구독 크레딧). Anthropic API 키가 config에 있어도 기본 경로는 서브에이전트다.

### JSON 스키마 (build-corpus.mjs가 읽는 형태)

```json
{
  "paper_id": "kim2023_si_binder",
  "metadata": { "title": "...", "journal": "...", "year": 2023 },
  "paragraphs": [
    {
      "section_name": "Introduction",
      "position_in_section": 0,
      "text": "문단 원문 ...",
      "voice": "active | passive | mixed",
      "hedge_level": "none | mild | moderate | strong",
      "primary_claim_type": "motivation | contribution | evidence | mechanism | interpretation | caveat | method_description | comparison | bridge",
      "has_active_we": true,
      "ai_tell_phrases": ["...optional..."],
      "moves": [
        {"move_type": "present_evidence", "position": 0, "text_span": "..."},
        {"move_type": "interpret", "position": 1, "text_span": "..."}
      ]
    }
  ]
}
```

- `paper_id`는 논문마다 유일해야 한다. 이미 적재된 `paper_id`는 증분 로직이 skip한다. **같은 run 내에서 동일 `paper_id`를 가진 리포트 파일이 2개 이상이면, 첫 파일만 적재하고 나머지는 skip + 경고 로그를 남긴다** (요약의 `warnings`에 표시). PDF마다 `paper_id`가 겹치지 않도록 준비할 것.
- `text`가 비어 있는 문단은 임베딩에서 제외된다.
- `moves`는 문단 내 rhetorical move 시퀀스 객체 배열 (move-transitions 검색에 쓰임). `move_type`은 정본 taxonomy: `state_goal | cite_gap | propose_method | present_evidence | interpret | caveat | bridge | contribution | future_work | hedge_alternative`.
- 선택적으로 lexicon / ai_tell_candidates 필드를 함께 담을 수 있다 (있으면 적재됨).

상세 스키마·추출 프롬프트는 `skills/paper-corpus-mining/references/paragraph_extraction.md` 참조.

## 3. 로컬 corpus 적재 (build-corpus.mjs)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <own_reports_dir>   --group own
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <field_reports_dir> --group field
```

플래그:
- `--input <dir>` (필수): `*.json` 리포트가 든 디렉토리.
- `--group own|field` (필수): 논문 그룹.
- `--force` (선택): 이미 적재된 논문도 재임베딩·덮어쓰기. 기본은 증분(이미 있는 `paper_id`는 skip).

동작: config의 `embedding.provider`로 각 문단을 임베딩(`dimensions`=1024) → `rag.local_corpus_dir`(기본 `~/.claude/paper-autopilot-open/corpus`)에 벡터스토어로 저장. 진행 로그는 stderr, 요약 JSON은 stdout:

```
{ papers_added, papers_skipped, paragraphs_embedded, moves_added,
  vocabulary_added, aitells_added, api_calls, estimated_cost_usd,
  provider, dimensions, warnings }
```

### 비용 (실행 전 고지 필수)

| provider | 단가 | 10편(≈300 문단) 예상 |
|----------|------|----------------------|
| gemini (`gemini-embedding-001`) | 무료 티어(rate-limit) | **$0** |
| openai (`text-embedding-3-large`) | ~$0.13 / 1M tokens | **< $0.5** |

`estimated_cost_usd`가 요약에 나온다. 실행 **전에** 예상 비용을 알리고 사용자 동의를 받는다.

## 4. Supabase 모드 (rag.mode=supabase)

로컬 대신 본인 Supabase 프로젝트에 적재:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/ingest-supabase.mjs" --input <reports_dir> --group own
```

사전 조건: config에 `rag.supabase.{database_url,direct_url,service_role_key}`가 있고, Supabase SQL Editor에서 `${CLAUDE_PLUGIN_ROOT}/scripts/setup/corpus-schema.sql`을 이미 적용(pgvector + 테이블)했어야 한다. 나머지 흐름(PDF→JSON→적재)은 로컬과 동일.

## 5. 재보정 권장 (30편+)

사용자 corpus가 30편을 넘어가면, 번들된 108편 통계 대신 본인 corpus로 리뷰 규칙 통계를 재보정하는 것을 권장한다 (분야가 108편 baseline과 다를수록 효과 큼). 이 재보정은 온보딩 범위 밖이며, 별도 작업으로 안내만 한다.

## 6. 검증 연결

Phase 4의 실 corpus 스모크가 이 단계 산출물을 확인한다:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs --query "We propose a new binder for silicon anodes" --k 1
```

JSON 1건 반환 = 적재·provider·config 일관성 OK. 빈 결과면 corpus 미적재 또는 provider 불일치를 의심한다.
