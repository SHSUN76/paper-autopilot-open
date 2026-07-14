# paper-autopilot-open 설치 가이드

> 한국어 가이드입니다. English summary is at the bottom.
> 관련 문서: [README.md](./README.md) · [README.ko.md](./README.ko.md)

## 3줄 설치 (권장)

Claude Code에서 아래 3개를 순서대로 실행하면 끝납니다. 나머지(의존성 설치, 설정, corpus 구축, 검증)는 온보딩 마법사가 처리합니다.

```
/plugin marketplace add SHSUN76/paper-autopilot-open
/plugin install paper-autopilot-open@paper-autopilot-open-marketplace
/paper-autopilot-open:onboard
```

`/paper-autopilot-open:onboard`가 6-Phase로 안내합니다:
1. **사전 점검** — node/npm/git/pandoc/python(3.10+) + Fable 5 접근
2. **의존성 설치** — `scripts/`의 Node 패키지 + (감지 시) Python 라이브러리(`requirements.txt`)
3. **config 마법사** — `~/.claude/paper-autopilot-open/config.json` 대화형 작성 + 기관 프록시 반자동 등록
4. **corpus 구축** — 작업 폴더·`_corpus_input`(own/field/review) 자동 생성 → 본인 ~5편 + 분야 ~5편 (+ 선택 review ≤5편) PDF → 로컬 RAG + 프로파일 2종 + own/field figure vision RAG(figures.jsonl/figure-arcs.json) + 관계도 리포트
5. **검증** — 오프라인 + 실 corpus 스모크
6. **완료 보고** — 준비 상태 표 + 다음 단계

## 요구사항

| 항목 | 필수/선택 | 무엇에 쓰이나 |
|------|-----------|---------------|
| Claude Code (최신) + Fable 5 접근 | **필수** | 플러그인 호스트. 작문 에이전트 13종이 `model: fable`을 핀 |
| Node.js 18+ | **필수** | RAG 헬퍼 스크립트(`retrieve.mjs`, `build-corpus.mjs`) 실행 |
| `git` | **필수** | 플러그인 설치·업데이트 |
| Gemini API 키 | **필수** | 이미지 mockup 생성 + 기본 임베딩(`gemini-embedding-001`) |
| OpenAI API 키 | 선택 | 임베딩 대안 provider(`text-embedding-3-large`) |
| Anthropic API 키 | 선택 | API 경로 corpus mining (기본은 서브에이전트 = 무료) |
| STORM API 키 | 선택 | 고품질 PDF 파싱(`/paper-autopilot-open:parse`) |
| Tavily API 키 | 선택 | `/paper-autopilot-open:ppt-image --ref` 웹 참조 검색 |
| Materials Project API 키 | 선택 | 결정구조·재료 물성 데이터 조회(`materials-project` 스킬). https://next-gen.materialsproject.org/api 무료 발급 |
| pandoc | 선택 | Markdown → docx 변환(`/paper-autopilot-open:docx`) |
| Python 3.10+ | 선택 | PDF 파싱·figure 추출·docx용. 라이브러리는 한 줄로 설치: `pip install -r "${CLAUDE_PLUGIN_ROOT}/scripts/requirements.txt"` (PyMuPDF, Pillow, python-docx, requests). 온보딩 Phase 1b가 자동 감지·설치 |
| Playwright MCP | 선택 | `paper-access` 기관 구독 접근(Tier 1/2). **온보딩이 자동 설치 (동의 시)**: `claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest` → `npx -y playwright install chromium` (재시작 후 도구 로드) |
| Supabase 프로젝트 | 선택 | `rag.mode=supabase` — 로컬 대신 클라우드 벡터스토어 |

필수 4종(Claude Code+Fable 5, Node 18+, git, Gemini 키)만 있으면 전체 파이프라인이 동작합니다. 나머지는 개별 기능을 켤 때만 필요합니다.

## 검증

온보딩이 자동으로 수행하지만, 수동으로도 확인할 수 있습니다. **실제 존재하는 스크립트는 아래 둘뿐입니다.**

> `${CLAUDE_PLUGIN_ROOT}`는 Claude Code 세션 안에서만 정의됩니다. 일반 터미널에서 직접 실행할 때는 플러그인 설치 경로(예: `~/.claude/plugins/.../paper-autopilot-open`)로 치환하세요.

```bash
# (a) 오프라인 스모크 — API 키·네트워크 불필요 (stub 임베딩)
node "${CLAUDE_PLUGIN_ROOT}/scripts/tests/smoke-local.mjs"

# (b) 실 corpus 스모크 — corpus 구축 후, 임베딩 1콜 발생
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs --query "silicon anode binder" --k 1
```

(a)가 통과하면 스크립트 파이프라인 정상. (b)가 JSON 1건을 반환하면 config·provider·corpus 일관성 OK.

---

## 수동 설치 (고급)

온보딩 마법사를 쓰지 않고 직접 구성하려면:

### 1. config 직접 작성

```bash
mkdir -p ~/.claude/paper-autopilot-open
cp "${CLAUDE_PLUGIN_ROOT}/config/settings.template.json" ~/.claude/paper-autopilot-open/config.json
# 편집: papers_root, default_first_author, api_keys.gemini 최소 채우기
```

config 스키마는 [`config/settings.template.json`](./config/settings.template.json) 참조. 주요 필드: `language`, `timezone`, `papers_root`, `default_first_author`, `default_target_journals`, `auto_gates_default`, `api_keys{gemini,openai,anthropic,storm_parse,tavily}`, `embedding{provider,dimensions}`, `rag{mode,local_corpus_dir,supabase}`, `paper_access{institution_proxy_url}`.

> 이 파일에는 실제 API 키가 들어갑니다. 공유·커밋하지 마세요. (저장소 밖 경로라 커밋 위험은 없지만, 백업·공유 시 주의)

### 2. 의존성 설치

```bash
cd "${CLAUDE_PLUGIN_ROOT}/scripts" && npm ci   # 실패 시: npm install

# (선택) Python 도구를 쓸 경우 — PDF 파싱·figure 추출·docx
pip install -r "${CLAUDE_PLUGIN_ROOT}/scripts/requirements.txt"   # PyMuPDF, Pillow, python-docx, requests
```

### 3. corpus 직접 구축

본인 논문·분야 논문 PDF를 `paper-corpus-mining` 스킬로 태깅해 `<paper_id>.json`(문단) + (own/field는) `<paper_id>.figures.json`(figure vision)을 만든 뒤:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <own_reports_dir>   --group own
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <field_reports_dir> --group field
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <review_reports_dir> --group review   # 선택: review 논문을 넣었을 때만
```

플래그: `--input <dir>` `--group own|field|review` `[--force]`. build-corpus는 `.figures.json` 접미사로 figure report를 자동 감지해 `figures.jsonl`/`figure-arcs.json`으로 적재한다(own/field만). 비용: Gemini 무료 티어면 $0, OpenAI면 10편 기준 <$0.5.

---

## Supabase 옵션 경로

로컬 벡터스토어 대신 본인 Supabase 프로젝트를 쓰려면:

1. Supabase 프로젝트 생성.
2. 대시보드 **SQL Editor**에서 [`scripts/setup/corpus-schema.sql`](./scripts/setup/corpus-schema.sql) 실행 (pgvector 확장 + 테이블 생성).
3. config에서 `rag.mode`를 `"supabase"`로 바꾸고 `rag.supabase.{database_url, direct_url, service_role_key}` 채우기.
4. corpus 적재는 `build-corpus.mjs` 대신 `ingest-supabase.mjs` 사용:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/ingest-supabase.mjs" --input <reports_dir> --group own
   ```

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| retrieve.mjs가 빈 결과 | corpus 미구축 또는 provider 불일치 | `build-corpus.mjs` 재실행, config `embedding.provider` 확인 |
| `/paper-autopilot-open:*` 미인식 | 플러그인 미등록 | Claude Code 재시작 + `/plugin` 확인 |
| docx 변환 실패 | pandoc 미설치 | pandoc 설치 후 `/paper-autopilot-open:onboard precheck` |
| 임베딩 rate-limit(gemini) | 무료 티어 한도 | 잠시 후 재시도 또는 `embedding.provider=openai` |
| config를 못 읽음 | 경로/JSON 오류 | `~/.claude/paper-autopilot-open/config.json` 존재·유효성 확인 |

## 다음 단계

설치·온보딩 완료 후 첫 논문 폴더를 만듭니다:

```
/paper-autopilot-open:paper-autopilot:scaffold "<논문 폴더명>"
```

이후 `/paper-autopilot-open:paper-autopilot`을 호출하면 현재 stage를 자동 추론해 다음 단계를 제안합니다.

---

## English summary

**Install (3 commands in Claude Code):**

```
/plugin marketplace add SHSUN76/paper-autopilot-open
/plugin install paper-autopilot-open@paper-autopilot-open-marketplace
/paper-autopilot-open:onboard
```

The onboarding wizard runs 6 phases: pre-check (node/npm/git/pandoc/python + Fable 5 access) → install Node + (detected) Python deps → config wizard (`~/.claude/paper-autopilot-open/config.json`, incl. semi-auto institution-proxy registration) → auto-create the corpus folders (own/field/review) and build a local RAG corpus + own/field profiles + a vision figure-set RAG (figures.jsonl / figure-arcs.json for own/field) + relationship report from your own ~5 papers + ~5 field papers (+ optional ≤5 review papers) → verify → summary. Your only manual step is dropping the PDFs into the created folders.

**Required:** latest Claude Code with Fable 5 access, Node.js 18+, git, a Gemini API key.
**Optional:** OpenAI / Anthropic / STORM / Tavily keys, pandoc (docx), Python 3.10+ (`pip install -r scripts/requirements.txt`), Playwright MCP (paper-access + proxy auto-registration), a Supabase project (`rag.mode=supabase`).

**Manual path (advanced):** copy `config/settings.template.json` to `~/.claude/paper-autopilot-open/config.json` and fill it, run `npm ci` in `scripts/` (and optionally `pip install -r scripts/requirements.txt`), then `build-corpus.mjs --input <dir> --group own|field|review` (own/field also emit a vision figure pass auto-detected via the `.figures.json` suffix).

**Verify (the only real scripts):**

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tests/smoke-local.mjs"                                    # offline
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs --query "silicon anode" --k 1   # live corpus
```

Note: internal instructions and generated artifacts are in Korean; full i18n is planned. See [README.md](./README.md) for orientation.
