---
description: "투고 준비 — cover letter 초안 + 투고 체크리스트 + highlights/graphical abstract 문구"
argument-hint: "<manuscript file path> [target journal]"
allowed-tools: Read, Write, Glob, Grep, WebSearch
---

# /submission-prep — 투고 준비 도우미

manuscript와 target journal을 입력받아 투고에 필요한 3종 산출물을 한 번에 생성하는 단일 커맨드입니다. 외부 에이전트 의존 없이 이 프롬프트만으로 완결합니다.

## 입력

$ARGUMENTS

- **manuscript file path** (필수): `.md` / `.tex` / `.docx` / `.pdf`. 미지정 시 현재 폴더에서 Glob(`**/*.md`, `**/*.tex`)으로 후보를 찾아 사용자에게 확인.
- **target journal** (선택): 예) `Joule`, `Adv. Energy Mater.`, `Adv. Mater.`, `Nature Energy`, `EES`, `JACS`, `Angew. Chem.`, `ACS Nano`, `Nature Communications`. 미지정 시 manuscript에서 추정하거나 사용자에게 질문.

## 사전 절차

1. manuscript를 Read로 읽어 다음을 추출: **제목, 저자/교신저자, 핵심 주장(1문장), 주요 결과 3–5개(수치 포함), 신규성(무엇이 처음인가), 대상 독자/응용**.
2. target journal이 주어지면 WebSearch로 해당 저널의 **투고 형식 요구사항**(원고 유형별 word/figure limit, reference 스타일, cover letter·highlights·graphical abstract 요구 여부, figure 해상도/포맷 규격)을 확인. 검색이 불가하면 일반적 관례로 진행하되 "저널 공식 author guidelines에서 최종 확인 필요"를 명시.
3. 아래 세 산출물을 생성한다. 각 산출물의 불확실한 수치·저자정보는 원고에서만 인용하고, 없으면 `[[채워넣기: ...]]` placeholder로 남긴다(추정 금지).

---

## 산출물 A — Cover Letter 초안

editor 앞 공식 서한. 구성:
1. 인사 + 원고 제목/유형 + 투고 저널명.
2. **1문단 — 무엇을, 왜 지금**: 다루는 문제와 그 중요성(분야 맥락).
3. **1문단 — 핵심 발견과 신규성**: 주요 결과(수치 포함)와 이 저널 독자에게 왜 새로운지. 가장 가까운 선행연구 대비 무엇이 진전인지 1–2문장.
4. **1문단 — 저널 적합성**: 이 저널의 scope/독자와 왜 맞는지.
5. 표준 선언문(미출판/동시투고 없음, 모든 저자 동의, 이해상충 유무) — 사실 확인이 필요한 부분은 placeholder.
6. (선택) 추천 리뷰어 / 배제 리뷰어 자리 — 저널이 요구 시.
7. 교신저자 서명 블록.

문체: 간결·전문적, 과장 금지("groundbreaking" 류 지양). 신규성 주장은 원고가 뒷받침하는 범위 내에서만. 1페이지 이내.

산출: manuscript와 같은 폴더에 `submission/cover_letter.md`.

---

## 산출물 B — 투고 체크리스트

target journal 요구사항 대비 원고 상태를 점검한 표. 각 항목: 요구값 / 현재 상태 / OK·확인필요.

점검 항목(저널별로 값 채움):
- **원고 유형** (Article / Communication / Letter 등)과 그에 따른 한도
- **Word limit** (본문·abstract) — 현재 원고 단어 수와 비교(Grep/개략 카운트)
- **Figure/Table 수 한도** — 현재 개수
- **Figure 규격** — 포맷(TIFF/EPS/PDF), 해상도(예: 300–600 dpi), 컬럼 폭, 폰트 최소 크기
- **Abstract** 형식(구조화 여부, 단어 수), **Graphical abstract** 요구 여부/규격
- **Highlights** 요구 여부(개수·문자 수 한도)
- **Reference 스타일**(번호/저자-연도), 자동번호 사용 금지 여부, 저널 약어 형식
- **Supporting Information** 별도 파일 요구
- **필수 동반 문서**: cover letter, highlights, graphical abstract, 저자기여(CRediT), 이해상충 선언, 데이터 가용성 문구, (요구 시) 추천 리뷰어
- **투고 시스템**(예: Editorial Manager / ScholarOne) 및 계정 준비

각 "확인필요" 항목에는 구체적 액션(예: "Figure 3 축 폰트 6 pt → 8 pt 확대")을 제시.

산출: `submission/checklist.md`.

---

## 산출물 C — Highlights & Graphical Abstract 문구 초안

1. **Highlights**: 3–5개 bullet, 각 ≤ 85자(대부분 저널 상한). 결과 중심·수치 포함·동사로 시작. 원고 주요 결과에서 도출.
2. **Graphical Abstract 캡션/설명**: 한 장의 그림으로 논문을 요약하는 시각 개념을 텍스트로 기술(핵심 before→after 또는 구조→성능 관계, 핵심 수치 1–2개). 실제 이미지 생성이 필요하면 `/paper-autopilot-open:ppt-image`로 넘길 수 있도록 image-spec 형태의 1개 슬라이드 초안(`## Slide 1: Graphical Abstract` + 레이아웃/텍스트 기술)도 함께 제공.

산출: `submission/highlights_and_graphical_abstract.md`.

---

## 실행

1. manuscript 로드 + 핵심 요소 추출.
2. target journal 요구사항 확인(WebSearch 가능 시).
3. A·B·C 세 파일을 `submission/` 폴더에 생성(폴더 없으면 만든다).
4. 사용자 보고: 생성 파일 3개 경로 + 확인 필요한 placeholder 목록 + 저널 공식 author guidelines에서 최종 대조가 필요한 항목.

## 제약

- 수치·저자정보는 원고에서만 인용. 불명확하면 `[[채워넣기: ...]]` placeholder(추정 금지).
- 신규성/우선권 주장("최초로", "unprecedented")은 원고가 뒷받침하는 범위로 제한하고, 사용자 확인 필요 표시.
- 저널 형식 세부는 시간에 따라 바뀌므로 항상 "공식 author guidelines 최종 확인" 문구를 남긴다.
