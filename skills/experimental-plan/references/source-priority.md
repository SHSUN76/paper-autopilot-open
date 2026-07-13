# Source Priority — experimental-plan 데이터 출처 우선순위

> experimental-plan 스킬이 SOP를 작성할 때 어떤 출처에서 protocol을 끌어올지의 우선순위 정의.

---

## 1. 핵심 원칙

1. **항상 local corpus 먼저** — 사용자가 직접 모은 corpus에 Methods 단락이 있으면 그것부터
2. **Open access만 다운로드** — 구독 paper는 인용으로만 활용
3. **출처 항상 명시** — 모든 protocol step에 출처 표시 (Wang2023 SI §3.2 같은 형식)
4. **paper-access 사용** — URL 임의 추측 금지, paper-access 스킬을 통해서만 PDF/SI 다운로드

---

## 2. 우선순위 (1 → 4)

### Priority 1: Local corpus (config `rag.local_corpus_dir`)

**위치**: config `rag.local_corpus_dir` (기본 `~/.claude/paper-autopilot-open/corpus`)

**검색 방법**:
```bash
# section_name이 Experimental/Method/Synthesis 포함하는 paragraph 찾기
grep -rh '"section_name":"[^"]*\(Experimental\|Method\|Synthesis\)' \
     paragraph_reports/*.json

# 또는 primary_claim_type == "method_description"
grep -rh '"primary_claim_type":"method_description"' paragraph_reports/*.json
```

**현황 (2026-04-30 기준)**:
- ~110 papers analyzed
- ~43 method_description paragraphs identified across 15+ papers
- aem2025-109 같은 논문은 "Experimental Section — Syntheses / Analytical Approach / Electrochemical Studies"로 세분화됨

**장점**: 즉시 검색, 비용 없음, 사용자가 이미 검증한 paper들
**한계**: 단락 텍스트만 — SI 내용은 없음. 시약 grade, 공급사 같은 세부는 별도 SI 필요

---

### Priority 2: Supabase RAG (optional)

**위치**: PostgreSQL + pgvector @ Supabase (config `rag.supabase`, `rag.mode: supabase`일 때)

**검색 도구**:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/retrieve.mjs" paragraphs \
  --query "EIS Nyquist after cycling" \
  --section "Experimental" \
  --claim "method_description" \
  --k 5
```

**언제 사용**: local corpus가 매칭이 약할 때 (e.g. 특수 측정 기법, sub-domain 외 분야)

**전제**: `rag.mode: supabase` + `scripts/setup/corpus-schema.sql` 적용 + `scripts/ingest/ingest-supabase.mjs` 적재가 완료된 경우에만 동작. 미구성 시 local corpus(P1)만 활용.

**비용**: ~$0.001 / query (pgvector cosine similarity)
**한계**: local corpus와 동일한 코퍼스이므로 P1과 차별점은 vector 유사도 검색 가능

---

### Priority 3: Open-access web 다운로드

**언제 사용**: P1+P2가 부족하거나, target journal 특정 protocol 필요

**Battery 분야 OA 소스 (우선순위)**:

| 순위 | 소스 | URL pattern | 특징 |
|------|------|------------|------|
| 1 | **PMC (PubMed Central)** | `ncbi.nlm.nih.gov/pmc/articles/PMC{n}` | 완전 OA, full text + figure + table |
| 2 | **ACS Editors' Choice / AuthorChoice** | `pubs.acs.org/doi/10.1021/{}` (with OA badge) | 일부 ACS 논문 OA |
| 3 | **RSC Open Access** | `pubs.rsc.org/en/content/articlepdf/...` (OA marked) | RSC J. Mater. Chem A 등 |
| 4 | **Nature Portfolio OA** | `nature.com/articles/{s41xxx-...}` | Nat Comm, Sci Rep, Commun Mater 모두 OA |
| 5 | **Wiley OnlineOpen** | `onlinelibrary.wiley.com/doi/full/...` (OA marked) | Adv. Mater 등 OA 옵션 |
| 6 | **MDPI** | `mdpi.com/{n}/{n}/{n}` | Energies, Materials, Batteries (전부 OA) |
| 7 | **Elsevier Open Access** | `sciencedirect.com/science/article/pii/...` (OA badge) | 일부 J Power Sources 등 |
| 8 | **ChemRxiv** | `chemrxiv.org/engage/...` | Preprint, OA, peer review 미적용 주의 |
| 9 | **bioRxiv / EarthArxiv** | `biorxiv.org/...` | (배터리 분야 적음) |

**검색 도구**: `WebSearch` → 후보 식별 → `/paper-access` 스킬로 PDF 확보

**검색 예시 (WebSearch query)**:
```
"NCM811 cycling protocol" site:ncbi.nlm.nih.gov OR site:nature.com filetype:pdf
"EIS Nyquist after cycle 100" mdpi
```

**저장 위치**: `<paper_folder>/experimental_plan/<YYMMDD>/reference_protocols/{author}{year}_{topic}.pdf`

---

### Priority 4: Supplementary Information (SI) 다운로드

**언제 사용**: P3에서 확보한 paper의 본문에 protocol 세부가 부족할 때

**도구**: `/paper-access` 스킬에 SI URL 또는 SI 다운로드 옵션 사용

**일반적 SI 위치**:
- Nature: Article 페이지의 "Supplementary Information" 섹션
- ACS: "Supporting Information" PDF 링크 (별도 DOI 가질 수도 있음)
- RSC: "Electronic Supplementary Information (ESI)" PDF
- Elsevier: "Supplementary material" 또는 mmc1.pdf 형태
- Wiley: "Supporting Information" 별도 파일

**중요**: SI도 OA 라이선스를 따른다. 본문이 OA면 SI도 OA.

**저장 위치**: `reference_protocols/{author}{year}_SI.pdf`

**SI 처리**:
1. paper-access로 SI PDF 다운로드
2. SI에서 protocol 부분 텍스트 추출 → `{author}{year}_methods_extracted.md` 저장
3. SOP.md에서 `(Wang2023 SI §3.2)` 형식으로 인용

---

## 3. source_log.md 형식

`reference_protocols/source_log.md`에 모든 다운로드 기록:

```markdown
# Reference Protocol Source Log

## Wang2023 (Adv. Energy Mater. 13, 2300345)
- **출처**: Wiley OnlineOpen (OA license: CC BY)
- **DOI**: 10.1002/aenm.202300345
- **차용 부분**: §3.2 Cell assembly, SI §S2 EIS conditions
- **다운로드 시각**: 2026-04-30 14:32
- **파일**: `Wang2023_main.pdf`, `Wang2023_SI.pdf`
- **방법**: paper-access via Wiley OA URL

## Kim2024 (J. Power Sources 580, 233456)
- **출처**: Elsevier OA badge confirmed
- **DOI**: 10.1016/j.jpowsour.2024.233456
- **차용 부분**: Methods §2.3 GITT protocol
- **다운로드 시각**: 2026-04-30 15:10
- **파일**: `Kim2024_main.pdf` (SI 미존재)
- **방법**: WebSearch → paper-access via Elsevier URL
- **비고**: 본문에 step-by-step 세부 충분, SI 불필요

## ...
```

---

## 4. 절대 하지 말 것

- ❌ Sci-Hub, Library Genesis 등 비합법 소스
- ❌ 구독 paper의 PDF를 직접 다운로드 (institutional access는 번들 paper-access 스킬(config `paper_access.institution_proxy_url`) 규칙 따름)
- ❌ URL 임의 추측해서 wget/curl
- ❌ paper-access 거치지 않고 WebFetch로 직접 PDF 다운로드 (institutional access 손실)
- ❌ source_log.md 없이 `reference_protocols/`에 파일 추가
- ❌ 출처 명시 없이 SOP에 protocol step 작성

---

## 5. 출처 인용 형식 (SOP 본문에서)

| 형식 | 용도 |
|------|------|
| `(Wang2023 SI §3.2)` | SI의 특정 섹션 |
| `(Kim2024 §2.3)` | 본문 Methods 섹션 |
| `(corpus: aem2025-109)` | local corpus paragraph_report 직접 인용 |
| `(corpus: paragraph 중 @aem-128)` | 코퍼스 paragraph 단위 |
| `(WebSearch result, accessed 2026-04-30)` | 사용자 검증 후 채택한 web 정보 |
| `(adapted from Zhao2023)` | 적응·변형 인용 (full copy 아님) |

---

## 6. 사용자 local corpus 통계 (참고용)

config `rag.local_corpus_dir` 기준 (예시 스캔):

| 통계 | 값 |
|------|----|
| 총 paper 수 | ~110 |
| Methods/Experimental section 보유 paper | 추정 80%+ |
| `method_description` claim 단락 | 43+ (15 files 이상) |
| Section name 패턴 | "Experimental Section", "Materials and Methods", "Synthesis", "Methods" |
| Sub-domain 분포 | Li-ion cathode 다수, Na-ion 일부, supercapacitor/OER 약간 |

스킬은 매번 이 corpus를 먼저 검색해야 한다.
