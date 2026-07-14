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
- **python**: `3.10` 이상이면 ✅ — Phase 1b에서 필요한 라이브러리(PyMuPDF·Pillow·python-docx·requests)를 감지·설치한다. `3.10` 미만이거나 미설치면 ⚠️ WARN — "figure 추출 등 일부 Python 도구 비활성. 나머지는 정상 진행" 만 알리고 계속(Phase 1b 자동 건너뜀). (`python`이 없으면 `python3 --version`도 시도)

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

Node 의존성과 Python 라이브러리를 자동으로 감지·설치한다. 두 계층을 순서대로 처리한다.

### 1a. Node 의존성

RAG 헬퍼 스크립트의 Node 의존성(`pg`)을 설치한다. lockfile이 있으므로 `npm ci`를 우선한다.

```bash
cd "${CLAUDE_PLUGIN_ROOT}/scripts" && npm ci
```

`npm ci` 실패 시 (lockfile 불일치 등) 폴백:

```bash
cd "${CLAUDE_PLUGIN_ROOT}/scripts" && npm install
```

성공 확인: `${CLAUDE_PLUGIN_ROOT}/scripts/node_modules/pg` 디렉토리가 존재하는지 검사한다. 존재하면 ✅ 보고, 아니면 오류 로그를 요약해 원인을 알린다.

### 1b. Python 라이브러리 (PDF 파싱·figure 추출·docx)

Phase 0에서 Python 3.10+가 확인됐을 때만 진행한다 (없으면 이 단계를 건너뛰고 "figure 추출 등 Python 도구 비활성"만 알린다). 필요한 4종을 **개별 감지**한다:

```bash
python -c "import fitz"    # PyMuPDF (PDF 파싱·figure 추출)
python -c "import PIL"     # Pillow (이미지 후처리)
python -c "import docx"    # python-docx (docx 생성)
python -c "import requests" # requests (HTTP)
```

(각 명령의 exit code로 판정. `python`이 없으면 `python3`로 시도.)

- 전부 성공 → ✅ "Python 라이브러리 준비 완료" 보고, 설치 생략.
- 하나라도 실패 → **누락 목록**을 사용자에게 제시하고 설치 동의를 받는다. 동의 시:
  ```bash
  pip install -r "${CLAUDE_PLUGIN_ROOT}/scripts/requirements.txt"
  ```
  (`pip`이 없으면 `python -m pip`로 시도.) 설치 후 **위 감지를 재실행**해 성공을 확인하고 보고한다.
- `pip` 미존재 또는 권한 실패 → 자동 설치를 중단하고 수동 설치를 안내한다: "`python -m ensurepip --upgrade` 후 위 `pip install -r ...`을 직접 실행하세요. 시스템 Python을 건드리지 않으려면 가상환경(`python -m venv .venv` 후 활성화)에서 설치할 수도 있습니다."

`requirements.txt`는 `PyMuPDF`, `Pillow`, `python-docx`, `requests`를 고정한다. Python 도구를 쓰지 않을 사용자는 이 단계 전체를 건너뛰어도 나머지 파이프라인은 정상 동작한다.

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
3. **default_first_author** — "논문 저자 표기용 영문 이름을 알려주세요 (예: Gildong Hong)" **한 가지만** 묻고, 답을 그대로 `default_first_author`에 기입한다. 형식·순서·공저 설명 없이 이 한 질문만. (자유 입력)
4. **default_target_journals** — 대상 저널 리스트 (예: `["Adv. Energy Mater.", "Joule"]`). (자유 입력)
5. **논문 PDF 준비 안내** — Phase 3에서 본인 논문 ~5편 + 분야 논문 ~5편 + (선택) review 논문 ≤5편이 필요함을 미리 알린다. review는 분야 전반을 빠르게 파악하기 위한 선택 그룹임을 1줄로 덧붙인다. (안내만, 값 아님)
6. **node/npm** — Phase 0-1에서 이미 처리됨 (여기서 재확인 불필요).
7. **language / timezone** — `language`: ko/en, `timezone`: 기본 `Asia/Seoul` 확인. (AskUserQuestion)

**선택 10종** (건너뛰기 가능 — 각각 무엇을 활성화하는지 한 줄로 설명하고 물어라):

- **OpenAI 키** → 임베딩 대안 provider(`text-embedding-3-large`). Gemini 대신 쓸 때만.
- **Anthropic 키** → API 경로 corpus mining(구독 크레딧 대신 API로 태깅). 기본은 서브에이전트(무료)라 대개 불필요.
- **STORM 키** → 고품질 PDF 파싱 백엔드(`/paper-autopilot-open:parse`).
- **Tavily 키** → `/paper-autopilot-open:ppt-image --ref` 웹 참조 이미지 검색.
- **Materials Project API 키** → `api_keys.materials_project`. 질문 문구: "Materials Project API 키 (선택): 결정구조·재료 물성 데이터 조회에 사용 (materials-project 스킬). https://next-gen.materialsproject.org/api 에서 무료 발급". 다른 선택 키와 동일 취급(1순위=직접 파일 기입, 붙여넣기 시 transcript 잔류 고지, 확인·보고는 마스킹).
- **pandoc** → docx 변환(`/paper-autopilot-open:docx`). Phase 0 결과 반영.
- **Supabase** → `rag.mode=supabase`로 전환 시 `database_url` + `direct_url` + `service_role_key` 수집 + `corpus-schema.sql` 적용 안내 (references/config-wizard.md 참조).
- **기관 프록시 URL** → `paper_access.institution_proxy_url`. 소속 기관 도서관 프록시로 구독 논문 접근 (`{URL}` placeholder 포함 패턴). **직접 기입 대신 아래 2.4 반자동 등록 플로우를 우선 제안한다.**
- **Playwright MCP** → paper-access Tier1/2 (기관 IP 기반 구독 접근). 설치 여부만 확인·안내. 2.4 반자동 등록이 이 MCP를 활용한다.
- **auto_gates_default** → `ask`(기본) / `auto` / `mixed`. G1-G6 게이트 자동 진행 정책.

각 필드의 정확한 config 키 매핑, AskUserQuestion 문항 구성 예시, 마스킹·백업 처리 상세는 **`references/config-wizard.md`**를 읽고 따르라.

### 2.3 기록

수집한 값으로 `~/.claude/paper-autopilot-open/config.json`을 작성한다 (템플릿 스키마 준수: `language`, `timezone`, `papers_root`, `default_first_author`, `default_target_journals`, `auto_gates_default`, `api_keys{...}`, `embedding{provider,dimensions}`, `rag{mode,local_corpus_dir,supabase{...}}`, `paper_access{institution_proxy_url}`). `embedding.provider`는 Gemini 키만 있으면 `gemini`, OpenAI를 선택하면 `openai`. `dimensions`는 3072 유지.

**파일 권한 강화 (기록 직후 즉시)**: config에 시크릿이 들어가므로 소유자만 읽도록 권한을 좁힌다.
- Unix(Linux/macOS): `chmod 600 ~/.claude/paper-autopilot-open/config.json`. 백업본이 있으면 `chmod 600 ~/.claude/paper-autopilot-open/config.json.bak`도 실행.
- Windows: `chmod`가 무의미하므로 실행하지 않고, "이 파일에는 실제 키가 있으니 공유·백업 시 주의하세요"만 안내한다.

기록 후 보고: 설정된 키는 `gemini: **** (설정됨)`처럼 마스킹, 미설정은 `openai: (건너뜀)`. **원문 키는 절대 출력 금지.**

### 2.4 기관 프록시 반자동 등록 (paper_access)

소속 기관 도서관 프록시 패턴(`institution_proxy_url`)을 **손으로 추측해 적지 않고**, Playwright로 실제 구독 URL을 캡처해 자동 추출한다. 상세 규칙·엣지케이스는 **`references/config-wizard.md`의 "기관 프록시 반자동 등록" 절**을 읽고 따르라. 핵심 5단계:

1. **포털 URL 질문**: "소속 기관 도서관 포털 URL을 알려주세요 (건너뛰려면 '건너뜀')". 건너뛰면 `paper_access.institution_proxy_url`을 미설정(`""`)으로 두고 이 절을 종료한다.
2. **Playwright MCP 가용성 확인**: ToolSearch로 `mcp__playwright__browser_navigate` 등 브라우저 도구 존재를 확인한다.
   - **없으면 → 수동 입력 폴백**: 아래 패턴 예시 3종을 제시하고 사용자가 직접 기입하게 안내한다.
     - EZproxy: `https://login.proxy.<univ>.ac.kr/login?url={URL}`
     - OpenAthens: `https://go.openathens.net/redirector/<domain>?url={URL}`
     - 리다이렉터: `https://.../redirector.php?url={URL}`
     - (`{URL}`은 원 논문 URL이 들어갈 placeholder임을 설명.)
3. **가용하면 반자동 캡처**:
   - `mcp__playwright__browser_navigate`로 포털을 연다.
   - **로그인은 반드시 사용자가 브라우저에서 직접 한다.** 자격증명(ID·비밀번호·OTP)을 대화로 받거나 프로그램으로 입력하는 것은 **절대 금지** — 마법사는 자격증명을 다루지 않는다. "열린 브라우저에서 직접 로그인한 뒤 '완료'라고 말씀해주세요"로 안내한다.
   - 로그인 완료 확인 후, 포털의 전자저널 검색으로 **구독 논문 아무거나 1편**을 열도록 안내한다.
   - `browser_snapshot` 또는 `browser_evaluate`로 현재 URL을 캡처한다.
   - **패턴 추출 규칙**:
     - URL에 `url=`/`qurl=` 쿼리 파라미터가 있으면 → 그 파라미터 앞부분 + `{URL}`. (예: `https://login.proxy.univ.ac.kr/login?url=https://www.nature.com/...` → `https://login.proxy.univ.ac.kr/login?url={URL}`)
     - `go.openathens.net/redirector/...` 형식이면 → 그 redirector 형식으로 패턴화.
     - **호스트 재작성형**(예: `www-nature-com.proxy.univ.ac.kr` — 원 도메인이 호스트명에 병합된 형태)이면 → prefix 패턴화 **불가**로 판정. 수동 안내로 전환하고, paper-access가 이 재작성형을 자동 처리하지 못하는 한계를 명시한다.
4. **검증**: 추출한 패턴에 **다른 구독 논문 URL**을 `{URL}` 자리에 넣어 `browser_navigate` → paper-access의 페이월 감지기로 정상 접근(로그인 리다이렉트 루프·페이월 표시 부재)을 확인한다. 통과하면 `paper_access.institution_proxy_url`에 패턴을 기록. 실패하면 수동 입력 폴백.
5. **결과 요약**을 성공/수동/건너뜀 중 하나로 판정해 Phase 5 완료표에 반영한다.

---

## Phase 3 — corpus 구축 (corpus) — RAG 핵심

플러그인의 작문 품질은 사용자 본인 논문에서 만든 corpus에서 나온다. 상세 절차·JSON 스키마·명령은 **`references/corpus-build.md`**를 읽고 따르되, 핵심 흐름은 다음과 같다. **사용자가 손으로 할 일은 단 하나(PDF를 지정된 폴더에 넣기)뿐이고, 폴더 생성·태깅·적재·프로파일·리포트는 마법사가 처리한다.**

### 3.0 메인 작업 폴더 지정 + 폴더 자동 생성

1. **메인 작업 폴더 지정**: "corpus 입력을 놓을 메인 작업 폴더를 정합니다"라고 안내하고 선택지를 준다.
   - **기본 제안**: config `papers_root`.
   - **대안**: 현재 작업 디렉토리, 또는 직접 입력한 경로.
2. **지정 즉시 자동 생성**(멱등 — 이미 있으면 그대로 둠):
   ```bash
   mkdir -p "<main>/_corpus_input/own" "<main>/_corpus_input/field" "<main>/_corpus_input/review" "<main>/_corpus_input/_reports"
   mkdir -p "<local_corpus_dir>"   # config rag.local_corpus_dir (기본 ~/.claude/paper-autopilot-open/corpus)
   ```
   - `own/`: 본인(공저 포함) 논문 PDF.
   - `field/`: 분야 대표 논문 PDF.
   - `review/`: (선택) 분야 review 논문 PDF ≤5편 — 분야 전반 파악용. **문단 태깅·임베딩만** 하고 스타일 프로파일·vision figure 분석에서는 제외한다(아래 3.2·3.2V·3.3 참조).
   - `_reports/`: 문단 분석 JSON(paragraph_reports) + figure 분석 JSON(`<paper_id>.figures.json`) 저장용.
   - `<local_corpus_dir>`: 임베딩된 벡터스토어 저장 위치.
3. **법적 안내 1줄**: 본인이 정당하게 소장한 논문의 로컬 저장·개인 분석은 사적 이용이다. 구축한 corpus(원문 문단 포함)는 **재배포 금지** — 개인 로컬에서만 쓴다.

### 3.1 PDF 넣기 (사용자 행동 = 이 하나뿐)

사용자에게 **딱 한 가지**만 요청한다:

> "`<main>/_corpus_input/own/`에 본인 논문 PDF ~5편, `<main>/_corpus_input/field/`에 분야 논문 PDF ~5편을 넣어주세요. (선택) 분야를 빠르게 파악하고 싶으면 `<main>/_corpus_input/review/`에 review 논문을 ≤5편까지 넣어도 됩니다. 다 넣으면 알려주세요."

알림을 받으면 각 폴더의 PDF 개수를 확인한다(own / field / review). 부족하면(예: own 0편, 또는 own+field 총 3편 미만) **진행 여부만** 묻는다: "지금 own N편 / field M편 / review R편입니다. 이대로 진행할까요, 더 넣으시겠어요?" 사용자가 진행을 택하면 있는 만큼으로 계속한다 (적을수록 exemplar·프로파일 품질이 낮아짐만 1줄 고지). review는 선택이므로 0편이어도 경고 없이 넘어간다.

### 3.2 PDF → 문단 분석 JSON (own / field / review 전부)

각 PDF를 번들된 `paper-corpus-mining` 스킬 워크플로우로 태깅해 논문당 1개의 JSON(`<paper_id>.json`)을 `<main>/_corpus_input/_reports/`(own은 `own/`, field는 `field/`, review는 `review/` 하위)로 만든다. 스키마(핵심): `{ paper_id, paragraphs[]: { section_name, position_in_section, text, voice, hedge_level, primary_claim_type, has_active_we, ai_tell_phrases, moves[] } }`.
이 태깅은 **Claude Code 서브에이전트**로 수행한다 → **API 비용 0**(구독 크레딧 사용). Anthropic API 키가 있어도 기본은 서브에이전트 경로.
**review 그룹도 이 문단 태깅은 받는다** — 분야 지식 검색용 임베딩만 필요하기 때문. review는 다음의 3.2V(figure vision)와 3.3의 style-profile 생성에서만 제외된다.

### 3.2V figure vision 정밀 분석 (own + field 전용, review 제외)

own+field 10편(review 제외)은 문단 태깅과 **별도로** 논문 맥락 + figure set을 vision AI로 정밀 파악한다. 각 논문에 대해 **Claude Code 서브에이전트**를 띄워 PDF를 vision으로 정독한다 — Read 도구는 PDF를 페이지 vision으로 읽으며 **호출당 최대 20페이지**이므로, 페이지가 많은 논문은 분할해서 읽는다. 서브에이전트는 논문당 1개의 `<paper_id>.figures.json`을 문단 report와 **같은** `_reports/`(own은 `own/`, field는 `field/` 하위)에 저장한다. 스키마·추출 절차·hallucination 가드는 `paper-corpus-mining` 스킬의 **`references/figure_extraction.md`**(Stage 1V)를 따르며, 핵심 필드는 `{ paper_id, figures[]: { fig_id, figure_type, panel_count, panels[], caption, key_message, narrative_role, narrative_context, quantitative_claims, domain_tags }, arc_pattern, arc_summary, narrative_logic }`이다.

- **비용·시간 고지**: vision 정독은 **구독 크레딧**으로 수행 → **API 비용 0**. 다만 논문당 수 분이 걸리므로(총 10편 = 수십 분) 실행 전에 소요 시간을 알린다. 서브에이전트로 격리 실행해 메인 컨텍스트 오염을 막고, 5편씩 배치로 띄운다(30편 이상 아니므로 배치 1~2회).
- **자동 적재**: 완료 후 3.3의 `build-corpus.mjs`가 `_reports/`에서 `<paper_id>.figures.json`을 **접미사(`.figures.json`)로 자동 감지**해 figure 인덱스(`figures.jsonl`)와 아크(`figure-arcs.json`)로 적재한다. 사용자는 추가 명령 없이 문단 report와 함께 두기만 하면 된다.
- review 그룹은 이 vision 패스를 **수행하지 않는다**(분야 지식 검색만 필요, figure 서사 exemplar는 own/field로 충분).

### 3.3 로컬 corpus 적재 (임베딩 API 호출 발생)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <own_reports_dir>   --group own
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <field_reports_dir> --group field
# review 폴더에 PDF가 있었을 때만 (선택):
node "${CLAUDE_PLUGIN_ROOT}/scripts/ingest/build-corpus.mjs" --input <review_reports_dir> --group review
```

`review/`에 PDF가 하나도 없었으면 `--group review` 호출은 **건너뛴다**. review 그룹은 문단 임베딩만 적재되어 분야 지식 검색(`retrieve.mjs paragraphs --group review`)에 쓰이고, **style-profile 생성에는 포함되지 않는다**(style-profile은 own 전용).

**비용 고지**: 10편(own+field) 기준 예상 `<$0.5` (OpenAI provider). Gemini 무료 티어면 `$0` (rate-limit 있음). review를 추가하면 편수에 비례해 소폭 증가. 실행 **전에** 사용자 동의를 받는다.

`build-corpus.mjs`는 빌드 종료 시 corpus 디렉토리에 프로파일 2종을 **자동 생성**한다:
- `style-profile.json` — **own** 그룹의 작문 스타일 프로파일 (voice·hedge 성향 등). review·field는 제외.
- `field-profile.json` — field 그룹의 분야 지식 프로파일 (연도 범위·주요 저널 등).

또한 3.2V의 figure vision report(`<paper_id>.figures.json`)가 `_reports/`에 있으면 `build-corpus.mjs`가 접미사로 자동 감지해 figure 산출물 2종을 함께 생성한다:
- `figures.jsonl` — own/field figure 인덱스 (figure_type·narrative_role·domain_tags로 검색 가능).
- `figure-arcs.json` — 논문별 figure 아크(arc_pattern / arc_summary / narrative_logic) 모음.

`rag.mode`가 `supabase`인 경우: `build-corpus.mjs` 대신 `ingest-supabase.mjs`를 쓴다 (references/corpus-build.md의 Supabase 절 참조). `disabled`면 Phase 3를 건너뛰고 "RAG 없이 제한 모드"임을 알린다.

### 3.4 프로파일 요약 보여주기

자동 생성된 두 프로파일을 각각 **1줄로 요약**해 사용자에게 보여준다:
- **own 스타일**: 예) "voice=능동 우세, hedge=mild 성향, active-we 다수" — 본인 작문 습관 요약.
- **field 분야**: 예) "연도 범위 2018–2024, 주요 저널 Adv. Energy Mater./Joule" — 분야 최신 흐름 요약.

(프로파일 파일을 통째로 출력하지 말고 핵심만 1줄씩.)

### 3.5 corpus 관계도 리포트 생성

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/report/corpus-report.mjs"
```

기본 출력은 `<corpus_dir>/corpus-report.html`(`--out`으로 위치 변경 가능). 생성된 리포트를 `<main>/_corpus_input/corpus-report.html`로 복사한 뒤 안내한다: **"브라우저로 `<main>/_corpus_input/corpus-report.html`을 열어 corpus 관계도(own↔field, 섹션·claim·move 분포)를 확인하세요."**

### 3.6 2층 corpus 전략 설명 (갱신)

- **번들 108편 집계 통계**(`skills/academic-writing/references/corpus-evidence.md`) = 리뷰 규칙의 **prior**(정량 근거). 통계만 있고 원문 없음.
- **사용자 corpus (2층)**:
  - **own** = **작문 스타일 프로파일 + phrasing exemplar**. 본인 목소리·자주 쓰는 표현의 기준 (`retrieve.mjs style-profile`, `retrieve.mjs paragraphs --group own`).
  - **field** = **분야 지식·최신 흐름**. 용어·구조·최근 동향의 기준 (`retrieve.mjs field-profile`, `retrieve.mjs paragraphs --group field --since <year>`로 최신 논문만 필터).
- 사용자 corpus가 **30편 이상** 모이면 108편 통계 대신 본인 corpus로 리뷰 규칙 통계를 **재보정**하는 것을 권장한다 (분야가 baseline과 다를수록 효과 큼).

### 3.7 figure RAG 결과 확인 (figure vision을 수행한 경우만)

3.2V의 figure vision 패스를 돌렸으면, 적재된 아크가 제대로 학습됐는지 마지막에 한 번 확인한다:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" figure-arcs
```

반환된 아크 중 **최대 5개**를 골라 `arc_pattern`(또는 `arc_summary` 첫 문장)을 **1줄씩** 사용자에게 보여준다. 예:

```
학습된 figure 아크 (예시 5개):
1. design-concept → synthesis-structure → performance → mechanism → device-validation
2. motivation → morphology → performance → benchmark-comparison → summary
...
```

이는 "figure set 구성을 RAG로 학습했다"는 것을 사용자가 눈으로 확인하는 단계다. figure vision을 건너뛰었으면 이 절도 건너뛴다(빈 결과면 "figure RAG 미구축"만 1줄 알림). 개별 figure 검색·아크 필터 옵션은 `references/corpus-build.md`의 retrieve 절 참조.

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
| Node 의존성 설치       | ✅   |
| config.json            | ✅   |
| Gemini 키              | ✅   |
| 메인 작업 폴더         | ✅ (`_corpus_input/own\|field\|review\|_reports` 생성) |
| 로컬 corpus (RAG)      | ✅ (own 5 / field 5) |
| 프로파일 2종           | ✅ (style-profile / field-profile) |
| corpus 관계도 리포트   | ✅ (`_corpus_input/corpus-report.html`) |

| 항목 (선택)         | 상태 |
|---------------------|------|
| review corpus       | ✅ (review R편, 분야 지식 검색) / ⏭️ 건너뜀 |
| figure RAG (아크)   | ✅ (figures.jsonl / figure-arcs.json, own+field vision) / ⏭️ 건너뜀 |
| Python 라이브러리   | ✅ 설치 / ⏭️ Python 없음 |
| pandoc (docx)       | ⏭️ 미설치 |
| Tavily (--ref)      | ⏭️ 건너뜀 |
| STORM (parse)       | ⏭️ 건너뜀 |
| Materials Project   | ✅ 설정 (재료 물성 fact-check·구조 데이터 grounding) / ⏭️ 건너뜀 |
| Supabase            | ⏭️ 로컬 모드 사용 |
| 기관 프록시         | ✅ 반자동 등록 / ✍️ 수동 입력 / ⏭️ 건너뜀 |

다음 단계:
  /paper-autopilot-open:paper-autopilot scaffold <논문명>   ← 새 논문 폴더 + 파이프라인 시작

문제가 있거나 값을 바꾸려면 언제든 재실행 (기존 설정 존중):
  /paper-autopilot-open:onboard config    ← config만 다시
  /paper-autopilot-open:onboard corpus    ← PDF 추가 후 corpus만 다시
```

**멱등 재실행 안내**: 온보딩은 여러 번 실행해도 안전하다. `config` 재실행 시 기존 값을 기본값으로 제시하고 백업(`config.json.bak`)을 남긴다. `corpus` 재실행 시 이미 적재된 논문은 건너뛰고(증분) 새 논문만 임베딩한다(`--force`로 재임베딩 강제 가능).

---

## References (progressive disclosure)

- `references/config-wizard.md` — Phase 2 상세: 필드↔config 키 매핑, AskUserQuestion 문항 구성, 마스킹·백업·Supabase 수집 절차, **기관 프록시 반자동 등록**(패턴 추출·검증·자격증명 금지 원칙)
- `references/corpus-build.md` — Phase 3 상세: `_corpus_input/own\|field\|review\|_reports` 폴더 구조, paper-corpus-mining 태깅 스키마, build-corpus/ingest-supabase 명령(`--group own\|field\|review`), **style-profile/field-profile 스키마 개요**, **figure vision report(`<paper_id>.figures.json`) 스키마 + figures.jsonl/figure-arcs.json 산출물**, **`figures`/`figure-arcs` retrieve 명령**, **corpus-report.mjs 사용법**, **`--since` 필터**, 2층 전략, 비용표
- `../paper-corpus-mining/references/figure_extraction.md` — figure vision 추출 정본 스키마 + 추출 절차 + hallucination 가드 (3.2V가 따르는 Stage 1V 가이드)
