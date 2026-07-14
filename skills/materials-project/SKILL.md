---
name: materials-project
description: >-
  Materials Project(MP) API로 결정구조·재료 물성(밴드갭, formation energy, 상안정성 energy_above_hull,
  공간군·대칭, 격자상수, 밀도, 탄성·자성·유전 등)을 실데이터로 조회해 논문 서술을 grounding/fact-check하는 스킬.
  의존성 없는 REST(curl + X-API-KEY)를 정본으로 사용하며, 조회한 모든 수치는 mp-id와 함께 인용한다.
  TRIGGER: 원고·figure·target metric에 결정구조, 재료구조, 재료 물성, 밴드갭, formation energy,
  상안정성/열역학 안정성, 공간군/대칭, 격자상수, 밀도, mp-id, "Materials Project", CIF, polymorph 등이
  등장하고 그 수치의 실데이터 검증·근거 확보가 필요할 때. aw-technical-reviewer / ra-figure-set /
  ep-target-finder 등 서브에이전트가 재료 수치를 대조하려 할 때 이 스킬 레시피를 따른다.
---

# Materials Project 조회 스킬 (battery / materials)

배터리·재료과학 논문에는 결정구조와 재료 물성 서술이 반드시 나온다(공간군, 격자상수, 밴드갭,
formation energy, 상안정성, 밀도, 탄성·자성 등). 이 스킬은 그런 수치를 **Materials Project(MP) 실데이터**로
확인·근거화하기 위한 것이다. 목적은 두 가지:

1. **Grounding** — 논문에 재료 수치를 쓸 때 MP 실값 + mp-id로 뒷받침.
2. **Fact-check** — 원고에 이미 적힌 물성 주장이 MP 값과 맞는지 대조, 불일치를 보고.

> ⚠️ **AI가 물성 수치를 지어내지 말 것.** 아래 절차로 실제 조회하고, 조회 못 하면(키 없음·미등재)
> 정직하게 그 사실을 보고한다. hallucinate로 대체하는 것은 금지.

상세 curl 레시피·응답 필드·오류 대응은 `references/api-recipes.md`에 분리되어 있다 — 실제 호출 전 반드시 참조.

---

## 1. API 키 로딩 (호출 전 필수)

다음 순서로 키를 찾는다:

1. **config 파일**: `~/.claude/paper-autopilot-open/config.json` 의 `api_keys.materials_project`
2. **환경변수**: 위가 비어있으면 `MP_API_KEY`
3. **둘 다 없으면**: 스킬 사용 불가 — 아래 안내 후 우아하게 종료.

```bash
# 키 로딩 (셸)
MP_KEY="$(python -c "import json,os,pathlib; p=pathlib.Path.home()/'.claude/paper-autopilot-open/config.json'; k=(json.load(open(p)).get('api_keys',{}).get('materials_project','') if p.exists() else ''); print(k)" 2>/dev/null)"
[ -z "$MP_KEY" ] && MP_KEY="${MP_API_KEY:-}"
if [ -z "$MP_KEY" ]; then
  echo "MP_KEY_MISSING"
fi
```

키가 없을 때(`MP_KEY_MISSING`) 사용자에게 이렇게 안내하고 이 단계에서 멈춘다:

> "Materials Project 조회를 하려면 API 키가 필요합니다. `/paper-autopilot-open:onboard`의 config 단계에서
> `api_keys.materials_project`를 등록하거나 환경변수 `MP_API_KEY`를 설정하세요.
> 무료 발급: https://next-gen.materialsproject.org/api . 키가 없으면 이 재료 수치는 **미검증 상태**로 두고,
> 절대 값을 추정해 채우지 않습니다."

> 🔒 키는 로그·파일·셸 history에 남기지 말 것. 보고 시 키 문자열 노출 금지.

---

## 2. 호출 방식 — 의존성 없는 REST 우선

정본은 **curl + `X-API-KEY` 헤더**. Python `mp-api`(MPRester)가 이미 설치돼 있으면 사용해도 되지만
이 스킬의 요구사항은 아니다 — 설치·환경 가정 없이 curl로 동작해야 한다.

| 항목 | 값 |
|------|----|
| Base URL | `https://api.materialsproject.org` |
| 인증 | 헤더 `X-API-KEY: ${MP_KEY}` |
| 응답 | JSON `{"data":[...],"meta":{...}}` — 레코드는 `data` 배열 |
| 필드 선별 | `_fields=a,b,c` **항상 사용**(없으면 전체 문서 → 낭비) |
| 페이지 | `_limit=N`, `_skip=N` |

기본 호출 형태:

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?formula=LiFePO4&_fields=material_id,formula_pretty,symmetry,band_gap,formation_energy_per_atom,energy_above_hull,density,is_stable&_limit=20"
```

---

## 3. 핵심 쿼리 패턴 (요약 — 상세는 references/api-recipes.md)

| # | 목적 | 엔드포인트 | 키 파라미터 |
|---|------|-----------|-------------|
| 1 | formula/chemsys/mp-id → 물성 요약 ★ | `/materials/summary/` | `formula=` / `chemsys=` / `material_ids=` + `_fields=` |
| 2 | 상안정성 판정 | (summary의 `energy_above_hull`) | E_hull ≤ 0.025 eV/atom 관례 |
| 3 | 결정구조 상세(공간군·격자·CIF) | `/materials/summary/`(`symmetry`,`structure`) 또는 `/materials/core/` | `_fields=symmetry,structure` |
| 4 | 물성별 세부 | `/materials/elasticity/` · `/magnetism/` · `/dielectric/` · `/electronic_structure/` · `/thermo/` … | `material_ids=` + `_fields=` |
| 5 | 페이지네이션·rate limit | 전 엔드포인트 | `_limit` / `_skip`, 대량 스캔 지양 |
| 6 | 화학식→mp-id 역추적(다형 구분) | `/materials/core/formula_autocomplete/` + summary | polymorph 매칭 |

**필수 요약 필드**: `material_id, formula_pretty, symmetry, band_gap, formation_energy_per_atom,
energy_above_hull, density, volume, is_stable`.

**안정성 해석**: `energy_above_hull == 0` → hull 상 안정상; `≤ 0.025 eV/atom` → 합성 가능(준안정 포함) 관례 상한;
`> 0.1` → 불안정 경향. 이는 0 K DFT 열역학 기준이며 kinetic/표면/엔트로피 안정화는 미반영.

각 레시피의 실제 curl 예시 + 응답 필드 의미 + 파싱/오류 대응은 **`references/api-recipes.md`** 참조.

---

## 4. 논문 파이프라인 활용 규칙 (엄수)

**(a) mp-id + accessed 날짜와 함께 인용.** 논문에 쓰는 모든 MP 수치는 반드시 출처 표기:

> "LiFePO4는 사방정계 olivine 구조(공간군 Pnma)로 결정화한다 (Materials Project, mp-19017, accessed 2026-07-14)."

**(b) DFT 계산값임을 명시.** MP 물성은 GGA/GGA+U DFT 계산값이다 — **실험값과 혼동 금지**.
특히 **밴드갭은 실험 대비 과소평가 경향**(GGA 계통 한계). 논문에서 MP 밴드갭을 실험 밴드갭인 양 쓰지 말 것.
필요 시 "DFT(GGA) 계산 밴드갭" 등으로 한정.

**(c) 미등재는 정직하게.** 조회 실패·`data:[]`(미등재)면 값을 지어내지 말고 "MP 미등재"로 보고.
화학식 표기차 가능성은 레시피 6로 한 번 더 확인한 뒤 판정.

**(d) 사용자 값 vs MP 값 충돌 시 중립.** 사용자 자신의 계산/실험값과 MP 값이 다르면,
어느 쪽도 자동으로 "정답" 취급하지 말고 **비교 서술 소재**로 제시(예: "본 연구 실측 X, MP DFT 값 Y —
차이는 계산 수준/실험 조건 차이로 해석 가능"). 판단은 사용자에게 남긴다.

---

## 5. 서브에이전트 사용법

이 스킬은 Task로 dispatch되는 서브에이전트도 활용한다. 에이전트(예: `aw-technical-reviewer`,
`ra-figure-set`, `ep-target-finder`)는 **이 SKILL.md와 `references/api-recipes.md`를 Read**한 뒤
동일한 키 로딩(§1) → curl 레시피(§3, api-recipes.md) → 인용 규칙(§4)을 따르면 된다.
에이전트는 자체 키 로딩·curl을 수행할 수 있으며, 키가 없으면 해당 단계를 skip하고 보고에 명시한다.

---

## 6. 미니 워크플로우 (fact-check 1건)

1. 원고에서 재료 물성 주장 추출 (예: "LiFePO4, Pnma, band gap ~3.7 eV").
2. §1로 키 로딩. 없으면 안내 후 종료(미검증 표시).
3. 레시피 1c/1a로 mp-id·summary 조회 (`_fields`로 band_gap·symmetry·E_hull 등).
4. 값 대조: 공간군 일치? 밴드갭은 DFT라 실험값과 다를 수 있음(과소평가) → severity 판단.
5. §4 규칙대로 인용 형식으로 근거 문장 제시하거나, 불일치를 severity와 함께 보고.
6. 미등재면 "MP 미등재"로 정직 보고.

---

## Constraints

- **hallucinate 금지** — 실제 조회 없이 물성 수치 생성 금지. 조회 불가 시 미검증/미등재로 정직 보고.
- **REST 우선** — curl + X-API-KEY가 정본. mp-api Python은 선택(설치 시에만).
- **`_fields` 항상 사용** — 전체 문서 요청 지양.
- **모든 MP 수치 = mp-id + accessed 날짜 인용**, DFT(GGA/GGA+U) 계산값 명시(밴드갭 과소평가 주의).
- **사용자 값을 MP로 덮어쓰지 않음** — 충돌은 비교 서술 소재.
- **키 비노출** — 로그·파일·history·보고에 키 문자열 남기지 말 것.
- **시간 표기 KST**(config timezone, 기본 Asia/Seoul) — accessed 날짜 동일 기준.
