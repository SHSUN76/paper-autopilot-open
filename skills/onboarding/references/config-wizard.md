# Config Wizard — Phase 2 상세

`~/.claude/paper-autopilot-open/config.json` 작성 세부 절차. SKILL.md Phase 2에서 참조한다.

## 1. 필드 ↔ config 키 매핑

| 수집 항목 | config 키 | 값 형태 | 입력 방식 | 필수 |
|-----------|-----------|---------|-----------|------|
| 언어 | `language` | `"ko"` \| `"en"` | AskUserQuestion | 필수 |
| 타임존 | `timezone` | `"Asia/Seoul"` 등 IANA | AskUserQuestion | 필수 |
| 논문 루트 | `papers_root` | 절대경로 문자열 | 대화 입력 | 필수 |
| 제1저자 | `default_first_author` | 문자열 | 대화 입력 — "논문 저자 표기용 영문 이름을 알려주세요 (예: Gildong Hong)" **한 질문만**, 답을 그대로 기입 | 필수 |
| 대상 저널 | `default_target_journals` | 문자열 배열 | 대화 입력 | 필수 |
| 게이트 정책 | `auto_gates_default` | `"ask"` \| `"auto"` \| `"mixed"` | AskUserQuestion | 필수(기본 ask) |
| Gemini 키 | `api_keys.gemini` | 시크릿 문자열 | 대화 입력(마스킹) | 필수 |
| OpenAI 키 | `api_keys.openai` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| Anthropic 키 | `api_keys.anthropic` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| STORM 키 | `api_keys.storm_parse` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| Tavily 키 | `api_keys.tavily` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| Materials Project 키 | `api_keys.materials_project` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| 임베딩 provider | `embedding.provider` | `"gemini"` \| `"openai"` | AskUserQuestion | 필수(기본 gemini) |
| 임베딩 차원 | `embedding.dimensions` | `3072` | 고정 | 필수 |
| RAG 모드 | `rag.mode` | `"local"` \| `"supabase"` \| `"disabled"` | AskUserQuestion | 필수(기본 local) |
| 로컬 corpus 경로 | `rag.local_corpus_dir` | 경로(기본 `~/.claude/paper-autopilot-open/corpus`) | 기본값 제시 | 필수 |
| Supabase URL | `rag.supabase.database_url` | pooler URL | 대화 입력 | supabase 시 |
| Supabase Direct | `rag.supabase.direct_url` | direct URL | 대화 입력 | supabase 시 |
| Supabase 키 | `rag.supabase.service_role_key` | 시크릿 문자열 | 대화 입력(마스킹) | supabase 시 |
| 기관 프록시 | `paper_access.institution_proxy_url` | `{URL}` placeholder 포함 패턴 | 대화 입력 | 선택 |

> `embedding.provider`는 corpus를 **빌드할 때 사용한 provider와 반드시 일치**해야 한다. Gemini 키만 있으면 `gemini`, OpenAI를 선택하면 `openai`. 나중에 provider를 바꾸면 corpus를 `--force`로 재빌드해야 한다.

## 2. AskUserQuestion 문항 구성 (구조적 선택지)

한 번에 최대 4문항까지 묶어 물을 수 있다. 시크릿·자유입력은 여기 넣지 않는다. 예시 배치:

**배치 A (기본 환경)**
- `language`: 옵션 `ko`, `en`
- `timezone`: 옵션 `Asia/Seoul`, `UTC`, `America/New_York` (+ 사용자 커스텀 입력 허용)
- `auto_gates_default`: 옵션 `ask (매 게이트 확인)`, `auto (전 게이트 자동)`, `mixed (일부만 자동)`
- `embedding.provider`: 옵션 `gemini (기본, 무료 티어)`, `openai (유료, 고품질)`

**배치 B (RAG 백엔드 + 선택 기능 on/off)**
- `rag.mode`: 옵션 `local (기본, 외부 DB 불필요)`, `supabase (본인 프로젝트)`, `disabled (RAG 없이)`
- 선택 기능 활성화 여부(각각 yes/no): OpenAI 임베딩 / STORM 파싱 / Tavily 참조검색 / Materials Project / Supabase / 기관 프록시

"yes"로 답한 선택 기능만 이후 시크릿·값을 대화로 추가 수집한다.

## 3. 시크릿(API 키) 처리 규칙 — 2단계 우선순위

1. AskUserQuestion 선택지에 키를 **넣지 않는다** (라벨이 transcript에 기록됨).
2. **1순위(권장): 사용자가 직접 파일에 기입.** 사용자에게 `~/.claude/paper-autopilot-open/config.json`(또는 `${CLAUDE_PLUGIN_ROOT}/scripts/.env`)을 에디터/터미널로 열어 해당 키를 직접 붙여넣게 안내한다. 마법사는 값을 받지 않고 **키가 존재하고 비어있지 않은지만** 검증한다. (키 원문이 세션에 들어오지 않아 가장 안전.)
3. **2순위: 대화 붙여넣기.** 사용자가 원하면 "Gemini API 키를 붙여넣어 주세요"로 요청 → 사용자 입력 → **즉시** config에 기록. 단, 요청하기 **전에** 고지: "⚠️ 대화로 붙여넣은 키는 이 로컬 세션 기록(transcript)에 남습니다. 최고 보안을 원하면 1순위(직접 파일 기입)를 쓰세요."
4. **기록 직후 권한 강화**: Unix면 `chmod 600 ~/.claude/paper-autopilot-open/config.json`(백업본 있으면 `.bak`도) 실행. Windows는 `chmod`가 무의미하므로 실행하지 않고 공유 주의만 안내.
5. 확인·보고 시 원문 금지. 다음 중 하나로만 표시:
   - `gemini: **** (설정됨)`
   - `openai: (건너뜀)`
6. 절대 하지 말 것: 키 prefix/suffix 몇 글자 노출, 키 길이로 유추 가능한 정보 출력, 키를 파일 외 다른 곳(로그·notepad·메모리)에 기록.
7. config.json은 `.gitignore`가 `config/*.local.json`·`**/.env`를 막지만, `~/.claude/...`는 애초에 저장소 밖이므로 커밋 위험이 없다. 그래도 사용자에게 "이 파일에는 실제 키가 들어가니 공유 금지"를 1줄 안내.

## 4. 기존 config 백업·병합

```bash
# 존재하면 백업
[ -f ~/.claude/paper-autopilot-open/config.json ] && \
  cp ~/.claude/paper-autopilot-open/config.json ~/.claude/paper-autopilot-open/config.json.bak
```

- 기존 값이 있는 필드는 "현재: `<값>` — 유지할까요? 아니면 새 값?"으로 제시 (시크릿은 `**** (설정됨) — 유지/교체`).
- 사용자가 "유지"면 기존 값을 보존한다. 병합 결과만 새로 기록한다.
- 백업을 남겼음을 보고: `기존 설정을 config.json.bak으로 백업했습니다.`

## 5. Supabase 선택 시 추가 절차

`rag.mode=supabase`를 고른 경우:

1. Supabase 프로젝트 생성 안내 (없으면).
2. `database_url`(pooler, 6543), `direct_url`(direct, 5432), `service_role_key` 3종 수집.
3. **스키마 적용 안내**: Supabase 대시보드 SQL Editor에서 `${CLAUDE_PLUGIN_ROOT}/scripts/setup/corpus-schema.sql`을 실행하도록 안내 (pgvector 확장 + 테이블 생성). 이 단계는 사용자가 브라우저에서 수동으로 한다.
4. corpus 적재는 Phase 3에서 `build-corpus.mjs` 대신 `ingest-supabase.mjs`를 쓴다.

## 5.5 기관 프록시 반자동 등록 (institution_proxy_url)

`paper_access.institution_proxy_url`을 손으로 추측하지 않고, Playwright로 실제 구독 URL을 캡처해 자동 추출한다. SKILL.md Phase 2.4에서 참조한다.

### 자격증명 취급 금지 원칙 (반드시 준수)

- 사용자의 도서관 **ID·비밀번호·OTP를 대화로 받거나, 프로그램/스크립트로 입력하는 것을 절대 금지**한다.
- 로그인은 **오직 사용자가 열린 브라우저에서 직접** 수행한다. 마법사는 로그인 완료 신호("완료")만 기다린다.
- 이는 기관 SSO가 device fingerprinting·MFA를 쓰기 때문이기도 하고(프로그램 로그인은 실패·계정 잠금 위험), 자격증명이 세션 기록(transcript)에 남지 않게 하기 위함이다.

### 절차

1. **포털 URL 질문** (자유 입력): "소속 기관 도서관 포털 URL을 알려주세요 (건너뛰려면 '건너뜀')". 건너뛰면 `institution_proxy_url=""`로 두고 종료.
2. **Playwright MCP 가용성 확인**: ToolSearch로 `mcp__playwright__browser_navigate`(및 `browser_snapshot`/`browser_evaluate`) 존재를 확인.
   - **미가용 → 수동 입력 폴백**. 패턴 예시 3종 제시 후 직접 기입:
     | 유형 | 패턴 예시 |
     |------|-----------|
     | EZproxy | `https://login.proxy.<univ>.ac.kr/login?url={URL}` |
     | OpenAthens | `https://go.openathens.net/redirector/<domain>?url={URL}` |
     | 리다이렉터 | `https://.../redirector.php?url={URL}` |
     - `{URL}`은 원 논문 URL이 치환될 placeholder임을 설명.
3. **가용 → 반자동 캡처**:
   - `browser_navigate`로 포털 열기.
   - 사용자에게 **직접 로그인** 요청(위 금지 원칙) → "완료" 대기.
   - 로그인 후 포털의 전자저널 검색으로 **구독 논문 1편**을 열게 안내.
   - `browser_snapshot` 또는 `browser_evaluate({ function: "() => location.href" })`로 현재 URL 캡처.
4. **패턴 추출 규칙**:
   | 캡처 URL 형태 | 판정 | 추출 패턴 |
   |---------------|------|-----------|
   | `...?url=<orig>` 또는 `...?qurl=<orig>` 쿼리 파라미터 있음 | 추출 가능 | 파라미터 값 앞부분 + `{URL}` (예: `https://login.proxy.univ.ac.kr/login?url={URL}`) |
   | `go.openathens.net/redirector/<domain>?url=<orig>` | 추출 가능 | OpenAthens redirector 형식으로 패턴화 |
   | **호스트 재작성형** `www-nature-com.proxy.univ.ac.kr/...` (원 도메인이 호스트명에 병합) | **추출 불가** | prefix 패턴화 불가 → 수동 안내 + paper-access 재작성형 한계 명시 |
5. **검증**: 추출 패턴의 `{URL}`에 **다른 구독 논문 URL**을 넣어 `browser_navigate` → paper-access 페이월 감지기로 정상 접근(로그인 리다이렉트 루프·페이월 부재) 확인. 통과 시 `institution_proxy_url`에 기록, 실패 시 수동 폴백.
6. **결과 요약**을 성공(반자동)/수동/건너뜀 중 하나로 판정해 Phase 5 표에 반영.

> **호스트 재작성형 한계**: `institution_proxy_url`은 `{prefix}{URL}` 형태의 prefix-치환만 표현할 수 있다. 원 도메인을 호스트명에 병합·인코딩하는 재작성형 프록시는 이 패턴으로 표현 불가하며, paper-access Tier 2도 자동 변환하지 못한다. 이 경우 프록시 미설정으로 두고 Tier 1(IP 기반 직접 접근)만 사용한다.

## 6. 최종 config 구조 (예시 — 시크릿은 실제 값)

```json
{
  "language": "ko",
  "timezone": "Asia/Seoul",
  "papers_root": "C:/Users/you/Documents/papers",
  "default_first_author": "Your Name",
  "default_target_journals": ["Adv. Energy Mater.", "Joule"],
  "auto_gates_default": "ask",
  "api_keys": {
    "gemini": "<set>",
    "openai": "",
    "anthropic": "",
    "storm_parse": "",
    "tavily": "",
    "materials_project": ""
  },
  "embedding": { "provider": "gemini", "dimensions": 3072 },
  "rag": {
    "mode": "local",
    "local_corpus_dir": "~/.claude/paper-autopilot-open/corpus",
    "supabase": { "database_url": "", "direct_url": "", "service_role_key": "" }
  },
  "paper_access": { "institution_proxy_url": "" }
}
```

작성 후 JSON 유효성만 조용히 검증하고(파싱 성공 여부), 파일 내용을 화면에 통째로 출력하지 않는다 (시크릿 노출 방지).
