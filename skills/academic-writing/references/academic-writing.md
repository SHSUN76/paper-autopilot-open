# Academic Writing Rulebook — Battery / Materials Science

> 두 출처 결합:
> - **Layer 1 (Logic)**: 108 battery 논문 corpus 통계 (`corpus-evidence.md`)
> - **Layer 2 (Style/Notation)**: PI advisor (Manthiram-style) writing tips
>
> 모든 rule은 **왜 그래야 하는지** + **데이터 또는 출처**를 같이 명시.

---

# Part A — Logic (논문 사고 흐름)

## A1. 섹션은 claim_type을 강하게 결정한다

각 섹션이 받아야 할 paragraph claim_type 분포 (corpus E1):

```
Conclusion       → contribution 80%   (남은 20%는 evidence/interpretation/caveat)
Introduction     → motivation 54%, contribution 26%, comparison 6%, mechanism 5%
Methods          → method_description 49%, evidence 28%, interpretation 10%
Results / Discuss→ evidence 63%, mechanism 13%, interpretation 9%
```

**Why**: 섹션마다 독자가 기대하는 정보 종류가 다르다. Conclusion에 "Figure 3a shows..." 같은 evidence 단락을 잔뜩 넣으면 reader가 "왜 또 결과를?" 하고 혼란스러워한다.

**How to apply**:
- 사용자 draft 단락마다 claim_type을 추출하고 섹션 기댓값과 비교.
- Conclusion에서 evidence/method_description 비중이 30% 이상이면 경고.
- Introduction 끝부분에 contribution 단락이 없으면 "missing nugget" 경고.

## A2. Introduction은 position-dependent

코퍼스 E2에서 paragraph 위치별 dominant claim:

```
pos 0  → motivation (99%)        [도메인 importance, "Lithium-ion batteries are widely..."]
pos 1  → motivation (76%)        [문제 deepen]
pos 2  → motivation (40%) → contribution (26%)  [전환 시작]
pos 3+ → contribution (60%+)     ["Herein, we report..."]
```

**Why**: 독자가 첫 단락에서 "도메인 → 문제 → 우리 기여"의 narrative arc를 기대.

**How to apply**:
- pos 0-1에 contribution이 있으면 "너무 일찍 spoiler" 경고.
- pos 3+에 motivation만 있으면 "contribution이 없는 introduction" 경고.

## A3. Body paragraph의 기본 logic = evidence ↔ interpret oscillation

코퍼스 E4 Markov chain:
- `present_evidence → interpret`: 44% (가장 흔한 transition)
- `interpret → interpret`: 39%
- `present_evidence → present_evidence`: 40%
- `interpret → present_evidence`: 33% (sandwich pattern)

**Why**: 과학 글쓰기의 본질 = "데이터 → 해석"의 진동. 한 단락 안에서 5-7번 evidence-interpret이 교대된다 (R+D 단락 평균 6 moves).

**How to apply**:
- evidence 단락에 interpret move가 0개면 "raw data dump" 경고.
- evidence 5개 연속 후 interpret이 없으면 단락 분할 권장.

## A4. Mechanism 단락의 종결 rule

코퍼스 E5: **mechanism 단락의 75.5%가 interpret으로 종결**.

**Why**: mechanism은 "왜 그런 일이 일어나는가"의 추론 단락. 독자에게 raw observation으로 끝나면 "그래서 뭐?"가 남는다. 반드시 해석으로 닫는다.

**How to apply**:
- mechanism 단락의 마지막 sentence가 figure 언급이나 raw measurement 보고로 끝나면 경고.
- 대안: "These observations suggest that...", "The data collectively indicate...", "We attribute this to..."

## A5. Contribution 단락의 종결 rule

코퍼스 E5: contribution 단락의 87.3%가 contribution(65.9%) 또는 future_work(21.4%)으로 종결.

**Why**: Conclusion에서 "Therefore, we have..."로 닫고 "This work paves the way for..." 식으로 열어주는 게 default.

**How to apply**:
- Conclusion 마지막 단락이 mechanism이나 evidence로 끝나면 "missing closure" 경고.

## A6. Hedge level은 claim_type에 따라 결정된다

코퍼스 E7:

| Claim | hedge=none 비율 |
|---|---|
| method_description | 81.5% (단정적) |
| contribution | 54.7% |
| evidence | 35.8% |
| mechanism | 27.8% |
| motivation | 24.7% |
| interpretation | 22.5% (mild 48% / moderate 28%) |
| caveat | 6.5% (moderate **53.2%**) |

**Why**: 메소드 단락에서 "may have synthesized" 같은 hedge는 부자연스럽다 (실험을 했으면 단정한다). 반대로 mechanism/interpretation은 추론이므로 hedge가 자연스럽다.

**How to apply**:
- method_description 단락에 "may/might/could/possibly"가 3개 이상이면 경고.
- caveat 단락에 hedge가 0개면 경고 (단정적 caveat는 비논리적).

## A7. "We" 사용 분포

코퍼스 E8:
- Conclusion: 42% / Discussion: 46% / R+D: 24% / Intro: 21% / Methods: 16%

**Why**: Methods는 protocol 기술이므로 passive ("XRD measurements were performed"), Conclusion은 author voice가 가장 강하다 ("We have demonstrated...").

**How to apply**:
- Methods에서 "we"가 50% 이상이면 "passive 권장" 경고.
- Conclusion이 100% passive면 "author agency 약함" 경고.

## A8. Citation density는 section + claim에 따라 정해진다

코퍼스 E9:
- Intro motivation: avg 7.3 cites + 8.1 prior_work refs
- Intro contribution: avg 0.83 cites
- R+D evidence: avg 1.3 cites + **4.2 figure refs**
- Conclusion contribution: avg **0.07 cites** (거의 없음)
- Methods method_description: avg 0.36 cites

**Why**: Intro 첫 단락은 motivating literature를 깔아야 하므로 dense. Conclusion에서 새 인용을 끼얹으면 산만하다. R+D는 자기 figure를 가리키지 prior work를 다시 인용하지 않는다.

**How to apply**:
- Intro motivation 단락에 cites 2개 미만이면 "weak motivation" 경고.
- Conclusion에 cites 3개 이상이면 "Conclusion에서 새 인용" 경고.
- R+D 단락에 figure ref 0개면 "non-figure-grounded evidence" 경고.

---

# Part B — AI tell phrases (corpus-calibrated)

## B1. AI tell phrase는 corpus 빈도 기준으로 판정

코퍼스 E11: 진짜 battery 논문에서 이런 phrase는 paper당 매우 드물게 쓴다.

**High AI suspicion (한 paper에 동시 출현 시)**:
- "In recent years" — 10/127 papers (7.9%)
- "Notably," — 9/127 (7.1%)
- "It is worth noting that" — 8/127 (6.3%)
- "next-generation" — 8/127 (6.3%)

**Strong AI suspicion (cumulative)**:
- "exceptional cycling stability", "paving the way", "remarkable", "unprecedented",
  "for the first time", "synergistic effects" — 4/127 (3.1%) each

**Severe AI suspicion**:
- "play a pivotal role", "paradigm shift", "rationally designed", "delicate balance",
  "garnered significant attention", "providing a new perspective" — 3/127 (2.4%) each

**Why**: 단일 phrase는 진짜 논문에도 가끔 등장하지만 AI는 한 단락에 3-5개를 클러스터로 흩뿌린다.

**How to apply**:
- 한 paper에 strong/severe phrase 3개 이상 동시 사용 → flag.
- 한 단락에 strong/severe phrase 2개 동시 사용 → flag.
- "remarkable" + "exceptional" + "paving the way" 같은 lexical cluster = high suspicion.

## B2. AI tell exception list (use freely)

이 phrase는 battery 도메인 표준 vocabulary이므로 flag하지 않는다:
- 모든 chemical formulas (NCM811, LiPF6, LiFSI, Li-S, etc.)
- "cycling stability", "rate capability", "Coulombic efficiency", "capacity retention"
- "solid-electrolyte interphase (SEI)", "cathode-electrolyte interphase (CEI)"
- "ion transport", "lithium plating", "thermal runaway"
- "operando", "in-situ", "ex-situ"
- "DFT calculations", "MD simulations"

이건 battery scientist의 native lexicon이지 AI tell이 아니다.

---

# Part C — Style & Notation (Manthiram tips)

## C1. Sentence & paragraph 길이

- **Sentence**: 한 문장이 30어 이상이면 분할 검토. 독자가 헷갈리면 메시지 손실.
- **Paragraph**: 한 paragraph가 1 page (double-spaced) 넘으면 분할.
- **Why**: long sentence/paragraph는 reviewer 인내심을 시험한다.

## C2. Abbreviation 정의 규칙

- **First occurrence in introduction**에서 정의. abstract에서 정의했어도 intro에서 다시 정의.
- 정의 안 한 abbreviation 사용 금지.

## C3. Reference numbering & punctuation

| 저널 type | 표기 |
|---|---|
| Superscript (default) | "...has been studied.¹" (period **before** number) |
| Bracketed [N] or (N) | "...has been studied [1]." (period **after** bracket) |
| **Nature family** | "...has been studied¹." (period **after** superscript number) |

## C4. Notation rules (battery domain)

| ❌ 잘못 | ✅ 맞음 | Why |
|---|---|---|
| `mAh/g` | `mA h g⁻¹` | space + negative exponent (battery 표준) |
| `m2/g` | `m² g⁻¹` | 마찬가지 |
| `321.7 mAh g-1` | `321 mA h g⁻¹` | capacity는 정수로 (decimal 노이즈) |
| `5 C` | `5C` | C-rate는 number+C 붙여 씀 |
| `300 mAh g-1 at 5C` | `300 mA h g⁻¹ at 5C rate` | "rate" 단어 추가 |
| `5 hours` | `5 h` | 시간 단위 약어 |
| `40 seconds` | `40 s` | 마찬가지 |
| `150nm` | `150 nm` | number+unit 사이 공백 |
| `x=0.5` | `x = 0.5` | equality에 공백 |
| `~15` | `~ 15` | tilde 후 공백 |
| `0≤x≤1` | `0 ≤ x ≤ 1` | 부등호에 공백 |
| `x<1` | `x < 1` | 마찬가지 |
| `Mn:Ni = 3:1` | `Mn : Ni = 3 : 1` | 비율 표기에 공백 |
| `lithium metal anode` | `lithium-metal anode` | compound modifier에 hyphen |
| `lithium's larger size` | `the larger size of lithium` | possessive 회피 |
| `it's` | `it is` | contraction 금지 |
| `using XPS` | `with XPS` | "using" 회피, "with" 권장 |

## C5. List & comma rules

- **2 items**: "x and y" (no Oxford comma)
- **3+ items**: "x, y, and z" (Oxford comma 필수)
- **"respectively"**: 문장 중간에 — "x, y, and z give, respectively, a, b, and c" (끝이 아닌 중간)

## C6. Figure caption 규칙

- 라벨은 **앞**에 "(a) LiCoO₂", **뒤가 아님** "LiCoO₂ (a)".
- 예시:
  - ❌ "cyclability of LiCoO₂ (a) and LiNiO₂ (b)"
  - ✅ "cyclability of (a) LiCoO₂ and (b) LiNiO₂"
- Figure 글자 크기는 reduce되어 출판되므로 충분히 크게.

## C7. Abstract / Conclusion 비교

- **Do not write identical sentences in abstract and conclusion.**
- Abstract: 무엇을 했고 결과가 무엇인지 (compressed).
- Conclusion: contribution + future_work + broader implication.

## C8. 문서 형식

- 1 inch margin, Times New Roman 12pt.
- Paragraph indent 0.375 inch.
- Page numbers centered at bottom.
- US English dictionary on.
- No autonumbering (subheadings, references — manually).

## C9. Editorial workflow rules

- PI가 빨강으로 표시 = 의문/확인 필요. 사용자가 답할 때까지 빨강 유지.
- 사용자 수정사항은 항상 **파랑**.
- Revision 시 변경사항은 **빨강** (reviewer 응답 단계).
- File renaming 금지 (PI가 작업 중일 때).
- Editor 응답은 separate format: comment in italics, response in normal.

---

# Part D — Procedural

## D1. Pre-writing

- PI에게 outline + figures를 먼저 보여주고 적합성 협의.
- Coauthors는 실험/지적 기여자만. 친구 이름 추가 = 비윤리.
- Target journal의 instruction 읽고 sample paper 1-2편 검토.

## D2. Quality first

- "1편 더" 가 아니라 "good quality 4편" 목표.
- Quality 안 나오면 PI는 작업 안 함.
- Reading 없이 좋은 paper 못 쓴다.

## D3. Plagiarism

- 절대 published 문장 복사 금지 (illegal).
- Paraphrase하더라도 출처 인용.

## D4. Submission preparation

- Cover letter, Turnitin report, suggested reviewers 모두 준비.
- 자기 그룹 references 시작 부분에 몇 개.

---

# Application Map (rule → agent)

| Rule | 검증 agent | 반응 |
|---|---|---|
| A1, A2 | aw-claim-validator | 단락 claim_type 분포가 섹션 기댓값과 다르면 flag |
| A3, A4, A5 | aw-move-flow | move sequence와 closing move 검증 |
| A6 | aw-hedge-coach | claim_type별 hedge level mismatch 검증 |
| A7 | aw-voice-coach (TODO) | section별 we_pct 검증 |
| A8 | aw-citation-coach (TODO) | section+claim별 cite count 검증 |
| B1, B2 | aw-ai-tell | corpus 빈도 기준 phrase cluster 검증 |
| C1-C9 | aw-style-checker | notation/format 검증 |

각 agent는 이 rulebook을 reference로 들고 검증한다. Active agent는 SKILL.md의 deployment plan 참고.
