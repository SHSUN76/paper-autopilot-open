# Corpus Build — Phase 3 상세

사용자 본인 논문에서 로컬 RAG corpus를 만드는 절차. SKILL.md Phase 3에서 참조한다.

## 왜 self-built corpus인가

이 플러그인은 **공유·독점 corpus를 배포하지 않는다**. 대신:
- **번들된 108편 집계 통계** (`skills/academic-writing/references/corpus-evidence.md`) = 리뷰 규칙의 정량 prior (claim/hedge/move 분포, AI-tell 임계값 등). 원문 텍스트는 없고 통계만.
- **사용자 self-built corpus** = 원문 문단 임베딩. exemplar 검색(`retrieve.mjs paragraphs`)과 문체 grounding 담당.

두 층이 짝을 이룬다: 통계는 "무엇이 정상인지"를, 사용자 corpus는 "당신 분야에서 실제로 어떻게 쓰는지"를 제공한다.

## 1. PDF 준비 레이아웃

온보딩 Phase 3.0이 메인 작업 폴더(`<main>`, 기본 config `papers_root`) 아래에 아래 구조를 **자동 생성**한다. 사용자는 `own/`·`field/`에 PDF만 넣는다:

```
<main>/_corpus_input/
├── own/        ← 본인(공저 포함) 논문 PDF ~5편   → --group own
├── field/      ← 본인 분야 대표 논문 PDF ~5편    → --group field
├── review/     ← (선택) 분야 review 논문 PDF ≤5편 → --group review
└── _reports/   ← 문단 분석 JSON + figure 분석 JSON 저장용 (own/ · field/ · review/ 하위)
```

- `own`: 당신의 목소리·자주 쓰는 표현의 기준. 로컬 모드에서는 `retrieve.mjs paragraphs --group own` 필터로 본인 논문만 검색할 수 있다 (supabase 백엔드는 group을 저장하지 않으므로 필터 불가 — 전체 corpus에서 검색됨).
- `field`: 분야 관례(용어·구조)의 기준.
- `review`: (선택) 분야 전반을 빠르게 파악하기 위한 review 논문. **문단 태깅·임베딩만** 하고 style-profile·figure vision 분석에서는 **제외**한다. 분야 지식 검색(`retrieve.mjs paragraphs --group review`)에만 쓰인다.
- `_reports`: 2단계 태깅 산출물(JSON)이 쌓이는 곳. 문단 report는 `<paper_id>.json`, figure vision report는 `<paper_id>.figures.json`으로 같은 디렉토리에 저장한다(build-corpus가 접미사로 구분). corpus 적재(`build-corpus.mjs --input`)의 입력 디렉토리로 쓴다.
- 임베딩된 벡터스토어는 별도로 config `rag.local_corpus_dir`(기본 `~/.claude/paper-autopilot-open/corpus`)에 저장된다.
- **법적 안내(1줄, 반드시)**: 본인이 정당하게 소장한 논문의 로컬 저장·개인 분석은 사적 이용이다. 만들어진 corpus(원문 문단 포함)는 **재배포 금지** — 개인 로컬에서만 쓴다.

## 2. PDF → 문단 분석 JSON (paragraph_reports)

각 PDF를 번들된 `paper-corpus-mining` 스킬 워크플로우로 태깅해 논문당 1개의 JSON(`<paper_id>.json`)을 만든다. 출력 디렉토리: `<main>/_corpus_input/_reports/own/`, `<main>/_corpus_input/_reports/field/`, `<main>/_corpus_input/_reports/review/` (Phase 3.0에서 자동 생성됨). review 그룹도 문단 태깅은 동일하게 받는다(분야 지식 검색용). figure vision 분석은 own+field만 받으며 아래 2.5에서 다룬다.

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

## 2.5 PDF → figure vision report (own + field 전용)

own+field 논문은 문단 태깅과 **별도로** figure set을 vision AI로 정밀 분석해 논문당 1개의 `<paper_id>.figures.json`을 `_reports/`의 같은 그룹 하위(own/·field/)에 만든다. review 그룹은 제외한다. 추출은 **Claude Code 서브에이전트**가 PDF를 vision으로 정독해 수행한다(Read 도구는 PDF를 페이지 vision으로 읽으며 호출당 최대 20페이지 → 분할 읽기). **API 비용 0**(구독 크레딧), 논문당 수 분.

`build-corpus.mjs`는 `_reports/`에서 `.figures.json` 접미사로 이 파일을 문단 report(`<paper_id>.json`)와 자동 구분해 적재한다.

### figure report JSON 스키마 (정본)

이 스키마는 `skills/paper-corpus-mining/references/figure_extraction.md`의 정본과 **필드명이 동일**하다(두 파일은 같은 계약을 기술한다 — 한쪽만 고치지 말 것).

```json
{
  "paper_id": "...",
  "figures": [{
    "fig_id": "Fig1", "fig_index": 1, "fig_total": 5, "is_si": false,
    "figure_type": ["schematic"], "panel_count": 3, "panel_grid": "1x3",
    "panels": [{"label": "a", "type": "schematic", "summary": "1문장"}],
    "caption": "원문 그대로",
    "key_message": "이 figure가 증명하는 것 1-2문장",
    "narrative_role": "design-concept",
    "narrative_context": "앞 figure를 받아 무엇을 수행하고 다음으로 어떻게 연결되는지 1문장",
    "quantitative_claims": ["500 cycles @ 99.8% CE"],
    "domain_tags": ["Li-metal"]
  }],
  "arc_pattern": "design-concept → synthesis-structure → performance → mechanism → device-validation",
  "arc_summary": "3-5문장 자연어 (figure 흐름이 논문 서사를 어떻게 구성하는지)",
  "narrative_logic": "mechanism-first vs performance-first 판정; SI로 미룬 것"
}
```

- `narrative_role`은 9종 고정 enum: `motivation | design-concept | synthesis-structure | morphology | mechanism | performance | benchmark-comparison | device-validation | summary`.
- `figure_type`은 controlled vocab(개방형이되 우선 사용): `XRD, SEM, TEM, HRTEM, XPS, EIS, CV, GCD-cycling, rate, operando-insitu, schematic, DFT-MD, photograph, device-pouch, safety, Raman, FTIR, BET, NMR, TGA`.
- **hallucination 가드**: `quantitative_claims`는 `caption` 원문과 교차검증된 수치만 기재하고, `caption`은 항상 원문 그대로 보존하며, 불확실한 패널 해석은 해당 `panels[].summary`에 "(불확실)"로 표기한다.

추출 절차·필드별 가이드·vocab 정의표는 `skills/paper-corpus-mining/references/figure_extraction.md`(Stage 1V) 참조.

## 3. 로컬 corpus 적재 (build-corpus.mjs)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <own_reports_dir>   --group own
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <field_reports_dir> --group field
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <review_reports_dir> --group review   # 선택: review/에 PDF가 있었을 때만
```

플래그:
- `--input <dir>` (필수): `*.json`(문단 report) + `*.figures.json`(figure vision report)이 든 디렉토리. build-corpus가 접미사(`.figures.json`)로 둘을 자동 구분한다.
- `--group own|field|review` (필수): 논문 그룹. `review`는 문단 임베딩만 적재하고 style-profile·figure 산출물에서는 제외된다.
- `--force` (선택): 이미 적재된 논문도 재임베딩·덮어쓰기. 기본은 증분(이미 있는 `paper_id`는 skip).

동작: config의 `embedding.provider`로 각 문단을 임베딩(`dimensions`=3072) → `rag.local_corpus_dir`(기본 `~/.claude/paper-autopilot-open/corpus`)에 벡터스토어로 저장. own/field 그룹에 `.figures.json`이 함께 있으면 figure 인덱스(`figures.jsonl`)와 아크(`figure-arcs.json`)도 갱신한다. 진행 로그는 stderr, 요약 JSON은 stdout:

```
{ papers_added, papers_skipped, paragraphs_embedded, moves_added,
  vocabulary_added, aitells_added, figures_added, arcs_added,
  api_calls, estimated_cost_usd, provider, dimensions, warnings }
```

### 비용 (실행 전 고지 필수)

| provider | 단가 | 10편(≈300 문단) 예상 |
|----------|------|----------------------|
| gemini (`gemini-embedding-001`) | 무료 티어(rate-limit) | **$0** |
| openai (`text-embedding-3-large`) | ~$0.13 / 1M tokens | **< $0.5** |

`estimated_cost_usd`가 요약에 나온다. 실행 **전에** 예상 비용을 알리고 사용자 동의를 받는다.

## 3.5 자동 생성 프로파일 2종

`build-corpus.mjs`는 빌드 종료 시 `rag.local_corpus_dir`에 프로파일 2종을 자동 생성한다. 온보딩 Phase 3.4가 각각 1줄로 요약해 사용자에게 보여준다.

**`style-profile.json`** — own 그룹 **전용** 작문 스타일 프로파일 (review·field는 집계에서 제외). 개요 스키마:

```json
{
  "group": "own",
  "n_papers": 5,
  "voice": { "active": 0.6, "passive": 0.3, "mixed": 0.1 },
  "hedge": { "none": 0.2, "mild": 0.5, "moderate": 0.25, "strong": 0.05 },
  "active_we_ratio": 0.4,
  "top_phrasings": ["...", "..."]
}
```

**`field-profile.json`** — field 그룹의 분야 지식 프로파일. 개요 스키마:

```json
{
  "group": "field",
  "n_papers": 5,
  "year_range": [2018, 2024],
  "top_journals": ["Adv. Energy Mater.", "Joule"],
  "top_terms": ["...", "..."]
}
```

(정확한 필드 구성은 `build-corpus.mjs` 산출에 따른다 — 위는 요약을 위한 개요. 프로파일 파일을 통째로 출력하지 말고 핵심만 1줄씩 보여준다.)

## 3.6 corpus 관계도 리포트 (corpus-report.mjs)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/report/corpus-report.mjs"          # 기본 출력: <corpus_dir>/corpus-report.html
node "${CLAUDE_PLUGIN_ROOT}/scripts/report/corpus-report.mjs" --out <path>   # 출력 위치 지정
```

- 입력: `rag.local_corpus_dir`의 벡터스토어 + 프로파일 2종.
- 출력: own↔field 관계, 섹션·claim_type·move 분포를 시각화한 단일 HTML.
- 온보딩 Phase 3.5는 생성물을 `<main>/_corpus_input/corpus-report.html`로 복사하고 "브라우저로 열어 확인하세요"를 안내한다.

## 3.7 프로파일 조회 + 최신 필터 (retrieve 신규 옵션)

corpus 빌드 후 프로파일·필터를 조회하는 명령:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" style-profile      # own 작문 스타일 프로파일 출력
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" field-profile      # field 분야 지식 프로파일 출력
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs --query "..." --group field --since 2022
```

- `--since <year>` (paragraphs): 지정 연도 **이상**의 논문 문단만 검색. field 그룹에서 최신 흐름만 뽑을 때 쓴다 (`metadata.year` 기준).
- `--group review` (paragraphs): review 그룹 문단만 검색(분야 지식 파악용).

### figure RAG 조회 (figure vision을 수행한 경우)

figure vision report를 적재했으면(2.5) 아래 명령으로 figure 인덱스·아크를 조회한다:

```bash
# 개별 figure 검색: query로 유사 figure를 찾고, type/role/group으로 필터
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" figures --query "coulombic efficiency over cycles" --type GCD-cycling --role performance --group field --k 5
# 아크 전량 반환 (그룹 필터 선택)
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" figure-arcs --group own
```

- `figures` 플래그: `--query "..."`(의미 검색), `--type <figure_type>`(controlled vocab), `--role <narrative_role>`(9종 enum), `--group own|field`, `--k N`(반환 개수). 검색 대상은 `figures.jsonl`.
- `figure-arcs` 플래그: `--group <G>`(선택). 적재된 `figure-arcs.json`의 아크를 전량 반환한다(온보딩 Phase 3.7이 상위 5개만 1줄씩 요약).

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
