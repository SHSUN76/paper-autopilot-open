# Battery Target Metrics — 저널별 수치 목표 가이드

> experimental-plan TARGET 모드가 사용. corpus + literature 기반 저널별 평균 지표.
> 정기 갱신 필요 (corpus 추가 시).

---

## 사용 방법

1. `_paper.md`의 `journal:` 필드에서 target journal 추출
2. 아래 표에서 해당 저널 row 찾기
3. 없으면 IF 비슷한 저널 row로 대체
4. mockup 가설값과 비교해 어느 tier인지 표시 → `target_metrics.md` 작성

---

## 표 1. Cathode performance (Li-ion, NCM/NCA/LCO/LFP 등)

> n = corpus 분석 paper 수. 빈 cell은 corpus 데이터 부족 → 갱신 필요.

| Journal | IF (2024) | n | Cap @ 0.5C (mAh/g) | Retention @ 100cyc | CE (avg) | Energy density (Wh/kg) |
|---------|-----------|---|--------------------|--------------------|----------|------------------------|
| **Joule** | ~40 | 5 | 200-220 (NCM) | ≥ 90% | ≥ 99.7% | 280-320 |
| **Nature Energy** | ~58 | 4 | 200-230 | ≥ 92% | ≥ 99.8% | 290-340 |
| **Advanced Materials** | ~28 | 6 | 190-215 | ≥ 88% | ≥ 99.6% | 270-300 |
| **Adv. Energy Mater. (AEM)** | ~25 | 8 | 180-210 | ≥ 80% | ≥ 99.4% | 240-290 |
| **ACS Nano** | ~17 | 5 | 180-205 | ≥ 80% | ≥ 99.5% | 240-280 |
| **Energy Environ. Sci. (EES)** | ~32 | 4 | 195-220 | ≥ 85% | ≥ 99.5% | 260-310 |
| **Chem. Eng. J. (CEJ)** | ~14 | 6 | 170-200 | ≥ 75% | ≥ 99.3% | 230-270 |
| **J. Mater. Chem. A (JMCA)** | ~11 | 7 | 170-200 | ≥ 75% | ≥ 99.3% | 230-270 |
| **Small** | ~13 | 4 | 175-200 | ≥ 78% | ≥ 99.4% | 230-280 |
| **J. Power Sources** | ~9 | 5 | 160-195 | ≥ 70% | ≥ 99.0% | 220-260 |
| **J. Energy Storage** | ~9 | 3 | 160-190 | ≥ 70% | ≥ 99.0% | 220-260 |

**해석 가이드**:
- "≥ 90%": 그 저널 합격선의 평균. 이 값 미만이면 reviewer가 "not competitive" 코멘트 가능성 ↑
- 상위 25%는 평균값 + 5-10%
- 최소 통과 (= reject 안 당하는 하한): 평균 - 10%

---

## 표 2. Sodium-ion (Na-ion) anode/cathode

| Journal | n | Cap (mAh/g, anode) | Retention @ 100cyc | Rate cap @ 5C/0.1C |
|---------|---|--------------------|--------------------|--------------------|
| **Adv. Energy Mater.** | 3 | ≥ 200 (HC) | ≥ 75% | ≥ 60% |
| **Nano Energy** | 2 | ≥ 250 | ≥ 80% | ≥ 50% |
| **Acta Materialia** | 2 | ≥ 150 (alloy) | ≥ 70% | — |

⚠️ Na-ion은 corpus 적음. 추가 OA paper 검색 필수.

---

## 표 3. Solid electrolyte (sulfide / oxide / polymer)

| Journal | n | Ionic σ (S/cm @ RT) | Critical current density (mA/cm²) |
|---------|---|---------------------|-----------------------------------|
| **Joule** | 2 | ≥ 1×10⁻³ | ≥ 5 |
| **Nature Energy** | 1 | ≥ 5×10⁻³ | ≥ 10 |
| **Adv. Energy Mater.** | 3 | ≥ 1×10⁻³ | ≥ 1 |

---

## 표 4. OER / HER / Supercapacitor

| Journal | n | Overpotential @ 10 mA/cm² (mV) | Tafel slope (mV/dec) | Stability (h) |
|---------|---|--------------------------------|----------------------|---------------|
| **Adv. Mater.** | 2 | ≤ 250 | ≤ 60 | ≥ 100 |
| **JMCA** | 4 | ≤ 290 | ≤ 70 | ≥ 50 |
| **CEJ** | 3 | ≤ 310 | ≤ 80 | ≥ 30 |

---

## 표 5. Dry-process electrode (PI/PTFE/PVdF binder, MechanoFusion 등)

> 사용자의 주력 sub-domain. corpus 보강 필요.

| Journal | 대상 | 핵심 metric |
|---------|------|------------|
| Nature Communications (사용자 PI 단순첨가) | NCM 단순첨가 | Capacity ≥ 200 mAh/g, retention ≥ 85%@100cyc, mass loading ≥ 4 mAh/cm² |
| Small (사용자 JEMP) | Granule + dry process | Stress 분포 균일성, capacity ≥ 200 mAh/g |
| Joule (사용자 Science_Joule) | Interfacial design framework | Energy density ≥ 280 Wh/kg, mass loading ≥ 5 mAh/cm² |

---

## 6. 출처 / 갱신 절차

### 데이터 출처
- Vault corpus (`paragraph_reports/*.json`)에서 Results 단락의 수치 수동 추출
- Open access paper 보충
- 사용자 자가 작성 manuscript의 정량 비교 표

### 갱신 절차
1. 새 corpus paper 추가 → `01_skill_principles_분석.md`에서 통계 갱신
2. 이 파일의 표 갱신 (n 값 증가)
3. 사용자 검증 받음 (특히 본인 sub-domain은 본인이 가장 잘 앎)

### 갱신 일정
- 분기별 (corpus 새 paper 10편 이상 추가 시)
- target journal 결과 발표 (비교 데이터 갱신)

---

## 7. TARGET 모드 출력 예시

```markdown
# Target Metrics — Adv. Energy Mater. (target)

## 통계 출처
- Corpus: aem-128, aem-129, aem2025-060, aem2025-108, aem2025-109, aem2026-019, aem2026-067, aem2026-093 (n=8)
- 갱신 일자: 2026-04-30

## 핵심 지표

| Metric | Target 평균 | 상위 25% | 최소 (reject 회피) | Mockup 가설값 | 평가 |
|--------|------------|---------|-------------------|---------------|------|
| Cap @ 0.5C (mAh/g) | 195 | 210 | 175 | 200 | 평균 이상 ✅ |
| Retention @ 100cyc | 82% | 91% | 70% | 88% | 상위 25% 근접 ⭐ |
| CE | 99.5% | 99.7% | 99.0% | 99.6% | 평균 이상 ✅ |
| Energy density (Wh/kg) | 245 | 280 | 210 | 230 | 평균 이하 ⚠️ |

## 권장 액션
- ✅ Retention과 CE는 충분 → 이 부분은 mockup 가설 그대로 검증
- ⚠️ Energy density 230 Wh/kg는 평균(245) 미달 → 활물질 비율 ↑ 또는 binder 함량 ↓ 검토
- 💡 mass loading을 명시하면 비교 paper들과 비교 시 더 강력 (corpus의 mass loading 평균: 4.2 mAh/cm²)
```

---

## 8. 한계와 caveat

- 표의 수치는 **통계적 가이드**. 개별 논문은 변동 큼
- 새로운 sub-domain (e.g. Na-ion, K-ion, Mg-ion)은 corpus 부족 → web 보강 필수
- Review paper 인용 metric은 주의: 종합값이라 individual paper 평균과 다를 수 있음
- IF는 변동 → annual 갱신 필요 (현재 표는 2024 기준)
