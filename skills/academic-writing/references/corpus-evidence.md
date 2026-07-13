# Corpus Evidence — 108-paper Battery/Materials Writing Survey

> 모든 통계는 `corpus_analysis/aggregated/logic_analysis.json`에서 직접 추출.
> 모든 rule은 이 데이터에 정량 근거를 둠.

## 코퍼스 규모

| Metric | Value |
|---|---|
| Papers (paper-level extracted) | 127 |
| Papers with paragraph-level data | 108 |
| Sections | 2,274 |
| Paragraphs | 2,986 |
| Moves | 13,741 |
| Figures | 1,008 |
| Vocabulary entries | 8,772 |
| AI-tell candidates | 927 |
| Embedded paragraphs (vector) | 2,986 |

저널 분포 (top): Adv. Energy Mater. (14), J. Energy Storage (11), Chem. Eng. J. (8), Joule (7),
Energy Storage Materials (7), J. Power Sources (7), Adv. Funct. Mater. (6), Adv. Mater. (5),
ACS Nano (5), Angew. Chem. (4), Nat. Commun. (3), JACS (3) ...

---

## E1. Section ↔ claim_type — 극단적 편향

| Section | 1순위 claim | % | 2순위 | 3순위 |
|---|---|---|---|---|
| **Conclusion** (n=171) | contribution | **80.1%** | evidence 8.8% | interpretation 5.3% |
| **Introduction** (n=497) | motivation | 53.7% | contribution 25.6% | comparison 6.2% |
| **Methods** (n=163) | method_description | 49.1% | evidence 27.6% | interpretation 10.4% |
| **Results+Discussion** (n=409) | evidence | 62.8% | mechanism 12.7% | interpretation 9.3% |
| **Other** (n=1735, 대부분 R+D sub-section) | evidence | 46.5% | method_description 21.2% | mechanism 10.8% |

→ Conclusion에서 evidence를 80% 쓰면 비정상. Introduction에 evidence가 60% 있으면 비정상.

---

## E2. Introduction position-by-claim — IMRaD 시작 순서

Introduction 단락 위치별 가장 흔한 claim_type (n=497):

| Position | n=motivation | n=contribution | 다른 claim |
|---|---|---|---|
| pos 0 (첫 단락) | **107** | 1 | 다른 claim 0개 |
| pos 1 | **83** | — | comparison 10, mechanism 9 |
| pos 2 | 46 | **30** | mechanism 10, comparison 9 |
| pos 3 | 19 | **41** | mechanism 7, comparison 6 |
| pos 4 | 9 | **27** | comparison 4 |
| pos 5 | 2 | **18** | — |

→ Pos 0-1은 motivation이 압도적, pos 3+에서 contribution이 dominant.
→ 사용자 draft의 Introduction 마지막 단락에 motivation이 50%면 잘못된 구조.

---

## E3. Move-type 분포 (n=13,741)

| Move | n | % |
|---|---|---|
| present_evidence | 5,112 | **37.2%** |
| interpret | 3,655 | **26.6%** |
| propose_method | 1,649 | 12.0% |
| state_goal | 825 | 6.0% |
| contribution | 790 | 5.7% |
| bridge | 430 | 3.1% |
| cite_gap | 429 | 3.1% |
| caveat | 386 | 2.8% |
| future_work | 163 | 1.2% |
| method_description | 135 | 1.0% |
| hedge_alternative | 134 | 1.0% |
| comparison | 33 | 0.2% |

→ Battery writing의 64%는 evidence + interpret 두 move. 다른 모든 move 합쳐서 36%.

---

## E4. Move Markov chain — "사고 흐름" (전체 transition 47개 중 핵심)

| 현재 move | → 다음 move | n | % |
|---|---|---|---|
| state_goal | → present_evidence | 485 | **62.7%** |
| state_goal | → propose_method | 169 | 21.9% |
| **present_evidence** | → **interpret** | **2,063** | **43.9%** |
| present_evidence | → present_evidence | 1,877 | 39.9% |
| **interpret** | → **interpret** | 956 | 39.0% |
| interpret | → present_evidence | 799 | 32.6% |
| interpret | → contribution | 196 | 8.0% |
| propose_method | → present_evidence | 598 | 44.6% |
| propose_method | → propose_method | 458 | 34.2% |
| method_description | → present_evidence | 82 | 67.8% |
| cite_gap | → present_evidence | 87 | 26.3% |
| cite_gap | → bridge | 49 | 14.8% |
| cite_gap | → propose_method | 52 | 15.7% |
| caveat | → interpret | 65 | 24.1% |
| caveat | → future_work | 23 | 8.5% |
| contribution | → contribution | 120 | 29.1% |
| contribution | → present_evidence | 104 | 25.2% |
| future_work | → future_work | 28 | 56.0% |
| hedge_alternative | → interpret | 37 | 45.1% |
| bridge | → present_evidence | 74 | 50.7% |

→ 핵심 패턴: `state_goal → present_evidence → interpret`이 약 27% 단락의 main backbone.

---

## E5. Closing move (단락 마지막 move) — 가장 강한 logic rule

| Paragraph claim_type | 가장 흔한 closing move | % | n |
|---|---|---|---|
| **mechanism** | **interpret** | **75.5%** | 194/257 |
| evidence | interpret | 62.3% | 697/1119 |
| interpretation | interpret | 60.6% | 143/236 |
| **contribution** | contribution | 65.9% | 203/308 |
| contribution | future_work | 21.4% | 66 |
| method_description | propose_method | 53.3% | 258/484 |
| caveat | interpret | 37.5% | 21 |
| caveat | future_work | 33.9% | 19 |
| **motivation** | bridge | 29.8% | 86 |
| motivation | cite_gap | 28.0% | 81 |
| comparison | interpret | 34.7% | 26 |

→ **단일 가장 강력한 rule**: mechanism 단락의 75.5%는 interpret 동작으로 종결.
→ Contribution 단락의 87.3%(65.9+21.4)는 contribution 또는 future_work으로 마무리.

---

## E6. Opening move — 단락 시작 패턴

| Paragraph claim_type | 가장 흔한 opening move | % |
|---|---|---|
| motivation | state_goal | 58.2% (n=166) |
| motivation | present_evidence | 24.9% (n=71) |
| contribution | contribution | 60.9% (n=190) |
| method_description | propose_method | 65.8% (n=306) |
| evidence | present_evidence | 44.6% (n=500) |
| evidence | state_goal | 31.6% (n=355) |
| mechanism | present_evidence | 40.0% (n=104) |
| mechanism | interpret | 22.7% (n=59) |
| interpretation | present_evidence | 41.8% (n=100) |
| interpretation | interpret | 41.8% (n=100) |
| caveat | caveat | 59.7% (n=37) |
| comparison | present_evidence | 63.9% (n=46) |

→ Motivation 단락은 state_goal로 시작 ("Lithium-ion batteries are widely deployed...").
→ Contribution 단락은 contribution move로 시작 ("Herein, we report...").

---

## E7. Hedge level by claim_type (n=2,855 paragraphs with hedge tagged)

| Claim | hedge=none | hedge=mild | hedge=moderate | hedge=strong |
|---|---|---|---|---|
| **method_description** | **81.5%** | 17.5% | 1.0% | — |
| contribution | 54.7% | 40.5% | 4.5% | 0.3% |
| evidence | 35.8% | 58.5% | 5.7% | — |
| mechanism | 27.8% | 60.1% | 12.1% | — |
| motivation | 24.7% | 66.6% | 8.8% | — |
| interpretation | 22.5% | 48.2% | **27.7%** | 1.6% |
| **caveat** | 6.5% | 37.7% | **53.2%** | 2.6% |

→ Method = 단정적, Caveat = 강한 hedge. 둘 사이 cline 명확.

---

## E8. Voice / "We" 비율 by section

| Section | we_pct | n | 가장 흔한 voice/hedge 조합 |
|---|---|---|---|
| Discussion (n=11) | 45.5% | 11 | (sample 적음) |
| **Conclusion** | **42.1%** | 171 | passive+none(30%), passive+mild(20%) |
| Results+Discussion | 24.2% | 409 | passive+mild(35%), passive+none(32%) |
| Other (R+D sub) | 21.3% | 1735 | passive+none(36%), passive+mild(35%) |
| Introduction | 20.9% | 497 | passive+mild(48%), passive+none(23%) |
| **Methods** | **16.0%** | 163 | passive+none(53%), passive+mild(25%) |

→ "We" 사용은 Conclusion에서 정점, Methods에서 최소.

---

## E9. Citation density by section + claim

| Section | claim | avg_cites | avg_prior_work | avg_fig_refs | n |
|---|---|---|---|---|---|
| Introduction | motivation | **7.32** | 8.11 | 1.20 | 267 |
| Introduction | comparison | 7.16 | 7.45 | 1.00 | 31 |
| Introduction | contribution | 0.83 | 0.93 | 1.17 | 127 |
| Methods | method_description | 0.36 | 0.35 | 1.54 | 80 |
| Methods | evidence | 1.00 | 1.00 | 3.33 | 45 |
| R+D | evidence | 1.30 | 1.39 | **4.23** | 257 |
| R+D | mechanism | 1.13 | 1.17 | 3.56 | 52 |
| R+D | interpretation | 0.68 | 0.76 | 3.00 | 38 |
| Other | evidence | 1.11 | 1.17 | **3.84** | 806 |
| Other | mechanism | 1.44 | 1.49 | **3.28** | 187 |
| Conclusion | contribution | **0.07** | 0.07 | 1.00 | 137 |

→ Intro 첫 단락 = 인용 7-8개, Conclusion = 인용 거의 없음, R+D = figure ref 3-4개.

---

## E10. Move count per paragraph (단락 깊이)

| Section | claim | avg_moves | sd | n |
|---|---|---|---|---|
| R+D | mechanism | **6.71** | 4.02 | 52 |
| R+D | evidence | 6.00 | 3.18 | 257 |
| Other | evidence | 5.16 | 2.58 | 806 |
| Intro | comparison | 5.90 | 2.13 | 31 |
| Intro | contribution | 4.88 | 1.85 | 127 |
| Other | mechanism | 4.83 | 2.52 | 187 |
| Methods | evidence | 4.87 | 2.23 | 45 |
| Conclusion | contribution | 4.76 | 1.73 | 137 |
| Intro | motivation | 4.70 | 1.45 | 267 |
| R+D | method_description | 4.70 | 2.83 | 33 |
| R+D | interpretation | 4.32 | 3.55 | 38 |
| Other | interpretation | 4.19 | 2.12 | 182 |
| Other | comparison | 3.72 | 1.44 | 43 |
| Other | contribution | 3.69 | 1.53 | 49 |
| Other | caveat | 3.50 | 1.07 | 48 |
| Other | method_description | 3.14 | 2.01 | 368 |
| Methods | method_description | 3.10 | 1.83 | 80 |

→ Mechanism 단락이 가장 깊다 (avg 6.7 moves). Method-only 단락은 가장 얕다 (avg 3.1).

---

## E11. AI-tell 빈도 — 진짜 battery 논문에서 얼마나 자주 쓰는가

| Phrase | papers using (of 127) | % |
|---|---|---|
| "In recent years" | 10 | 7.9% |
| "Notably," | 9 | 7.1% |
| "It is worth noting that" | 8 | 6.3% |
| "next-generation" | 8 | 6.3% |
| "exceptional cycling stability" | 4 | 3.1% |
| "paving the way" | 4 | 3.1% |
| "remarkable" | 4 | 3.1% |
| "unprecedented" | 4 | 3.1% |
| "for the first time" | 4 | 3.1% |
| "synergistic effects" | 4 | 3.1% |
| "Notably" (sentence-initial) | 4 | 3.1% |
| "valuable insights" | 4 | 3.1% |
| "exceptional" | 4 | 3.1% |
| "synergistically" | 4 | 3.1% |
| "Remarkably" | 4 | 3.1% |
| "play a pivotal role" | 3 | 2.4% |
| "paradigm shift" | 3 | 2.4% |
| "remarkable improvement" | 3 | 2.4% |
| "rationally designed" | 3 | 2.4% |
| "garnered significant attention" | 3 | 2.4% |
| "delicate balance" | 3 | 2.4% |
| "remarkable capacity retention" | 3 | 2.4% |
| "providing a new perspective" | 2 | 1.6% |
| "promising route" / "promising candidates" / "promising potential" | 2 each | 1.6% |
| "pave the way" / "paves the way" | 2 each | 1.6% |
| "rational design" | 2 | 1.6% |
| "new paradigm" | 2 | 1.6% |
| "longstanding trade-off" | 2 | 1.6% |
| "It is noteworthy that" | 2 | 1.6% |
| "Inspiringly" | 2 | 1.6% |

→ 단일 phrase 기준 한 paper에 쓰는 빈도는 매우 낮음.
→ AI가 한 단락에 "Notably/It is worth noting/paving the way"를 동시 사용하면 비자연.
→ Threshold rule: 한 paper에 1.6% 미만 phrase 3개 이상 동시 등장 = AI tell 의심.

---

## 이 데이터의 한계와 신뢰도

- **Sample size**: 108 papers (paragraph), 127 papers (paper-level). 좋은 시작점이지만 더 많을수록 좋음.
- **Section name normalization**: "Other" 1735개는 대부분 R+D sub-section. 향후 sub-section type 분류 필요.
- **Domain coverage**: Li-ion, Si-graphite, electrolyte, recycling 등 LIB 전반. Sodium-ion, K-ion, redox flow는 거의 없음 — 이런 sub-domain에는 보정 필요.
- **AI tell judgement**: 추출 시 sub-agent의 보수적 판단에 의존. False positive 있을 수 있음.
- **연도 편향**: 2025-2026 위주. 오래된 논문 스타일은 다를 수 있음.
