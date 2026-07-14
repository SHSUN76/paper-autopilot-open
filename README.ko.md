# paper-autopilot-open

[English](README.md) · **[한국어](README.ko.md)**

Claude Code용 **배터리/재료과학 논문 작성 feedback-loop 오케스트레이터**입니다. 아이디어와 figure set만 주면 표준 논문 폴더를 만들고, figure-first mockup을 그리고, 실제 논문 corpus에 근거해 원고를 쓰고 리뷰하고, figure의 데이터 칸을 채울 실험을 학부생 수준 SOP로 설계하고, 새 데이터가 들어올 때마다 전부 다시 진화시킵니다. 각 논문 폴더의 `CLAUDE.md` 허브 덕분에 세션이 끊겨도 즉시 컨텍스트가 복원됩니다. 이 배포판은 **open edition**입니다 — 개인 vault 없음, 공유·독점 corpus 없음, 다른 플러그인에 대한 하드 의존성 없음.

## 핵심 기능

- **Figure-first 파이프라인** — 논문을 figure 중심으로 설계한다. figure set → mockup → manuscript, 새 측정값이 들어오면 둘 다 재진화.
- **G1–G6 결정 게이트** — 오케스트레이터가 이름 붙은 게이트(scaffold 후, mockup 후, plan 후, simulation 후, evolve 후, 투고 전)에서 멈춘다. 게이트별 `ask`/`auto`/`mixed` 정책을 자연어로 지정.
- **적대적 spec 리뷰 (alpha)** — `pa-forcing-questions`가 모호한 개념을 specific해질 때까지 밀어붙이고, `pa-spec-review-loop`가 figure set / SOP / 초안을 다차원 채점하고 수정 루프를 돈다. (alpha: 스킬 로직 + mock dogfood 검증 완료, 실 reviewer dispatch 검증은 아직 보류.)
- **self-built corpus 기반 듀얼 RAG** — 검색 corpus를 **본인 논문**에서 직접 만든다. own·field에 더해 (선택) **review 논문 그룹**(≤5편, 분야 전반 빠른 파악용 — 문단 태깅·임베딩만 하고 스타일 프로파일·figure vision에서는 제외)을 넣을 수 있다. 빌드 시 프로파일 2종을 자동 생성한다: **own 작문 스타일 프로파일**(voice·hedge·phrasing exemplar)과 **field 분야 지식 프로파일**(연도 범위·주요 저널, `--since` 필터로 최신 흐름). 백엔드는 기본 `local`(온디스크 벡터스토어, 외부 DB 불필요), 선택 `supabase`(본인 프로젝트), 또는 `disabled`.
- **vision 기반 논문·figure 정밀 분석** — own/field 논문마다 Claude Code 서브에이전트가 PDF를 페이지 vision으로 정독(구독 크레딧, API 비용 $0)해 figure report를 만든다: 패널별 내용, figure별 증명 메시지, 서사 역할, figure들이 논문 서사를 잇는 아크, 그리고 논문이 분석 기법을 어떻게 썼는지 담는 optional `methodology` 블록.
- **figure 구성 + methodology(고도분석 사용 맥락) RAG** — 이 report가 검색 가능한 figure 인덱스(`figures.jsonl`)·아크 라이브러리(`figure-arcs.json`)와 함께, 각 분석 기법(advanced vs standard)이 **무엇을 증명하려고**(`evidence_target`) 어떤 목적으로 어떤 figure와 짝지어 쓰였는지를 담는 methods 인덱스를 만든다. 새 논문의 figure set·분석 전략을 설계할 때 `retrieve.mjs figures`/`figure-arcs`/`methods`로 분야의 exemplar figure 아크와 고도분석 기법 사용 맥락을 함께 검색할 수 있다.
- **corpus 관계도 리포트** — 온보딩 빌드가 own↔field 관계·섹션/claim/move 분포를 시각화한 단일 `corpus-report.html`을 생성.
- **번들 툴체인** — `ppt-image`(Gemini figure mockup), `docx`(pandoc 변환), `parse`(PDF 파싱, STORM 선택), `review-paper`(6-agent 심사), `submission-prep`(cover letter + 투고 체크). 외부 플러그인 불필요.
- **Materials Project 통합** — 결정구조·물성 실데이터 grounding (`materials-project` 스킬, 선택 `materials_project` API 키).
- **하이-오프 온보딩 마법사** — `/paper-autopilot-open:onboard`가 Node+Python 의존성 설치, Playwright MCP 동의 시 자동 설치(`claude mcp add playwright …`, Claude Code 재시작 후 로드), config 작성, corpus 폴더 자동 생성, 기관 도서관 프록시 반자동 등록(로그인은 브라우저에서 직접 — 자격증명은 세션에 남지 않음), corpus+프로파일+리포트 빌드까지 처리. 사용자가 손으로 할 일은 own ~5편 + field ~5편 PDF(+ 선택 review ≤5편)를 폴더에 넣는 것뿐. JSON을 손으로 편집할 필요 없음.
- **버전 관리** — 모든 산출물이 `[YYMMDD_내용]` 버전 폴더에 저장되고, 옛 버전은 덮어쓰지 않는다.

## 파이프라인

```
[ 아이디어 / figure set ]
        │
        ▼
   scaffold ............... 6폴더 구조 + CLAUDE.md 허브 + _paper.md 트래커
        │
        ▼
   PRD / SOP ............. 연구 계획 (research-autopilot Phase 1)
        │
        ▼
   figure mockup ......... figure_set.md → ppt-image → 4K mockup PNG
        │
        ▼
 experimental plan  <──>  academic writing
 (학부생 SOP,             (figure-first 초안 +
  gap 분석,               claim/hedge/move/AI-tell
  target metrics)         리뷰어, corpus-grounded)
        │
        ▼ (루프: 새 input/ 데이터마다 → mockup V_n+1 → manuscript V_n+1)
        │
        ▼
   submission ............ cover letter + 포맷 + 참고문헌 감사
```

## 빠른 시작

Claude Code에서:

```
/plugin marketplace add SHSUN76/paper-autopilot-open
/plugin install paper-autopilot-open@paper-autopilot-open-marketplace
/paper-autopilot-open:onboard
```

온보딩 마법사가 사전 점검, 의존성 설치, config 파일, corpus 구축, 검증을 모두 처리합니다. 상세·수동 경로는 [INSTALL.md](./INSTALL.md) 참조.

## 요구사항

| 항목 | 필수/선택 | 무엇에 쓰이나 |
|------|-----------|---------------|
| Claude Code (최신) + Fable 5 접근 | **필수** | 플러그인 호스트; 작문 에이전트 13종이 `model: fable` 핀 |
| Node.js 18+ | **필수** | RAG 헬퍼 스크립트(`retrieve.mjs`, `build-corpus.mjs`) |
| `git` | **필수** | 플러그인 설치·업데이트 |
| Gemini API 키 | **필수** | figure mockup + 기본 임베딩(`gemini-embedding-001`) |
| OpenAI API 키 | 선택 | 임베딩 대안 provider(`text-embedding-3-large`) |
| Anthropic API 키 | 선택 | API 경로 corpus mining (기본은 서브에이전트 = 무료) |
| STORM API 키 | 선택 | 고품질 PDF 파싱(`parse`) |
| Tavily API 키 | 선택 | 웹 참조 검색(`ppt-image --ref`) |
| Materials Project API 키 | 선택 | 결정구조·재료 물성 데이터(`materials-project` 스킬) |
| pandoc | 선택 | Markdown → docx(`docx`) |
| Python 3.10+ | 선택 | PDF 파싱·figure 추출·docx (`pip install -r scripts/requirements.txt`: PyMuPDF, Pillow, python-docx, requests) |
| Playwright MCP | 선택 | 기관 구독 접근 + 프록시 반자동 등록(`paper-access`) |
| Supabase 프로젝트 | 선택 | `rag.mode=supabase` 클라우드 벡터스토어 |

## RAG 아키텍처 (2층)

검색 시스템은 **고정된 통계 prior**와 **본인 exemplar**를 짝짓는다:

1. **번들 집계 통계(108편).** `skills/academic-writing/references/corpus-evidence.md`에 108편 배터리/재료 논문 조사에서 뽑은 정량 분포(claim type, hedge level, rhetorical-move 전이, AI-tell 임계값)가 들어 있다. **통계만** 있고 원문 텍스트는 없으며, 리뷰 규칙의 근거가 된다.
2. **사용자 self-built corpus.** 본인 논문 ~5편 + 분야 논문 ~5편(+ 선택 review ≤5편)을 문단 리포트로 태깅해 온디스크 벡터스토어(`~/.claude/paper-autopilot-open/corpus`)에 임베딩한다. 이 층이 `retrieve.mjs`로 exemplar 검색·문체 grounding을 담당한다. 빌드는 프로파일 2종도 생성한다 — `style-profile.json`(**own** 작문 voice·hedge·phrasing)과 `field-profile.json`(**field** 연도 범위·주요 저널) — `retrieve.mjs style-profile`/`field-profile`로 조회하고, `paragraphs --since <year>`로 최신 분야 논문만 뽑을 수 있다. 문단 층 위에 own/field 논문은 **figure vision 패스**도 받는다: 논문별 figure report(패널·figure별 key message·서사 역할·아크)가 검색 가능한 `figures.jsonl` + `figure-arcs.json`을 만들고 `retrieve.mjs figures`/`figure-arcs`로 조회한다. `corpus-report.html`이 own↔field 관계도를 시각화한다. (**review** 그룹은 지식 검색용 문단 태깅만 받고 스타일 프로파일·figure 패스에서는 제외.)

prior는 *무엇이 정상인지*를, **own** corpus는 *당신이 어떻게 쓰는지*를, **field** corpus는 *당신 분야가 실제로 어떻게 쓰는지*를 제공한다. corpus가 ~30편을 넘으면 그 corpus로 통계를 재보정하는 것을 권장한다. **Supabase**는 로컬 스토어의 선택적 대체(`rag.mode=supabase` + `scripts/setup/corpus-schema.sql` + `ingest-supabase.mjs`)이고, `disabled`는 RAG를 꺼서 품질을 낮춘 오프라인 모드로 만든다.

## 비용 투명성

| 작업 | 비용 | 비고 |
|------|------|------|
| corpus 임베딩 | **10편당 < $0.5** (OpenAI) / **$0** (Gemini 무료 티어) | 논문당 1회, 이후 증분 |
| figure 이미지 | **~$0.03/장** (flash) / **~$0.24/4K** (pro) | pro는 3D scheme figure 전용 |
| corpus mining(PDF→태깅) | **$0** | API가 아니라 Claude Code 서브에이전트(구독 크레딧)에서 실행 |

비용이 발생하는 단계는 실행 전에 예상 비용을 알리고 동의를 받는다.

## 커맨드 & 스킬

**커맨드** — 전체 호출명 = `/paper-autopilot-open:<name>`. 아래 행은 name-only 표기.

| 커맨드 (name) | 용도 |
|--------|------|
| `onboard` | 첫 실행 설정 마법사 (사전점검 → 설치 → config → corpus → 검증) |
| `paper-autopilot` | 메인 오케스트레이터 진입점 (폴더 분석, 다음 단계 dispatch) |
| `paper-autopilot:scaffold` | 새 논문 폴더 생성 |
| `paper-autopilot:status` | 읽기 전용 stage 보고 (dispatch 없음) |
| `paper-autopilot:resume` | 마지막 기록된 액션에서 재개 |
| `paper-autopilot:version` | 새 `[YYMMDD_내용]` 버전 하위폴더 생성 |
| `ppt-image` | Gemini figure/슬라이드 mockup (pro/flash 라우팅, `--ref`) |
| `docx` | Markdown → Word (pandoc) |
| `parse` | PDF 파싱 (+ figure 추출, STORM 선택) |
| `review-paper` | 6-agent 투고 전 심사 보고서 |
| `submission-prep` | cover letter + 투고 준비도 |

**스킬** (13종): `onboarding`, `paper-autopilot`, `folder-scaffold`, `research-autopilot`, `academic-writing`, `experimental-plan`, `mockup-evolver`, `version-enforcer`, `pa-forcing-questions`, `pa-spec-review-loop`, 그리고 최상위 research 스킬 3종 — `paper-access`, `paper-corpus-mining`, `pdf-figure-extract`. 이들이 **32종 전문 에이전트**(오케스트레이터·phase writer·reviewer)를 조율한다.

## 한국어 사용자 안내

- 내부 지시문과 생성 산출물은 기본 **한국어**입니다. 영어권 사용자를 위한 orientation은 [README.md](./README.md)에 있고, 전체 i18n은 계획 중입니다.
- config의 `language`를 `ko`로, `timezone`을 `Asia/Seoul`로 두면 날짜·문체가 한국 기준으로 처리됩니다.
- 기관(대학) 구독 논문 접근이 필요하면 `paper_access.institution_proxy_url`에 소속 기관 도서관 프록시 패턴(`{URL}` placeholder 포함)을 넣고, Playwright MCP를 설치하세요. 특정 기관에 종속되지 않습니다.

## 문서

- [INSTALL.md](./INSTALL.md) — 설치 + 설정 (한국어, 영어 요약 포함)
- [WORKFLOW.md](./WORKFLOW.md) — 워크플로 mental model + state 모델
- [references/style-guide.md](./references/style-guide.md) — 리뷰어 에이전트가 강제하는 작문 스타일
- [references/version-mgmt-rules.md](./references/version-mgmt-rules.md) — `[YYMMDD_내용]` 명명 규칙
- [CHANGELOG.md](./CHANGELOG.md) — 릴리즈 이력

## 라이선스

MIT — [LICENSE](./LICENSE) 참조. RAG corpus는 본인 논문에서 만들며 재배포하지 않습니다.
