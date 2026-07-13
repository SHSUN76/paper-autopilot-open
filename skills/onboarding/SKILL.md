---
name: onboarding
description: |
  paper-autopilot-open 첫 실행 설정 오케스트레이터. 사전 점검 → 의존성 설치 → config.json 작성 마법사 → 본인 논문 corpus 구축(RAG) → 검증까지 6-Phase로 안내한다. 사용자가 손으로 파일을 편집하지 않아도 플러그인이 동작하도록 만드는 진입점이다.

  TRIGGER: 사용자가 "온보딩", "초기 설정", "setup", "처음 시작", "환경 구성", "설치 마무리", "/paper-autopilot-open:onboard"를 말하거나, 다른 스킬(특히 paper-autopilot)이 `~/.claude/paper-autopilot-open/config.json` 부재 또는 RAG corpus 미구축을 감지했을 때. 부분 인자(precheck/install/config/corpus/verify)로 특정 Phase만 재실행할 수 있다.
---

# Onboarding — paper-autopilot-open 첫 실행 설정

너는 온보딩 오케스트레이터다. 목표는 **사용자가 config 파일을 손으로 편집하지 않고도** 플러그인을 동작 가능한 상태로 만드는 것이다. 아래 6 Phase를 순서대로 실행하고, 각 Phase 끝에서 사용자에게 상태를 보고하라.

## 원칙 (모든 Phase 공통)

- **멱등(idempotent)**: 재실행해도 안전해야 한다. 이미 완료된 항목은 감지해서 건너뛰거나 존중한다.
- **보안 최우선**: API 키·시크릿은 `config.json`에만 기록한다. 화면·보고·로그에 **절대 원문을 재출력하지 않는다** (표시할 때는 `****` 또는 `(설정됨)`).
- **비용 사전 고지**: 임베딩 API 호출·이미지 생성처럼 비용이 발생하는 단계는 실행 **전에** 예상 비용을 알리고 동의를 받는다.
- **파괴 금지**: 기존 config가 있으면 덮어쓰기 전에 `config.json.bak`으로 백업하고, 유지할 값을 사용자에게 확인한다.
- **부분 실행**: `$ARGUMENTS`에 `precheck`/`install`/`config`/`corpus`/`verify`가 있으면 해당 Phase만 실행한다. 없으면 Phase 0-5 전체.

경로 상수:
- 플러그인 루트: `${CLAUDE_PLUGIN_ROOT}`
- config 파일: `~/.claude/paper-autopilot-open/config.json`
- 로컬 corpus 기본 위치: `~/.claude/paper-autopilot-open/corpus`
- config 템플릿: `${CLAUDE_PLUGIN_ROOT}/config/settings.template.json`

---

## Phase 0 — 사전 점검 (precheck)

호스트에 필요한 툴체인이 있는지 확인한다. Bash로 아래를 실행하고 결과를 표로 보고하라.

```bash
node --version        # 필수: v18 이상
npm --version         # 필수
git --version         # 필수 (플러그인 설치·업데이트)
pandoc --version      # 선택: 없으면 docx 변환만 불가 (경고만)
python --version      # 선택: figure 추출·일부 Python 도구(pdf-figure-extract 등). 없으면 해당 기능만 비활성
```

판정 기준:
- **node**: `v18.x` 미만이거나 미설치면 ❌ BLOCK — Node 18+ 설치 안내 후 중단.
- **npm / git**: 미설치면 ❌ BLOCK.
- **pandoc**: 미설치면 ⚠️ WARN — "docx 변환(`/paper-autopilot-open:docx`)은 비활성. 나머지는 정상 진행" 만 알리고 계속.
- **python**: `3.10` 미만이거나 미설치면 ⚠️ WARN — "figure 추출 등 일부 Python 도구 비활성. 나머지는 정상 진행" 만 알리고 계속. (`python`이 없으면 `python3 --version`도 시도)

**Fable 5 접근 안내** (프로그램적 확인 불가 — 안내만): 이 플러그인의 학술 작문 에이전트 13종이 프런트매터에서 `model: fable`을 핀하고 있다. 사용자의 Claude Code 플랜이 Fable 5에 접근 가능해야 최상 품질이 나온다. 접근 불가 시 에이전트가 기본 모델로 폴백될 수 있음을 알린다 (동작은 하되 문체 품질 저하 가능).

보고 형식 예:

```
Phase 0 — 사전 점검
| 항목    | 상태 | 값/비고 |
|---------|------|---------|
| node    | ✅   | v20.11.0 (>=18 충족) |
| npm     | ✅   | 10.2.4 |
| git     | ✅   | 2.43.0 |
| pandoc  | ⚠️   | 미설치 — docx 변환 비활성 |
| python  | ⚠️   | 미설치 — figure 추출 등 Python 도구 비활성 |
| Fable 5 | ℹ️   | 플랜 접근 여부 사용자 확인 필요 |
```

BLOCK 항목이 있으면 여기서 멈추고 설치 방법을 안내한다.

---

## Phase 1 — 의존성 설치 (install)

RAG 헬퍼 스크립트의 Node 의존성(`pg`)을 설치한다. lockfile이 있으므로 `npm ci`를 우선한다.

```bash
cd "${CLAUDE_PLUGIN_ROOT}/scripts" && npm ci
```

`npm ci` 실패 시 (lockfile 불일치 등) 폴백:

```bash
cd "${CLAUDE_PLUGIN_ROOT}/scripts" && npm install
```

성공 확인: `${CLAUDE_PLUGIN_ROOT}/scripts/node_modules/pg` 디렉토리가 존재하는지 검사한다. 존재하면 ✅ 보고, 아니면 오류 로그를 요약해 원인을 알린다.

---

## Phase 2 — config 마법사 (config)

`~/.claude/paper-autopilot-open/config.json`을 대화형으로 작성한다.

### 2.1 준비

1. 디렉토리 생성: `mkdir -p ~/.claude/paper-autopilot-open`
2. 기존 config 확인:
   - 있으면 → `config.json.bak`으로 복사 백업 후, 기존 값을 각 질문의 기본값으로 제시한다 ("현재 값 유지 / 변경").
   - 없으면 → `${CLAUDE_PLUGIN_ROOT}/config/settings.template.json` 스키마를 기준으로 새로 작성한다.

### 2.2 수집 항목

**입력 방식 규칙** (판단):
- **구조적 선택지**(언어, 타임존, gate 모드, RAG 모드, 임베딩 provider, 선택 기능 on/off)는 **AskUserQuestion**으로 한 번에 최대 4개씩 묶어 묻는다.
- **자유 입력 값**(경로, 이름, 저널 리스트)은 AskUserQuestion 선택지로 넣지 말고 대화로 입력받는다.
- **시크릿(API 키) — 2단계 우선순위**:
  1. **1순위(권장): 사용자가 직접 파일에 기입.** 에디터/터미널로 `~/.claude/paper-autopilot-open/config.json`(또는 `${CLAUDE_PLUGIN_ROOT}/scripts/.env`)을 열어 해당 키를 직접 붙여넣게 안내한다. 마법사는 값을 받지 않고 **키가 존재하고 비어있지 않은지만** 검증한다 (키 원문이 세션에 들어오지 않아 가장 안전).
  2. **2순위: 대화 붙여넣기 허용.** 사용자가 대화 붙여넣기를 원하면 받아서 즉시 config에 기록한다. 단, 붙여넣기를 요청하기 **전에** 고지: "⚠️ 대화로 붙여넣은 키는 이 로컬 세션 기록(transcript)에 남습니다. 최고 보안을 원하면 1순위(직접 파일 기입)를 쓰세요."
  - 어느 경로든 AskUserQuestion 선택지 라벨에는 키를 **절대 넣지 않는다** (라벨이 transcript에 기록됨). 확인·보고는 `****` 또는 `(설정됨)`로만 한다.

**필수 7종** (없으면 핵심 기능 동작 불가):

1. **Gemini API 키** — 이미지 mockup 생성 + 기본 임베딩(`gemini-embedding-001`) 겸용. (대화 입력, 마스킹 기록)
2. **papers_root** — 논문 폴더들이 놓일 루트 경로 (예: `C:/Users/you/Documents/papers` 또는 `/home/you/papers`). (자유 입력)
3. **default_first_author** — 제1저자 이름. (자유 입력)
4. **default_target_journals** — 대상 저널 리스트 (예: `["Adv. Energy Mater.", "Joule"]`). (자유 입력)
5. **논문 PDF 준비 안내** — Phase 3에서 본인 논문 ~5편 + 분야 논문 ~5편이 필요함을 미리 알린다. (안내만, 값 아님)
6. **node/npm** — Phase 0-1에서 이미 처리됨 (여기서 재확인 불필요).
7. **language / timezone** — `language`: ko/en, `timezone`: 기본 `Asia/Seoul` 확인. (AskUserQuestion)

**선택 9종** (건너뛰기 가능 — 각각 무엇을 활성화하는지 한 줄로 설명하고 물어라):

- **OpenAI 키** → 임베딩 대안 provider(`text-embedding-3-large`). Gemini 대신 쓸 때만.
- **Anthropic 키** → API 경로 corpus mining(구독 크레딧 대신 API로 태깅). 기본은 서브에이전트(무료)라 대개 불필요.
- **STORM 키** → 고품질 PDF 파싱 백엔드(`/paper-autopilot-open:parse`).
- **Tavily 키** → `/paper-autopilot-open:ppt-image --ref` 웹 참조 이미지 검색.
- **pandoc** → docx 변환(`/paper-autopilot-open:docx`). Phase 0 결과 반영.
- **Supabase** → `rag.mode=supabase`로 전환 시 `database_url` + `direct_url` + `service_role_key` 수집 + `corpus-schema.sql` 적용 안내 (references/config-wizard.md 참조).
- **기관 프록시 URL** → `paper_access.institution_proxy_url`. 소속 기관 도서관 프록시로 구독 논문 접근 (`{URL}` placeholder 포함 패턴).
- **Playwright MCP** → paper-access Tier1/2 (기관 IP 기반 구독 접근). 설치 여부만 확인·안내.
- **auto_gates_default** → `ask`(기본) / `auto` / `mixed`. G1-G6 게이트 자동 진행 정책.

각 필드의 정확한 config 키 매핑, AskUserQuestion 문항 구성 예시, 마스킹·백업 처리 상세는 **`references/config-wizard.md`**를 읽고 따르라.

### 2.3 기록

수집한 값으로 `~/.claude/paper-autopilot-open/config.json`을 작성한다 (템플릿 스키마 준수: `language`, `timezone`, `papers_root`, `default_first_author`, `default_target_journals`, `auto_gates_default`, `api_keys{...}`, `embedding{provider,dimensions}`, `rag{mode,local_corpus_dir,supabase{...}}`, `paper_access{institution_proxy_url}`). `embedding.provider`는 Gemini 키만 있으면 `gemini`, OpenAI를 선택하면 `openai`. `dimensions`는 1024 유지.

**파일 권한 강화 (기록 직후 즉시)**: config에 시크릿이 들어가므로 소유자만 읽도록 권한을 좁힌다.
- Unix(Linux/macOS): `chmod 600 ~/.claude/paper-autopilot-open/config.json`. 백업본이 있으면 `chmod 600 ~/.claude/paper-autopilot-open/config.json.bak`도 실행.
- Windows: `chmod`가 무의미하므로 실행하지 않고, "이 파일에는 실제 키가 있으니 공유·백업 시 주의하세요"만 안내한다.

기록 후 보고: 설정된 키는 `gemini: **** (설정됨)`처럼 마스킹, 미설정은 `openai: (건너뜀)`. **원문 키는 절대 출력 금지.**

---

## Phase 3 — corpus 구축 (corpus) — RAG 핵심

플러그인의 작문 품질은 사용자 본인 논문에서 만든 corpus에서 나온다. 상세 절차·JSON 스키마·명령은 **`references/corpus-build.md`**를 읽고 따르되, 핵심 4단계는 다음과 같다.

1. **PDF 준비 요청**: 본인 논문 ~5편 + 본인 분야 논문 ~5편을 각각 별도 폴더에 놓게 한다.
   권장 위치: `<papers_root>/_corpus_input/own/`, `<papers_root>/_corpus_input/field/`.
   **법적 안내 1줄**: 본인 소장 논문의 로컬 저장은 사적 이용에 해당한다. 구축한 corpus는 **재배포 금지**.

2. **PDF → 문단 분석 JSON**: 각 PDF를 번들된 `paper-corpus-mining` 스킬 워크플로우로 태깅해 `paragraph_reports/*.json`을 만든다. 스키마(핵심): `{ paper_id, paragraphs[]: { section_name, position_in_section, text, voice, hedge_level, primary_claim_type, has_active_we, ai_tell_phrases, moves[] } }`.
   이 태깅은 **Claude Code 서브에이전트**로 수행한다 → **API 비용 0**(구독 크레딧 사용). Anthropic API 키가 있어도 기본은 서브에이전트 경로.

3. **로컬 corpus 적재** (임베딩 API 호출 발생):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <own_reports_dir> --group own
   node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <field_reports_dir> --group field
   ```
   **비용 고지**: 10편 기준 예상 `<$0.5` (OpenAI provider). Gemini 무료 티어면 `$0` (rate-limit 있음). 실행 **전에** 사용자 동의를 받는다.

4. **2층 corpus 전략 설명**: 번들된 108편 집계 통계(`skills/academic-writing/references/corpus-evidence.md`)가 리뷰 규칙의 **prior**(정량 근거)이고, 사용자 corpus는 **exemplar 검색·문체 grounding**을 담당한다. 사용자 corpus가 30편 이상 모이면 통계 재보정을 권장한다.

`rag.mode`가 `supabase`인 경우: `build-corpus.mjs` 대신 `ingest-supabase.mjs`를 쓴다 (references/corpus-build.md의 Supabase 절 참조). `disabled`면 Phase 3를 건너뛰고 "RAG 없이 제한 모드"임을 알린다.

---

## Phase 4 — 검증 (verify)

아래 순서로 검증하고 결과를 보고한다.

**(a) 오프라인 스모크 — 항상 실행** (API 키·네트워크 불필요, stub 임베딩):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tests/smoke-local.mjs"
```
로컬 벡터스토어 빌드→쿼리 왕복이 통과하면 스크립트 파이프라인 정상.

**(b) 실 corpus 스모크** (Phase 3를 실행한 경우만, 임베딩 1콜 발생):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs --query "We propose a new binder for silicon anodes" --k 1
```
JSON 1건이 반환되면 config·임베딩 provider·corpus가 일관됨을 확인.

**(c) ppt-image 드라이런 — 선택 (비용 고지 후 동의 시만)**: 이미지 1장 생성 시 ~$0.03(flash)–$0.24(pro). 동의하면 `--dry-run`으로 프롬프트만 확인하거나 1장만 생성. 미동의면 건너뛴다.

**(d) folder-scaffold 왕복**: 테스트 논문 폴더를 만들고(`/paper-autopilot-open:paper-autopilot:scaffold _onboard_test`) 구조가 6폴더 + 메타파일로 생기는지 확인한 뒤 **삭제**한다.

각 단계 ✅/⏭️/❌로 보고. (b)가 없더라도 (a) 통과면 스크립트 계층은 정상으로 판정.

---

## Phase 5 — 완료 보고

준비 상태를 표로 정리하고 다음 단계를 안내한다.

```
paper-autopilot-open 온보딩 완료

| 항목 (필수)            | 상태 |
|------------------------|------|
| Node 18+ / npm / git   | ✅   |
| 의존성 설치            | ✅   |
| config.json            | ✅   |
| Gemini 키              | ✅   |
| papers_root            | ✅   |
| 로컬 corpus (RAG)      | ✅ (own 5 / field 5) |

| 항목 (선택)      | 상태 |
|------------------|------|
| pandoc (docx)    | ⏭️ 미설치 |
| Tavily (--ref)   | ⏭️ 건너뜀 |
| STORM (parse)    | ⏭️ 건너뜀 |
| Supabase         | ⏭️ 로컬 모드 사용 |
| 기관 프록시      | ⏭️ 건너뜀 |

다음 단계:
  /paper-autopilot-open:paper-autopilot scaffold <논문명>   ← 새 논문 폴더 + 파이프라인 시작

문제가 있거나 값을 바꾸려면 언제든 재실행 (기존 설정 존중):
  /paper-autopilot-open:onboard config    ← config만 다시
  /paper-autopilot-open:onboard corpus    ← PDF 추가 후 corpus만 다시
```

**멱등 재실행 안내**: 온보딩은 여러 번 실행해도 안전하다. `config` 재실행 시 기존 값을 기본값으로 제시하고 백업(`config.json.bak`)을 남긴다. `corpus` 재실행 시 이미 적재된 논문은 건너뛰고(증분) 새 논문만 임베딩한다(`--force`로 재임베딩 강제 가능).

---

## References (progressive disclosure)

- `references/config-wizard.md` — Phase 2 상세: 필드↔config 키 매핑, AskUserQuestion 문항 구성, 마스킹·백업·Supabase 수집 절차
- `references/corpus-build.md` — Phase 3 상세: PDF 준비 레이아웃, paper-corpus-mining 태깅 스키마, build-corpus/ingest-supabase 명령, 2층 전략, 비용표
