---
description: "PPT/figure 슬라이드 이미지 생성 (Gemini image, pro/flash 라우팅 + 참조 검색)"
argument-hint: "<markdown_file_path> [--model pro|flash] [--mode ...] [--ref] [--slides 1,2] ..."
allowed-tools: Read, Glob, Bash, Task, AskUserQuestion
---

# /ppt-image - PPT 슬라이드 이미지 생성 (v5.0)

PPT 초안 마크다운 파일을 기반으로 Gemini 이미지 모델을 사용해 4K 해상도 슬라이드 이미지를 생성합니다.

**버전 이력**
- **v5.0**: 모델 선택/재시도/참조 이미지 체계 + Agent Enrichment/슬라이드별 비율 혼합/infographic 모드 통합
- **v3.1**: 모델 선택 — `--model flash` (기본, `gemini-3.1-flash-image-preview`, ~$0.03/장) / `--model pro` (`gemini-3-pro-image-preview`, ~$0.24/4K)
- **v4**: Agent Enrichment (문서 컨텍스트 기반 프롬프트 강화), 슬라이드별 비율 지정(16:9/9:16/1:1 혼합), `infographic` 모드
- **v3**: 내용 유형 자동 감지 (flowchart/table/chart/hierarchy/equation/title/bullet), exponential backoff 자동 재시도 (429/500/503/timeout, 최대 3회)
- **v2**: `--ref` 옵션 — Tavily API로 웹에서 관련 다이어그램/그래프를 검색하여 참조 이미지로 활용

## 필수 API Key (설정)

- **GEMINI_API_KEY** (필수): 이미지 생성.
- **TAVILY_API_KEY** (선택): `--ref` 참조 이미지 검색 시에만.

키 설정 방법 (스크립트가 이 순서로 탐색):
1. `~/.claude/paper-autopilot-open/config.json` 의 `"api_keys": { "gemini": "...", "tavily": "..." }`
2. `${CLAUDE_PLUGIN_ROOT}/scripts/.env` (`GEMINI_API_KEY=...`, `TAVILY_API_KEY=...` — `scripts/.env.example` 참고)
3. 환경변수 `GEMINI_API_KEY` / `TAVILY_API_KEY`

## 필수 제약 (준수)

1. **3D scheme / scientific figure 생성 시 반드시 `--model pro` (flash 금지)**
2. **이 커맨드는 반드시 subagent에서 격리 실행 (context 오염 방지), 병렬 실행 시 파일명 충돌 주의** — 이미지 생성 로그·프롬프트가 메인 세션 컨텍스트를 오염시키지 않도록 전체 실행을 subagent에 위임하고, 병렬 배치는 `--slides` 집합이 겹치지 않게 분리할 것 (같은 슬라이드를 두 배치가 동시에 쓰면 `{style}_slide_{number}_{ratio}.png`가 충돌).

## 사용법

```
/ppt-image <markdown_file_path> [options]
```

## 실행 워크플로우

### Step 1: 입력 확인 및 옵션 결정

마크다운 파일에서 `## Slide N` / `## 섹션명` 패턴으로 슬라이드를 인식하고 개수를 보고합니다. 인라인으로 지정되지 않은 옵션은 AskUserQuestion으로 확인:

1. **모델**: `flash` (기본, ~$0.03/장, 4K 지원) vs `pro` (~$0.24/장, 고밀도 텍스트·포토리얼 우수)
   - 텍스트 중심 / 카드 레이아웃 / 타이포 → **flash** 충분
   - 3D scheme, 포토리얼 인물, 복잡 합성, 고밀도 텍스트 렌더링 → **pro**
2. **모드**: `full-slide` (전체 슬라이드) / `diagram` (다이어그램만) / `infographic` (계획서/보고서용, 밀도 높음)
3. **스타일**: professional / academic / tech / minimal / science
4. **언어**: en / kr
5. **참조 이미지**: `--ref` 활성화 여부
6. **문서 컨텍스트**: `--context <폴더경로>` — Enrichment agent가 참조할 원본 문서 폴더
7. **특정 슬라이드만?**: 전체 또는 특정 번호 지정

기본값: `--model flash --mode full-slide --size 4K --ratio 16:9 --style professional --lang en`

### Step 2: Agent Enrichment (조건부 — 스크립트 실행 전)

이미지 프롬프트를 원본 문서 내용으로 강화하는 단계. 실행 조건:
- `--context <폴더>` 옵션이 있으면 항상
- `--mode infographic`이면 항상
- 슬라이드 프롬프트가 5줄 미만으로 짧으면 실행 제안

**Enrichment agent의 목표**: image-specs.md의 슬라이드별 의도 + context 폴더의 문서(*.md)를 읽고, 각 프롬프트를 다음 기준으로 강화하여 `{원본폴더}/image-specs-enriched.md`로 저장한다.

- 이미지에 들어갈 모든 텍스트/수치를 프롬프트에 명시 (Gemini는 프롬프트에 있는 텍스트만 그림)
- 추상적 지시("~처럼") 대신 구체적 레이아웃 기술 (상단/중단/하단, 좌/우 컬럼)
- 표는 행/열 내용 전부 나열
- 숫자는 원본 문서에서만 추출 — 추정치 금지, 원본에 없으면 빈칸
- 비공식 코멘트(대화 내용) 제거 — 공식 문서 내용만
- 모드별 밀도: `full-slide/diagram`은 간결(키워드 중심), `infographic`은 밀도 높음(표+차트+텍스트 복합) — 프롬프트 길이 가이드: 일반 15줄+, infographic 30줄+
- 슬라이드별 비율 감지: 프롬프트에 "A4", "세로", "portrait", "9:16" 키워드가 있으면 해당 슬라이드를 9:16으로 분류

Enrichment는 Task 도구로 별도 subagent(executor-class, `model=sonnet` 권장)에 위임: 입력 = image-specs.md + context 폴더의 .md 파일들, 출력 = image-specs-enriched.md + 비율별 배치 실행 계획.

### Step 3: 비율별 배치 분할

image-specs-enriched.md (또는 원본)를 비율별로 분류하여 배치별 `--ratio`로 실행:

- **9:16 배치**: "A4", "세로", "portrait", "9:16" 키워드가 있는 슬라이드
- **1:1 배치**: 정사각형 지정 슬라이드
- **16:9 배치**: 나머지

배치는 병렬 실행(백그라운드) 가능 — 단, 필수 제약 2 참조: 배치 간 `--slides` 집합이 겹치지 않아야 한다.

### Step 4: 스크립트 실행

#### 기본 (Flash)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ppt/generate_ppt_slides.js" "<markdown_path>" --model <model> --mode <mode> --size 4K --ratio 16:9 --style <style> --lang <lang>
```

#### Pro 모델 (고품질 / 3D scheme)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ppt/generate_ppt_slides.js" "<markdown_path>" --model pro --mode <mode> --size 4K --ratio 16:9 --style <style> --lang <lang>
```

#### 참조 이미지 모드 (웹 검색 + multimodal)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ppt/generate_ppt_slides.js" "<markdown_path>" --model <model> --mode <mode> --size 4K --ratio 16:9 --style <style> --lang <lang> --ref --ref-count <N> --ref-save
```

#### 비율별 배치 (enriched 파일 기준)
```bash
# 9:16 배치
node "${CLAUDE_PLUGIN_ROOT}/scripts/ppt/generate_ppt_slides.js" "image-specs-enriched.md" --model <model> --mode <mode> --size 4K --ratio 9:16 --style <style> --lang <lang> --slides 1,2,3

# 16:9 배치
node "${CLAUDE_PLUGIN_ROOT}/scripts/ppt/generate_ppt_slides.js" "image-specs-enriched.md" --model <model> --mode <mode> --size 4K --ratio 16:9 --style <style> --lang <lang> --slides 8,11,12
```

#### 혼합 전략 (비용 최적화)
전체는 flash, 중요 슬라이드만 pro로 재생성:
```bash
# 1차: 전체를 flash로
node "${CLAUDE_PLUGIN_ROOT}/scripts/ppt/generate_ppt_slides.js" "draft.md" --model flash

# 2차: 특정 슬라이드만 pro로 재생성 (참조 여부에 따라 파일명이 달라질 수 있으니 확인 후 교체)
node "${CLAUDE_PLUGIN_ROOT}/scripts/ppt/generate_ppt_slides.js" "draft.md" --model pro --slides 8,28
```

### Step 5: 결과 보고

생성 이미지 목록·저장 경로, 성공/실패 수, 비율별 분류를 보고. 실패한 슬라이드는 원인과 함께 재시도를 제안.

출력 저장 위치는 입력 마크다운과 같은 폴더입니다(또는 스크립트 `--output <path>` 지정 시 해당 경로).

---

## 옵션 상세

### 기본 옵션

| 옵션 | 값 | 설명 |
|------|---|------|
| `--model` | `flash` | **기본** · `gemini-3.1-flash-image-preview` · 4K 지원 · ~$0.03/장 |
| `--model` | `pro` | `gemini-3-pro-image-preview` · 고품질/고밀도 텍스트 · ~$0.24/4K · **3D scheme 필수** |
| `--mode` | `full-slide` | 제목+내용+다이어그램 포함 전체 슬라이드 |
| `--mode` | `diagram` | 핵심 다이어그램/일러스트만 (PPT 삽입용) |
| `--mode` | `infographic` | 계획서/보고서용 밀도 높은 인포그래픽 (Enrichment 자동) |
| `--size` | `4K` | 4K 해상도 (기본값, 권장) |
| `--size` | `2K` | 2K 해상도 (빠른 생성) |
| `--ratio` | `16:9` | PPT 와이드스크린 (기본값) |
| `--ratio` | `9:16` | A4 세로 (계획서/보고서 풀페이지) |
| `--ratio` | `4:3` | PPT 표준 |
| `--ratio` | `1:1` | 정사각형 |
| `--ratio` | `auto` | 슬라이드별 프롬프트에서 비율 자동 감지 |
| `--style` | `professional` | 기업 발표용 깔끔한 디자인 |
| `--style` | `academic` | 학술 발표용 |
| `--style` | `tech` | 테크/스타트업 (다크 배경) |
| `--style` | `minimal` | 미니멀 (최대 여백) |
| `--style` | `science` | 과학/연구 발표용 |
| `--lang` | `en` | 영어 텍스트 |
| `--lang` | `kr` | 한국어 텍스트 |
| `--slides` | `1,2,3` | 특정 슬라이드만 생성 |
| `--output` | `<폴더경로>` | 출력 경로 지정 (기본: 원본과 같은 폴더) |
| `--parallel` | - | 병렬 생성 (API rate limit 주의) |
| `--dry-run` | - | 프롬프트만 확인, 이미지 미생성 |

> `--context` 옵션은 스크립트가 아니라 커맨드 워크플로우(Step 2 Enrichment)에서 처리합니다.

### 참조 이미지 옵션

| 옵션 | 값 | 설명 |
|------|---|------|
| `--ref` | - | 참조 이미지 검색 활성화 (Tavily API 사용) |
| `--ref-count` | `2` (기본) | 슬라이드당 참조 이미지 수 (최대 4) |
| `--ref-save` | - | 다운로드한 참조 이미지를 `_ref_images/` 폴더에 저장 |

### 참조 이미지 작동 원리

```
슬라이드 내용 분석 → 키워드 자동 추출 (제목 + 볼드 텍스트 + 기술 용어)
    → Tavily API로 관련 다이어그램/그래프 이미지 검색
    → 이미지 다운로드 (최대 4MB/장, 자동 필터링)
    → Gemini multimodal input으로 [참조 이미지 + 텍스트 프롬프트] 결합
    → 참조 스타일을 반영한 정확한 기술적 시각화 생성
```

**참조 이미지는 직접 복사되지 않습니다** — Gemini가 참조 이미지의 시각 스타일, 차트 유형, 다이어그램 레이아웃을 학습하여 새로운 원본 시각화를 생성합니다.

---

## 마크다운 형식 요구사항

슬라이드 구분은 다음 패턴 중 하나를 사용:

```markdown
## Slide 1: Title Here
(content)

## Slide 2: Another Title
(content)
```

또는 `## 슬라이드 N: 제목` 형식. 일반 `## 섹션명` 헤딩도 자동 인식됩니다.

### 슬라이드별 비율 지정 (선택)

프롬프트 내에 비율 키워드를 포함하면 `--ratio auto` 모드에서 자동 감지:

```markdown
## Slide 1: 비전 체계도
비율: 9:16 (A4 세로)
(내용)

## Slide 2: 비교표
비율: 16:9
(내용)
```

---

## 출력

- 기본 모드: `{style}_slide_{number}_{ratio}.png`
- 참조 모드: `{style}_slide_{number}_{ratio}_ref.png`
- 참조 이미지 (--ref-save): `_ref_images/slide_{number}_ref_{n}.{ext}`
- enriched 프롬프트: `image-specs-enriched.md` (Enrichment agent가 생성)
- 로그: `slide_generation_log.json`
- 저장 위치: 원본 마크다운과 같은 폴더 (또는 `--output`)

## 기술 사양

- **모델 (기본)**: `gemini-3.1-flash-image-preview`
- **모델 (옵션)**: `gemini-3-pro-image-preview` — `--model pro`로 전환
- **해상도**: 4K (최대 4096x4096px) — 두 모델 모두 지원
- **Google Search**: 활성화 (기술 컨텐츠 참조용)
- **내용 유형 감지**: flowchart, table, chart, hierarchy, equation, title, bullet-list
- **자동 재시도**: exponential backoff, 최대 3회 (429/500/503/timeout)
- **참조 이미지 검색**: Tavily API (include_images)
- **Multimodal Input**: inlineData (base64) + text prompt
- **비용 (4K, 1장 기준)**: Flash ~$0.03 (참조 포함 ~$0.04) / Pro ~$0.24 (참조 포함 ~$0.30)
- **50장 기준 총비용**: Flash ~$1.5 / Pro ~$12 (**약 8배 차이**)

## 모드 비교

| 항목 | full-slide | diagram | infographic |
|------|-----------|---------|-----------------|
| 용도 | PPT 발표 | PPT 삽입 다이어그램 | 계획서/보고서 풀페이지 |
| 정보 밀도 | 중간 | 낮음 | **높음** |
| 텍스트 양 | 제목+불릿 | 최소 | **표+차트+텍스트 복합** |
| Agent Enrichment | 선택 | 선택 | **자동** |
| 비율 | 주로 16:9 | 16:9 또는 1:1 | **9:16(A4) + 16:9 혼합** |
| 프롬프트 길이 | 5-10줄 | 3-7줄 | **15-40줄** |

| 항목 | 기본 모드 | 참조 이미지 모드 (`--ref`) |
|------|----------|--------------------------|
| 입력 | 텍스트 프롬프트만 | 참조 이미지 + 텍스트 프롬프트 |
| 시각화 정확도 | Google Search grounding (텍스트만) | 실제 다이어그램/그래프 참조 |
| 필수 API Key | GEMINI_API_KEY | GEMINI_API_KEY + TAVILY_API_KEY |

## 예시

```
# 기본 사용 (Flash = 기본, 4K, 전체 슬라이드, professional)
/ppt-image "path/to/PPT_Draft.md"

# Pro 모델 명시 (3D scheme / 고품질 필요 시)
/ppt-image "path/to/draft.md" --model pro

# 혼합 전략: 전체 flash + 특정 슬라이드만 pro로 재생성
/ppt-image "path/to/draft.md" --model flash
/ppt-image "path/to/draft.md" --model pro --slides 8,28

# 계획서 인포그래픽 — 문서 내용 기반 Enrichment
/ppt-image "path/to/image-specs.md" --mode infographic --context "path/to/sections/" --lang kr

# 비율 자동 감지 (A4 세로 + 16:9 혼합)
/ppt-image "path/to/specs.md" --ratio auto --mode infographic

# 참조 이미지 활용 (웹에서 관련 그래프/다이어그램 검색)
/ppt-image "path/to/draft.md" --ref --ref-count 3 --ref-save --style science

# 프롬프트만 미리보기
/ppt-image "path/to/draft.md" --ref --dry-run
```

$ARGUMENTS
