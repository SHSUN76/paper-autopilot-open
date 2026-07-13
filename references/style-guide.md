# Battery / Materials Paper Writing Style Guide

> 모든 academic-writing 및 research-autopilot의 writing agent들이 준수해야 하는 스타일 규칙. PI 가이드라인 기반 + 일반 학술 영어 컨벤션.

## 1. 문장/단락 (Sentence & paragraph)

- **긴 문장 금지** — 독자가 메시지를 놓치지 않도록 짧고 명료하게
- **한 단락 ≤ double-spaced 1 page**
- **단락 간 connector phrase**: `however`, `in contrast to`, `on the other hand`, `interestingly`, `importantly`, `furthermore`, `consequently`
- **첫 문장에 단락 메시지** — topic sentence first
- **⛔ Em-dash / hyphen으로 절 연결 금지 (v1.0.5 신규)**: `—`, `–`, ` - `로 두 절을 잇는 패턴은 review/essay 스타일. 배터리 저널 본문 norm 아님. 대안:
  - 마침표로 분리: `~. The reframing is the central move.`
  - 세미콜론: `~; the gap is the measurand.`
  - 접속사: `whereas`, `because`, `although`, `while`
  - 콜론 (정의/예시): `the measurand: ε_CT − ε_SEM = 0.09`
  - **허용 케이스**: parenthetical 단어 1-2개 삽입 (e.g. `the gap—≈ 0.09—is the measurand`)는 허용. 3 단어 이상 절 연결은 거부
- **⛔ 본문 내 §N 교차참조 금지 (v1.0.5 신규)**: `§2.2`, `§3.5`, `Section 2`, `Sec. 3.1` 같은 in-body section reference는 review paper 패턴. 배터리 research paper에서는 거의 사용되지 않음 (corpus 40 papers 中 §-glyph 0건). 대안:
  - 그림/표 참조: `as shown in Fig. 5`, `see Table 1`
  - 위치 부사: `as discussed above`, `as described below`, `previously established`
  - 섹션 이름 (Methods 한정 1-2회 OK, "Section X" 풀어쓰기): `as detailed in the Methods section`, `(see Section 2.2)`
  - **허용 케이스**: SI cross-ref (`Fig. S4`, `Table S2`), 자기 논문이 아닌 인용 논문의 §N (`see ref. 24, §3`)
  - **금지 케이스**: 본인 manuscript의 본문 → 본문 § 참조; § glyph 자체는 모든 본문에서 금지
- **⛔ Cross-document references 금지 (v1.0.5 신규)**: manuscript 본문에서 `design document`, `SOP`, `paper_logic.md`, `figure_set.md` 같은 내부 프로젝트 산출물 참조 금지. 외부 reader는 이런 파일 모름. 대안:
  - 측정 protocol → Methods 섹션에 직접 기술
  - 가설 근거 → Introduction에 직접 기술 또는 SI에 deposit
  - 통계/계산 → Methods에 식과 함께 기술
- **⛔ Rhetorical italics 금지 (v1.0.5 신규)**: 강조용 italic (`*not*`, `*gap*`, `*measurand*`)은 corpus 0.05/1k norm 대비 18× 과용. 허용 italics:
  - 변수 기호: *D*_Li, *τ*_eff, *β*₁
  - Gene/genus 이름: *Bacillus subtilis*
  - Foreign loanwords: *in situ*, *via*, *vide infra*
  - **금지**: 강조 italics in body text. Auto-flag pattern: `\*[a-z]{1,15}\*`
- **⛔ Stray "we" 검출 (v1.0.5 신규)**: passive-voice 통일된 manuscript에서 1회라도 `\bwe\b` 등장 시 검출 + 교체. 예외: frontmatter `voice: active` 명시한 경우만 허용

## 2. 수치/단위 (Numbers & units)

- **소수점 앞 공백 X**: `x = 0.5` (O) / `x=0.5` (X)
- **근사**: `~ 15` (공백 포함)
- **단위 공백**: `150 nm`, `mA h g⁻¹` (NOT `mAh/g`), `m² g⁻¹` (NOT `m²/g`)
- **부등식 공백**: `0 ≤ x ≤ 1`, `x < 1`
- **비율 공백**: `Mn: Ni = 3: 1`
- **시간 단위**: `5 h` (NOT `5 hours`), `40 s` (NOT `40 seconds`), `24 h` (NOT `24 hours`)
- **C-rate 공백 X**: `5C` (NOT `5 C`) — 반드시 `5C rate`
- **용량값 소수점 제거**: `321 mA h g⁻¹` (NOT `321.7 mA h g⁻¹`)

## 3. 참고문헌 포맷 (References)

- **일반 저널 superscript**: `it has been studied.¹` (period가 ref 앞)
- **일반 저널 bracket/paren**: `it has been studied [1].` (period가 ref 뒤)
- **Nature 저널**: `it has been studied¹` (period 없음, ref 앞)
- **자동 번호 매기기 금지** — 수동 입력만

## 4. 쉼표 규칙 (Oxford comma)

- 2항목: `x and y` (쉼표 없음)
- 3항목 이상: `x, y, and z` (반드시 Oxford comma)
- `respectively` 위치: `x, y, and z give, respectively, a, b, and c.`

## 5. 축약어/단어 선택 (Abbreviations & word choice)

- **Contractions 금지**: `it is` (O) / `it's` (X)
- **`using` → `with`**: `carried out with XPS` (NOT `using XPS`)
- **소유격 회피**: `the larger size of lithium` (NOT `lithium's larger size`)
- **복합어 하이픈**: `lithium-metal anode` (NOT `lithium metal anode`)
- **모든 abbreviation 본문 첫 등장 시 정의** — abstract와 별개로 intro에서도 재정의

## 6. Figure 규칙

- **Caption 레이블 위치**: `cyclability of (a) LiCoO₂ and (b) LiNiO₂` (NOT `LiCoO₂ (a) and LiNiO₂ (b)`)
- **큰 폰트, 대비되는 기호/색상**
- **각 figure caption 별도 페이지, 각 figure도 별도 페이지** (저널 가이드에 따라)

## 7. 내용 규칙

- **Abstract와 Conclusion 동일 문장 금지**
- **데이터 정확성·재현성 책임은 작성자** — 불확실하면 포함하지 않음
- **인용구 복사 금지** (표절)
- **US English dictionary 사용**

## 8. 일반 포맷

- Margins: 1-inch all sides
- Font: Times New Roman 12pt (저널 템플릿 우선)
- Paragraph indent: 0.375 inch
- Page numbers: 하단 중앙
- Subheading auto-numbering 금지 (수동 번호)

## 9. AI tells (피해야 할 phrase)

- "remarkable" / "notably" / "importantly" 남발
- "delve into" / "in conclusion"
- "it is worth noting that"
- "comprehensive" / "robust" 형용사 과용
- 1-paragraph가 너무 균등한 길이

### 9.1 Over-literary / meta-commentary phrasing 금지 (v1.0.5 신규)

배터리 저널 본문에서 review/essay 톤은 부적절. RAG corpus 40-paper 분석 결과 다음 패턴은 corpus near-zero. 모두 금지:

**Meta-commentary 블랙리스트**:
- "A defensive note" / "A defense in two parts" / "The defense is N-fold"
- "A dissenting reading" / "A counter-position deserves explicit treatment"
- "earns its keep" / "carries the day" / "load-bearing"
- "the central methodological move" / "the keystone of" / "the move here is"
- "the figure of merit here is X not Y" (특히 italic 강조 동반)
- "this reframing is" / "we now turn to" / "as the previous section established"
- "opaque fitting handle" / "opaque parameter" — 가치판단형 형용사 회피
- "implausible at this level" / "fortuitous coincidence" — 수사적 개연성 추론

**대안 패턴**:
- 직접 결과 진술 + figure 참조: "Figure 5 shows...", "The closure is recovered within ±20 % (Fig. 5a)"
- Two arguments 구조: "Two considerations support this interpretation. First, ... Second, ..."
- 가설 검토: "It might be argued that X. However, the measured ..." (rhetorical question 없이)
- 한 paper 당 메타 분석 1-2회 max — abstract / conclusion에 한정

→ academic-writing의 `aw-ai-tell` agent가 800+ 의심 phrase + 위 over-literary 패턴 검사.

## 10. 9-차원 review (academic-writing VERIFY mode)

각 manuscript에 대해 다음 9개 reviewer agent 병렬 실행:

| Agent | 검토 |
|-------|------|
| aw-claim-validator | claim_type ↔ section 정합 |
| aw-move-flow | 단락 내 move 흐름 + closing |
| aw-hedge-coach | hedge 강도 vs claim_type |
| aw-ai-tell | AI 흔적 phrase 클러스터 |
| aw-style-checker | notation/format/style (이 문서 §1-§8) |
| aw-figure-vision | figure ↔ caption ↔ body 정합 |
| aw-bibliography-auditor | bib 완결성, arXiv 갱신, venue 일관성 |
| aw-consistency-checker | acronym, cross-ref, numeric drift |
| aw-technical-reviewer | methodology, dimensional analysis, arithmetic |

## 사용 (writing agent prompt 내 삽입)

```
MANDATORY READ BEFORE WRITING:
  1. Read this style-guide.md (특히 §2 수치/단위, §3 references)
  2. Apply ALL formatting rules
  3. Apply ALL style rules (short sentences, connector phrases, abbreviation definitions)
  4. Self-check before output: §1-§8 mental pass
```

## 출처

- 사용자 자체 유지 PI 스타일 가이드 (Paper Writing Tips)
- 108-paper RAG corpus aggregated patterns

## 변경 이력

| 버전 | 날짜 | 변경 |
|------|------|------|
| v1.0.0 | 2026-04-30 | 초기 작성 (PI 가이드 기반, §1-§10) |
| **v1.0.5** | **2026-04-30** | **6 신규 룰** (RAG 40-paper corpus norm 검증): §1 em-dash 절연결 금지 (4-8× over), §1 본문 §N glyph 금지 (corpus 0건), §1 cross-document refs 금지, §1 rhetorical italics 금지 (18× over), §1 stray "we" 검출, §9.1 over-literary/meta-commentary 블랙리스트 |
