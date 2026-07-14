# Figure Vision Extraction — Stage 1V (canonical schema)

figure vision 추출은 논문의 **figure set 전체**를 vision AI로 정독해, 각 figure가 무엇을 증명하고 서로 어떻게 이어져 논문 서사를 구성하는지를 구조화한다. 이 단계의 출력은 **`scripts/ingest/build-corpus.mjs`의 입력**이다(문단 report `<paper_id>.json`과 나란히 `<paper_id>.figures.json`으로 저장하면 build-corpus가 접미사 `.figures.json`으로 자동 감지·적재한다).

이 가이드는 **own·field 그룹 전용**이다. review 그룹은 분야 지식 검색만 필요하므로 figure vision을 수행하지 않는다.

아래 필드명은 정본 계약이다 — 이름을 바꾸지 말 것. **같은 스키마가 `skills/onboarding/references/corpus-build.md` 2.5에도 있으며 두 파일의 필드명은 동일해야 한다**(한쪽만 수정 금지).

## 입력·출력·비용

- **입력**: 논문 PDF 1편(Main + 가능하면 SI). Read 도구는 PDF를 페이지 vision으로 읽으며 **호출당 최대 20페이지**이므로, 페이지가 많은 논문은 분할해서 읽는다.
- **실행 주체**: Claude Code 서브에이전트(논문당 1개, 5편씩 배치). 메인 컨텍스트 오염을 막기 위해 격리 실행한다.
- **비용**: 구독 크레딧 사용 → **API 비용 0**. 논문당 수 분 소요.
- **출력**: 논문당 1개의 JSON — `<workspace>/_reports/<group>/<paper_id>.figures.json`.

## 정본 스키마

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

## 필드별 가이드

### figure 객체

- `fig_id` — 논문 표기 그대로의 figure 식별자 (`Fig1`, `Fig2`, SI는 `FigS1` 등).
- `fig_index` / `fig_total` — 이 figure의 순번과 Main figure 총 개수(1-based). `fig_total`은 Main 기준으로 일관 기재.
- `is_si` — Supplementary(SI) figure면 `true`, Main이면 `false`.
- `figure_type` — 이 figure를 구성하는 데이터 유형의 배열(한 figure에 여러 유형이 섞이면 모두 나열). 아래 controlled vocab에서 고르되, 없으면 자유어를 추가하되 vocab 우선.
- `panel_count` — 패널(subfigure) 개수. 단일 이미지면 1.
- `panel_grid` — 패널 배치를 `"행x열"`로 (예: `"1x3"`, `"2x2"`). 불규칙하면 가장 가까운 격자로 근사하고 불확실하면 `panels`로 보완.
- `panels[]` — 패널별 객체. `label`(논문 표기 그대로: `a`, `b`, …), `type`(해당 패널의 figure_type 하나), `summary`(패널이 보여주는 것 **1문장**). 패널 라벨이 없으면 `label`을 `"-"`로.
- `caption` — **원문 그대로**(verbatim). 요약·의역 금지. 이 필드가 quantitative_claims의 교차검증 기준이 된다.
- `key_message` — 이 figure가 논문에서 **증명하는 것** 1-2문장(캡션 복붙이 아니라 논지 관점의 해석).
- `narrative_role` — 아래 9종 고정 enum 중 하나(서사에서 이 figure가 맡는 역할).
- `narrative_context` — **앞** figure를 받아 무엇을 수행하고 **다음** figure로 어떻게 연결되는지 1문장. figure 간 인과 흐름을 담는다.
- `quantitative_claims[]` — 이 figure가 뒷받침하는 핵심 정량 주장 배열. **caption 원문과 교차검증된 수치만** 기재(아래 hallucination 가드).
- `domain_tags[]` — 도메인 태그(예: `Li-metal`, `NCM-cathode`, `solid-electrolyte`). 검색 필터에 쓰인다.

### 논문 수준 필드 (아크)

- `arc_pattern` — figure들의 `narrative_role`을 읽기 순서대로 ` → `로 이은 문자열(예: `design-concept → synthesis-structure → performance → mechanism → device-validation`).
- `arc_summary` — figure 흐름이 논문 서사를 어떻게 구성하는지 **3-5문장** 자연어.
- `narrative_logic` — 서사 논리 판정: `mechanism-first`(메커니즘을 먼저 세우고 성능으로 확증) vs `performance-first`(성능을 먼저 보이고 메커니즘으로 설명) 및 **SI로 미룬 것**(Main에서 빠지고 SI로 밀린 데이터 유형)을 함께 기술.

## `narrative_role` — 9종 고정 enum

| role | figure가 맡는 서사 역할 | 흔한 figure_type |
|------|-------------------------|------------------|
| `motivation` | 문제·동기 제시 (왜 이 연구가 필요한가, 기존 한계) | schematic, photograph |
| `design-concept` | 핵심 설계 개념·전략 제안 (제안 구조/메커니즘 도식) | schematic |
| `synthesis-structure` | 합성 결과·구조 규명 (만든 물질이 무엇인지) | XRD, Raman, FTIR, XPS, NMR, TGA, BET |
| `morphology` | 형태·미세구조 관찰 | SEM, TEM, HRTEM |
| `mechanism` | 메커니즘·원리 규명 (왜 그렇게 동작하는지) | operando-insitu, DFT-MD, EIS, XPS |
| `performance` | 핵심 성능 (용량·수명·rate·CE 등) | GCD-cycling, rate, CV, EIS |
| `benchmark-comparison` | 선행연구·대조군 대비 우위 | rate, GCD-cycling, schematic |
| `device-validation` | 디바이스·실사용 조건 검증 (풀셀/파우치/안전) | device-pouch, safety, GCD-cycling |
| `summary` | 종합·요약 (graphical abstract, 종합 도식) | schematic |

enum 밖 역할은 만들지 말고, 가장 가까운 role로 매핑한 뒤 애매하면 `key_message`에 근거를 남긴다.

## `figure_type` — controlled vocab (개방형, 우선 사용)

| type | 보통 보여주는 것 |
|------|------------------|
| `XRD` | 결정 구조·상(相) 규명 (회절 패턴) |
| `SEM` | 표면·단면 형태 (마이크로) |
| `TEM` | 내부 미세구조 (나노) |
| `HRTEM` | 격자 이미지·계면 (고해상 TEM) |
| `XPS` | 표면 화학 상태·조성 (결합 에너지) |
| `EIS` | 임피던스·계면 저항 (Nyquist) |
| `CV` | 산화·환원 거동 (순환 전압전류) |
| `GCD-cycling` | 충방전 곡선·수명·CE (정전류) |
| `rate` | 율속 특성 (C-rate별 용량) |
| `operando-insitu` | 작동 중 실시간 관찰 |
| `schematic` | 개념·메커니즘·구조 도식 (데이터 아님) |
| `DFT-MD` | 계산 결과 (DFT 에너지·MD 궤적·DOS 등) |
| `photograph` | 실물 사진 |
| `device-pouch` | 파우치/풀셀 디바이스 |
| `safety` | 안전성 (nail penetration·발열 등) |
| `Raman` | 진동 모드·상 규명 |
| `FTIR` | 작용기·결합 (적외선) |
| `BET` | 비표면적·기공 (등온 흡착) |
| `NMR` | 국소 구조·화학 환경 |
| `TGA` | 열 안정성·질량 변화 |

vocab에 없는 유형은 자유어로 추가하되, 같은 유형이 여러 논문에서 반복되면 vocab 편입을 제안한다.

## 추출 절차 (5단계)

1. **PDF vision 정독** — PDF를 페이지 vision으로 읽는다(호출당 ≤20페이지, 분할). 본문에서 각 figure가 어떻게 인용·해석되는지(“Figure N shows …”)를 함께 파악한다. SI가 있으면 SI figure도 훑어 `narrative_logic`의 "SI로 미룬 것"을 판정한다.
2. **figure 목록화** — Main figure를 순서대로 나열하고 `fig_id`/`fig_index`/`fig_total`/`is_si`를 채운다. `caption`은 **원문 그대로** 복사한다.
3. **패널별 분석** — 각 figure의 패널을 `label` 순서로 훑어 `panels[]`를 채운다. 패널 유형을 모아 figure의 `figure_type`·`panel_count`·`panel_grid`를 확정한다. 각 패널 `summary`는 1문장.
4. **서사 역할 판정** — figure별로 `key_message`(증명하는 것)와 `narrative_role`(9종 enum)을 정한다. 앞뒤 figure와의 연결을 `narrative_context` 1문장으로 적는다. `quantitative_claims`는 caption과 교차검증한 수치만.
5. **아크 구성** — 전체 `narrative_role`을 순서대로 이어 `arc_pattern`을 만들고, `arc_summary`(3-5문장)와 `narrative_logic`(mechanism-first vs performance-first + SI로 미룬 것)을 판정한다.

## Hallucination 가드 (반드시 준수)

- **`quantitative_claims`는 `caption` 원문과 교차검증된 수치만** 기재한다. 그래프에서 눈으로 읽어 추정한 값은 caption·본문에 명시되지 않았으면 넣지 않는다.
- **`caption`은 항상 원문 그대로 보존**한다(요약·의역·정규화 금지). 이 필드가 다른 필드의 검증 기준이다.
- **불확실한 패널 해석은 해당 `panels[].summary`에 "(불확실)"로 표기**한다. 확실한 것처럼 단정하지 않는다.
- figure 번호·패널 라벨은 논문 표기를 그대로 따른다(임의 재번호 금지).
- `narrative_role`은 9종 enum 밖으로 창작하지 않는다.

## Validation 체크리스트

완성된 `<paper_id>.figures.json`은 아래를 만족해야 한다:

- [ ] 모든 Main figure가 `figures[]`에 있고 `caption`이 원문 그대로다.
- [ ] 각 figure의 `narrative_role`이 9종 enum 안에 있다.
- [ ] `arc_pattern`의 role 나열이 `figures[]`의 읽기 순서와 일치한다.
- [ ] `quantitative_claims`의 모든 수치가 해당 `caption`(또는 본문)에서 확인된다.
- [ ] 불확실한 해석은 `(불확실)`로 표기됐다.

부족한 필드는 비워 두기보다 근거를 `key_message`/`arc_summary`에 남기고 진행한다.
