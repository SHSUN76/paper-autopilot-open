# Materials Project API — 쿼리 레시피 (next-gen REST)

> materials-project 스킬 SKILL.md에서 참조하는 상세 레시피. 모든 예시는 **의존성 없는 curl** 기준.
> Python `mp-api`(MPRester) 클라이언트가 설치돼 있으면 사용해도 되지만 요구사항 아님 — REST가 정본.

---

## 0. 공통 규격 (2026-07 확인)

| 항목 | 값 |
|------|----|
| Base URL | `https://api.materialsproject.org` |
| 인증 헤더 | `X-API-KEY: <your_key>` (권장 방식) |
| 응답 형식 | JSON `{"data": [ ... ], "meta": { ... }}` — 실제 레코드는 항상 `data` 배열 |
| 필드 선별 | `_fields=a,b,c` (**항상 사용** — 없으면 전체 문서를 받아 낭비/느림) |
| 페이지 크기 | `_limit=N` (기본 작음, 최대 1000 근처. 큰 쿼리는 분할) |
| 페이지 이동 | `_skip=N` 또는 `_page=N`+`_per_page=N` |
| 전체 필드 | `_all_fields=true` (디버깅용, production 금지) |

출처: Materials Project API docs (`https://api.materialsproject.org/docs`, OpenAPI `/openapi.json`),
`https://docs.materialsproject.org/downloading-data/using-the-api/querying-data`. 발급: `https://next-gen.materialsproject.org/api`.

curl 공통 형태:

```bash
MP_KEY="$(...키 로딩: SKILL.md 참조...)"
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?formula=LiFePO4&_fields=material_id,formula_pretty"
```

> `curl -s`로 진행 표시 억제. HTTP 오류 확인이 필요하면 `-w '\n%{http_code}\n'` 추가.
> 키·응답에 시크릿 로그 남기지 말 것 (셸 history / 파일 저장 금지).

---

## 레시피 1 — summary 조회 (formula / chemsys / mp-id) ★ 핵심

가장 많이 쓰는 만능 엔드포인트. `/materials/summary/`는 물성 요약을 한 번에 준다.

### 1a. Formula로 조회

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?formula=LiFePO4&_fields=material_id,formula_pretty,symmetry,band_gap,formation_energy_per_atom,energy_above_hull,density,volume,is_stable&_limit=20"
```

### 1b. Chemical system(chemsys)으로 조회 — 그 계의 모든 상

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?chemsys=Li-Fe-P-O&_fields=material_id,formula_pretty,energy_above_hull,is_stable&_limit=100"
```

### 1c. mp-id로 단일 재료 조회

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?material_ids=mp-19017&_fields=material_id,formula_pretty,symmetry,band_gap,formation_energy_per_atom,energy_above_hull,density"
```

### 핵심 응답 필드 설명

| 필드 | 의미 | 단위/형태 |
|------|------|-----------|
| `material_id` | MP 고유 ID | 문자열 `"mp-19017"` — **인용에 필수** |
| `formula_pretty` | 정규화 화학식 | `"LiFePO4"` |
| `symmetry` | 대칭 정보 객체 | `{crystal_system, symbol(공간군 Hermann-Mauguin), number(1-230), point_group}` |
| `band_gap` | DFT 밴드갭 | eV (**GGA/GGA+U — 실험 대비 과소평가**) |
| `formation_energy_per_atom` | 형성 에너지 | eV/atom (음수일수록 안정) |
| `energy_above_hull` | convex hull 위 에너지 | eV/atom (**안정성 지표** — 레시피 2) |
| `density` | 밀도 | g/cm³ |
| `volume` | 단위 셀 부피 | Å³ |
| `is_stable` | MP 판정 안정성 | boolean (`energy_above_hull == 0` 근사) |

> `symmetry.symbol`이 공간군(예: `"Pnma"`), `symmetry.number`가 공간군 번호(예: 62).
> 격자상수(a,b,c,α,β,γ)는 summary에 직접 없음 — 레시피 3(core / structure)에서 얻는다.

---

## 레시피 2 — 안정성 판정 (energy_above_hull)

`energy_above_hull`(E_hull) 해석 관례:

| E_hull (eV/atom) | 해석 |
|------------------|------|
| `0` (정확히) | convex hull 상 — 열역학적 ground-state 안정상 |
| `≤ 0.025` | **관례적 "안정/합성 가능" 상한** (상온 열요동 ~kT 규모). 준안정이나 실측 다수 합성됨 |
| `0.025 – 0.1` | 준안정 — 조건부 합성 가능(급냉·박막·나노 등) |
| `> 0.1` | 불안정 경향 — 벌크 합성 난이도 높음 |

논문 서술 예: "mp-19017 (Pnma LiFePO4)는 convex hull 상(E_hull = 0 eV/atom, Materials Project, accessed 2026-07-14)으로 열역학적 안정상이다."

주의: E_hull은 **0 K DFT 형성에너지 기반** 열역학 안정성이며, 반응속도(kinetic)·표면·엔트로피 안정화는 반영 안 됨.
0.025 임계값은 절대 기준이 아니라 관례 — 논문에서 인용할 때 "MP 관례 기준"임을 밝힐 것.

---

## 레시피 3 — 결정구조 상세 (공간군 · 격자 · CIF)

### 3a. 공간군 + 대칭 (summary로 충분)

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?material_ids=mp-19017&_fields=material_id,symmetry"
```

`symmetry` → `crystal_system`(예: Orthorhombic), `symbol`(공간군 기호 Pnma), `number`(62), `point_group`.

### 3b. 격자상수 · 원자좌표 · 구조(structure 필드)

격자상수·원자 위치가 필요하면 `structure` 필드를 요청. pymatgen Structure JSON(dict)이 반환됨:

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?material_ids=mp-19017&_fields=material_id,structure" \
  > /tmp/mp-19017_structure.json
```

`data[0].structure.lattice` → `{a, b, c, alpha, beta, gamma, volume, matrix}` (Å, 도).
`data[0].structure.sites` → 원자별 `{species, abc(분수좌표), xyz(데카르트)}`.

### 3c. CIF가 필요하면

REST summary는 CIF 문자열을 직접 주지 않는다. 두 경로:
1. `structure` 필드(3b)를 받아 pymatgen `Structure.from_dict(...).to(fmt="cif")`로 변환 (pymatgen 설치 시).
2. `/materials/core/` 엔드포인트의 구조 필드 사용 (초기 구조 포함).

구조 파일이 실제 계산 입력으로 필요한 경우가 아니면, 논문 서술에는 공간군+격자상수(3a/3b)면 충분하다.

---

## 레시피 4 — 물성별 sub-endpoint

summary에 없는 세부 물성은 전용 엔드포인트로. 모두 `material_ids=` + `_fields=` + `X-API-KEY` 동일 패턴.

| 엔드포인트 | 용도 | 대표 필드 |
|-----------|------|-----------|
| `/materials/elasticity/` | 탄성 상수 | `bulk_modulus`, `shear_modulus`, `elastic_tensor`, `young_modulus`, `poisson_ratio` |
| `/materials/magnetism/` | 자성 | `ordering`(FM/AFM/NM/FiM), `total_magnetization`, `num_magnetic_sites`, `magmoms` |
| `/materials/dielectric/` | 유전/광학 | `e_total`, `e_ionic`, `e_electronic`, `n`(굴절률), `e_ij_max` |
| `/materials/electronic_structure/` | 전자구조 요약 | `band_gap`, `is_gap_direct`, `cbm`, `vbm`, `efermi` |
| `/materials/electronic_structure/bandstructure/` | 밴드구조 객체 | band structure task/plot data |
| `/materials/electronic_structure/dos/` | 상태밀도 | DOS 객체 |
| `/materials/thermo/` | 열역학 | `formation_energy_per_atom`, `energy_above_hull`, `decomposition_enthalpy`, `stability` |
| `/materials/eos/` | 상태방정식 | 부피-에너지 곡선, B0 |
| `/materials/bonds/` | 결합 정보 | 배위수, 결합 길이 |
| `/materials/chemenv/` | 화학환경 | 배위 다면체(coordination environment) |
| `/materials/absorption/` | 광흡수 | 흡수 스펙트럼 |
| `/materials/conversion_electrodes/`, `/materials/insertion_electrodes/`* | 전극(배터리) | 전압 프로파일, 용량, 부피변화 |

\* insertion_electrodes 계열은 배터리 논문에 특히 유용(평균 전압, 이론용량, 부피변화율). 정확한 경로/필드는 발급 후 `/materials/summary` 및 `/docs`(Swagger)에서 확인.

예 — 탄성:

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/elasticity/?material_ids=mp-19017&_fields=material_id,bulk_modulus,shear_modulus"
```

예 — 자성:

```bash
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/magnetism/?material_ids=mp-19017&_fields=material_id,ordering,total_magnetization"
```

> 여기 필드명은 대표값 — MP 스키마는 갱신될 수 있다. 정확한 필드 목록은 발급 후
> `/materials/summary`(및 각 sub-endpoint) Swagger 문서(`https://api.materialsproject.org/docs`)를 참조.

---

## 레시피 5 — 페이지네이션 · rate limit

### 페이지네이션

- 한 번에 큰 결과가 예상되면 `_limit`으로 페이지 크기 지정(예: `_limit=100`), 다음 페이지는 `_skip=100` 증가.
- 응답 `meta.total_doc`(총 문서 수)로 전체 규모 확인 후 반복.
- 필요한 필드만 `_fields`로 받아 페이로드 최소화.

```bash
# 2페이지째 (100건씩)
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?chemsys=Li-Fe-P-O&_fields=material_id,formula_pretty,energy_above_hull&_limit=100&_skip=100"
```

### Rate limit / 매너

- 공식적으로 강한 rate limit 문서는 없으나, 짧은 시간 대량 호출은 스로틀될 수 있다.
- **논문 fact-check 용도는 재료 몇 개 단위** — 한 번에 한 재료씩, 필요한 필드만. 반복문 대량 스캔은 지양.
- 429/503 응답 시 잠시 대기 후 재시도. mp-id 조회 결과는 세션 내 재사용(중복 호출 금지).

---

## 레시피 6 — 재료 찾기 (formula/구조로 mp-id 역추적)

원고에 화학식만 있고 mp-id를 모를 때:

```bash
# 화학식 자동완성으로 후보 확인
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/core/formula_autocomplete/?formula=LiFePO4"

# summary formula 조회 후 가장 안정한(E_hull 최소) 것을 대표상으로
curl -s --header "X-API-KEY: ${MP_KEY}" \
  "https://api.materialsproject.org/materials/summary/?formula=LiFePO4&_fields=material_id,formula_pretty,symmetry,energy_above_hull,is_stable&_limit=50"
```

같은 화학식에 **여러 polymorph(다형)** 가 존재 → 원고가 지칭하는 상(공간군/합성조건)과 매칭되는 mp-id를 골라야 한다.
공간군이 원고와 다르면 "원고는 X상(공간군 Y)을 지칭 — MP의 대응 상은 mp-ZZZ"로 명시.

---

## 반환값 파싱 팁 (jq 없이도)

- 응답은 항상 `{"data":[...],"meta":{...}}`. 첫 레코드는 `data[0]`.
- jq 있으면: `curl ... | jq '.data[0] | {material_id, band_gap, energy_above_hull}'`.
- jq 없으면 Python 한 줄: `curl ... | python -c "import sys,json;d=json.load(sys.stdin)['data'];print(d[0] if d else 'NO MATCH')"`.
- `data`가 빈 배열 → **MP 미등재** (레시피 6에서 화학식/공간군 재확인, 그래도 없으면 정직하게 "MP 미등재" 보고).

---

## 오류 대응 요약

| 증상 | 원인 | 대응 |
|------|------|------|
| HTTP 401/403 | 키 누락/무효 | 키 로딩 재확인(SKILL.md), 발급 페이지에서 키 재확인 |
| `data: []` | 미등재 or 화학식 표기차 | 레시피 6(formula_autocomplete/chemsys)로 재시도 → 없으면 "MP 미등재" |
| 429/503 | 스로틀/서버 | 대기 후 재시도, 호출 빈도 축소 |
| 느린 응답/과대 페이로드 | `_fields` 미지정 | 필요한 필드만 `_fields`로 선별 |
