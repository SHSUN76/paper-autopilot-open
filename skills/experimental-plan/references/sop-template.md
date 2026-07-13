# SOP 템플릿 — 학부생 수준 lab-bench protocol

> 이 템플릿은 `experimental-plan` 스킬이 SOP.md를 작성할 때 따르는 형식이다.
> 핵심 원칙: 학부생이 처음 보고도 따라할 수 있을 정도로 구체적으로.

---

## 형식 명세

```markdown
# SOP — {실험명}

> **목적**: 이 SOP를 따르면 mockup의 [Fig X / 데이터 종류]를 채울 수 있음.
> **소요 시간 (총)**: 약 [N]시간 / [N]일
> **난이도**: 초급 / 중급 / 고급
> **작성일**: YYYY-MM-DD (config timezone, 기본 Asia/Seoul)

---

## 0. 사전 확인사항

- [ ] 이 SOP를 처음부터 끝까지 한 번 읽었음
- [ ] 시약·장비 모두 확보되었음 ([`materials_list.md`](./materials_list.md))
- [ ] 안전 규정 숙지 (§5 참조)
- [ ] 데이터 저장 위치 확인 ([`<paper>/input/<YYMMDD_내용>/`])
- [ ] 비상 연락처 확인 (실험실 담당자)

---

## 1. 참조 protocol

| 출처 | 차용 부분 | 위치 |
|------|----------|------|
| Wang 2023 (Adv Energy Mater) | Cell 조립 §3.2 | [reference_protocols/Wang2023_SI.pdf §3.2](./reference_protocols/Wang2023_SI.pdf) |
| Kim 2024 (J Power Sources) | EIS 측정 조건 | [reference_protocols/Kim2024_methods_extracted.md](./reference_protocols/Kim2024_methods_extracted.md) |

---

## 2. 시약 및 장비 요약

(상세 발주 정보는 [`materials_list.md`](./materials_list.md) 참조)

### 시약
- LiPF6 (Sigma, ≥99.99%): 1.0 M in EC/DEC 1:1 v/v
- (이하 핵심만 요약, 자세한 grade·lot은 materials_list)

### 장비
- Glove box (H₂O < 0.5 ppm, O₂ < 0.5 ppm)
- Potentiostat (예: Biologic VMP3 or 동등 사양)
- ...

---

## 3. 단계별 절차

> ⏱ = 예상 시간 / ⚠️ = 안전·주의 / 📸 = 사진 권장 / 💾 = 데이터 저장

### Step 1. {작업명}

⏱ 30분

1. **준비**: 글로브박스 환경 확인 (H₂O < 0.5 ppm, O₂ < 0.5 ppm)
2. **칭량**: NCM811 powder 50.0 ± 0.1 mg을 정량 (4-digit balance)
   - ⚠️ 분진 흡입 주의 — N95 mask 착용
3. **혼합**: 8:1:1 wt% (active:carbon:binder) — 즉, NCM 50mg + Super P 6.25mg + PVdF 6.25mg
4. **NMP 첨가**: NMP 100 μL을 micropipette로 추가
   - 📸 슬러리 색상이 균질해질 때까지 사진 기록 (later quality check용)

📌 **흔한 실수**: NMP 양이 너무 적으면 그냥 가루 상태. 슬러리가 흐를 정도여야 함.

### Step 2. {다음 작업}

⏱ 1시간

...

(Step 3, 4, ... 동일 형식)

---

## 4. 데이터 수집

### 측정 항목

| 측정 | 조건 | 형식 | 컬럼 |
|------|------|------|------|
| CV | 0.1 mV/s, 2.5–4.3 V vs Li/Li+ | CSV | voltage, current, cycle |
| EIS | 1 MHz–10 mHz, 10 mV amplitude, OCV | CSV | frequency, Z_real, Z_imag |
| GCD | 0.1C / 0.5C / 1C / 2C / 5C, 100 cycles | CSV | cycle, charge_capacity, discharge_capacity, CE |

### 💾 저장 위치 및 형식

```
<paper_folder>/input/<YYMMDD_<실험명>>/
├── raw/                    ← 장비 native format (BTS, EC-Lab 등)
├── csv/                    ← 통일 CSV 변환본
│   ├── CV.csv
│   ├── EIS.csv
│   └── GCD.csv
├── photos/                 ← 셀 조립 / 색상 / 외관
└── notes.md                ← 실험 중 발생한 issue, 변경사항
```

### 명명 규칙
- 파일명: `<측정종류>_<sample-id>_<rep-N>.csv`
- 예: `EIS_NCM811-W500_rep1.csv`

---

## 5. 안전 ⚠️

### 위험 요소
- LiPF₆: 수분 접촉 시 HF 생성 (피부·호흡기 위험)
- NMP: 생식 독성, 휘발성 → 후드 안에서만 취급
- ...

### 필수 PPE
- 실험복, 보호장갑 (니트릴), 보안경, N95 마스크 (분진 작업 시)

### 비상 시
- 시약 누출: ...
- 화재: ...
- 비상 연락: 실험실 담당자 (전화), 안전관리실 (내선)

---

## 6. 종료 조건 (성공 판정)

### 목표값 ([`target_metrics.md`](./target_metrics.md) 참조)

- ✅ Capacity retention @ 100 cyc ≥ 80% (이 값 도달 시 충분)
- ✅ Coulombic efficiency ≥ 99.4%
- ✅ 측정 반복 ≥ 3회 (재현성 확보)

### 데이터 검증 체크리스트
- [ ] CSV 모든 row가 정상 (NaN, 무한대 없음)
- [ ] CV peak 위치가 reference paper와 동일 영역
- [ ] EIS Nyquist 형태가 합리적 (반원 + 직선)
- [ ] GCD plateau 전압이 NCM811 이론값(3.7-4.0 V)과 일치

### 실패 시 트러블슈팅
| 증상 | 원인 추정 | 조치 |
|------|----------|------|
| Capacity가 이론값의 50% 미만 | 활물질 비율, 슬러리 균질성 문제 | Step 1.3 비율 재확인, 슬러리 photos 검토 |
| EIS impedance 매우 큼 | 셀 조립 불량 | Step 2 cell stack 재조립 |
| ... | ... | ... |

---

## 7. 보고

### 실험 종료 후 작성
- `notes.md`에 변수와 다른 부분, 예상 외 관찰 기록
- `<paper_folder>/_paper.md`의 `blockers:` 항목에서 해당 실험 제거
- PI에게 결과 보고 (channel: ...)

### Mockup → 실제 데이터 갱신
- `<paper_folder>/mockup/<old>/`에 placeholder figure가 있다면, paper-autopilot이 다음 mockup V_n+1에서 자동으로 실제 데이터로 갱신함

---

## 8. 변경 이력

| 날짜 | 변경 | 작성자 |
|------|------|--------|
| YYYY-MM-DD | 초안 작성 (experimental-plan 스킬 자동 생성) | Claude + {1저자} |
| YYYY-MM-DD | Step 3.2 온도 60°C → 80°C 수정 (실험 결과 반영) | {학생} |
```

---

## 작성 시 핵심 원칙

1. **시간 명시 필수**: 모든 step에 ⏱ N분/시간 표기. "잠시", "충분히" 같은 모호한 표현 금지
2. **수치 + 단위**: "약 50mg" → "50.0 ± 0.1 mg"
3. **재현 가능성**: 학부생이 처음 보고 실행 가능한지 self-check
4. **흔한 실수 명시**: 📌 "흔한 실수: ..." 박스로 알려주기
5. **사진 권장 지점**: 📸 "여기서 사진" 명시 (later quality check + 추후 reviewer 질문 대응)
6. **출처 모든 step**: `(Wang2023 SI §3.2)` 처럼 어디서 가져온 step인지 명시
7. **safety는 단독 섹션**: §5에 모아두고, 본문 step에서도 ⚠️ 표시 중복
8. **저장 위치 표준**: 항상 `input/<YYMMDD_실험내용>/` 로 안내 (폴더구조 표준 따름)
