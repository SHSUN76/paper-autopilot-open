# Config Wizard — Phase 2 상세

`~/.claude/paper-autopilot-open/config.json` 작성 세부 절차. SKILL.md Phase 2에서 참조한다.

## 1. 필드 ↔ config 키 매핑

| 수집 항목 | config 키 | 값 형태 | 입력 방식 | 필수 |
|-----------|-----------|---------|-----------|------|
| 언어 | `language` | `"ko"` \| `"en"` | AskUserQuestion | 필수 |
| 타임존 | `timezone` | `"Asia/Seoul"` 등 IANA | AskUserQuestion | 필수 |
| 논문 루트 | `papers_root` | 절대경로 문자열 | 대화 입력 | 필수 |
| 제1저자 | `default_first_author` | 문자열 | 대화 입력 | 필수 |
| 대상 저널 | `default_target_journals` | 문자열 배열 | 대화 입력 | 필수 |
| 게이트 정책 | `auto_gates_default` | `"ask"` \| `"auto"` \| `"mixed"` | AskUserQuestion | 필수(기본 ask) |
| Gemini 키 | `api_keys.gemini` | 시크릿 문자열 | 대화 입력(마스킹) | 필수 |
| OpenAI 키 | `api_keys.openai` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| Anthropic 키 | `api_keys.anthropic` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| STORM 키 | `api_keys.storm_parse` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| Tavily 키 | `api_keys.tavily` | 시크릿 문자열 | 대화 입력(마스킹) | 선택 |
| 임베딩 provider | `embedding.provider` | `"gemini"` \| `"openai"` | AskUserQuestion | 필수(기본 gemini) |
| 임베딩 차원 | `embedding.dimensions` | `1024` | 고정 | 필수 |
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
- 선택 기능 활성화 여부(각각 yes/no): OpenAI 임베딩 / STORM 파싱 / Tavily 참조검색 / Supabase / 기관 프록시

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
    "tavily": ""
  },
  "embedding": { "provider": "gemini", "dimensions": 1024 },
  "rag": {
    "mode": "local",
    "local_corpus_dir": "~/.claude/paper-autopilot-open/corpus",
    "supabase": { "database_url": "", "direct_url": "", "service_role_key": "" }
  },
  "paper_access": { "institution_proxy_url": "" }
}
```

작성 후 JSON 유효성만 조용히 검증하고(파싱 성공 여부), 파일 내용을 화면에 통째로 출력하지 않는다 (시크릿 노출 방지).
