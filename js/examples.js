/* 예제 회로 (tools/test.js 로 모두 검증)
 *  group: 'mix' 혼합 신호 · 'ana' 아날로그 · 'dig' 디지털
 */
(function (root) {
  const EXAMPLES = [
    // ================================================================ 혼합 신호
    { group: 'mix', title: '555 타이머 LED 점멸기', desc: '아날로그 RC 충방전 + 555 내부 비교기 · 래치 (약 1 Hz)', text: `$ dt=1m
TXT 0 -7 "555 비안정 멀티바이브레이터: f ≈ 1.44 / ((RA + 2·RB)·C) ≈ 1 Hz"
V 0 14 0 -4 9
W 0 -4 15 -4
R 6 -4 6 4 10k name=RA lp=l
W 6 4 10 4
R 6 4 6 8 68k name=RB lp=l
W 6 8 10 8
W 8 8 8 6
W 8 6 10 6
C 6 8 6 14 10u pol=1 lp=l
T555 10 4
W 13 2 13 -4
W 15 2 15 -4
W 14 10 14 14
C 18 8 18 14 10n
R 18 6 22 6 470
LED 22 6 22 14 color=red
W 0 14 22 14
G 10 14
P 6 8 VC
P 18 6 OUT
scope ch1=VC ch2=OUT tb=0.5 v1=2 v2=5 o1=-3 o2=-3
! t=3 VMAX(VC)=6 VMIN(VC)=3 tol=6%` },

    { group: 'mix', title: '555 클럭 → 10진 카운터 → 7세그먼트', desc: '아날로그 타이머가 만든 클럭으로 디지털 카운터를 센다', text: `$ dt=1m
TXT 0 -7 "555 타이머(약 2 Hz) → 10진 카운터 → BCD→7세그 디코더 → 표시기"
V 0 14 0 -4 5
W 0 -4 15 -4
R 6 -4 6 4 10k name=RA lp=l
W 6 4 10 4
R 6 4 6 8 33k name=RB lp=l
W 6 8 10 8
W 8 8 8 6
W 8 6 10 6
C 6 8 6 14 10u pol=1 lp=l
T555 10 4
W 13 2 13 -4
W 15 2 15 -4
W 14 10 14 14
C 18 8 18 14 10n
W 0 14 18 14
G 10 14
W 18 6 21 6
CNT 21 6 mod=10 name=CNT
W 27 6 30 6
W 27 7 30 7
W 27 8 30 8
W 27 9 30 9
BCD7 30 6
W 36 6 40 6
W 36 7 40 7
W 36 8 40 8
W 36 9 40 9
W 36 10 40 10
W 36 11 40 11
W 36 12 40 12
SEG 40 6 name=DSP
P 6 8 VC
P 19 6 CK
scope ch1=VC ch2=CK tb=0.5 v1=1 v2=2 o1=-3 o2=-3
la ch=CK,Q3(CNT),Q2(CNT),Q1(CNT),Q0(CNT)
! t=2.2 -> CNT=4` },

    { group: 'mix', title: '카운터 → D/A 변환기 → RC 필터', desc: '디지털 계단 파형이 RC 저역 통과 필터로 부드러워진다', text: `TXT 0 -2 "4비트 카운터 → D/A 변환기 → RC 저역 통과 (τ = 47 ms)"
CLK 2 2 freq=10 name=CLK
W 2 2 4 2
CNT 4 2 name=CNT
W 10 2 14 2
W 10 3 14 3
W 10 4 14 4
W 10 5 14 5
DAC 14 2
W 21 2 23 2
P 23 2 VD
R 23 2 27 2 10k
W 27 2 29 2
C 29 2 29 6 4.7u
G 29 6
P 29 2 VOUT
scope ch1=VD ch2=VOUT tb=0.5 v1=1 v2=1 o1=-3 o2=-3
la ch=CLK,Q3(CNT),Q2(CNT),Q1(CNT),Q0(CNT)
! t=0.52 -> CNT=5 V(VD)=1.5625 V(VOUT)=1.45 tol=8%` },

    { group: 'mix', title: 'PWM → RC 필터 (평균 전압)', desc: '듀티비 25 % 의 클럭을 RC 로 걸러 평균 1.25 V 를 만든다', text: `TXT 0 -2 "PWM(50 Hz, 듀티 25 %) → RC 저역 통과: 평균 = 0.25 × 5 V"
CLK 3 2 freq=50 duty=0.25 name=PWM
W 3 2 5 2
P 5 2 IN
R 5 2 9 2 10k
W 9 2 11 2
C 11 2 11 6 10u
G 11 6
P 11 2 OUT
scope ch1=IN ch2=OUT tb=20m v1=2 v2=0.5 o1=-3 o2=-4
! t=1.5 VAVG(OUT)=1.25 tol=5%` },

    { group: 'mix', title: 'RC 발진기 (인버터 + 히스테리시스)', desc: '인버터 입력 문턱값(0.4·VDD / 0.6·VDD)과 RC 로 스스로 발진', text: `TXT 0 -3 "RC 발진기: 인버터 입력의 히스테리시스(2 V ↓ / 3 V ↑)로 스스로 발진"
NOT 4 2
W 8 2 12 2
DLED 12 2 name=BLINK
R 10 2 10 6 100k
W 10 6 2 6
W 2 6 2 2
W 2 2 4 2
C 6 6 6 10 10u
G 6 10
P 2 6 VC
P 8 2 OUT
scope ch1=VC ch2=OUT tb=0.2 v1=1 v2=2 o1=-3 o2=-3
! t=3 VMAX(VC)=3 VMIN(VC)=2 tol=6%` },

    { group: 'mix', title: '논리 게이트로 LED 구동', desc: '게이트 출력(출력 저항 25 Ω)이 실제 전류를 흘린다', text: `TXT 0 -3 "게이트 출력 → 전류 제한 저항 → LED (아날로그 회로로 해석)"
SW 3 2 name=A
SW 3 6 name=B
W 3 2 6 2
W 3 6 5 6
W 5 6 5 4
W 5 4 6 4
NAND 6 3
W 10 3 12 3
P 12 3 Y
R 12 3 16 3 330
LED 16 3 16 8 color=green
G 16 8
! A=0 B=0 -> Y=1
! A=1 B=1 -> Y=0
! A=1 B=0 -> V(Y)=4.8 tol=3%` },

    { group: 'mix', title: 'CMOS 인버터 (MOSFET 2개)', desc: '논리 스위치로 P · N MOSFET 게이트를 구동하고 출력을 로직 LED 로', text: `TXT 0 -3 "CMOS 인버터: P-MOSFET(위) + N-MOSFET(아래)"
V 0 8 0 0 5
W 0 0 12 0
M 10 2 p=1 f=1
M 10 6
W 10 2 10 6
SW 8 4 name=IN
W 8 4 10 4
W 12 4 17 4
P 15 4 OUT
DLED 17 4 name=Y
W 0 8 12 8
G 4 8
! IN=0 -> Y=1
! IN=1 -> Y=0
! IN=1 -> V(OUT)=0 tol=1% abs=0.05` },

    { group: 'mix', title: '비교기로 전압 감지', desc: '가변저항 전압이 기준 2.5 V 보다 높으면 1', text: `TXT 0 -3 "비교기: 가변저항(VIN) > 기준(2.5 V) 이면 출력 1"
V 0 12 0 0 5
W 0 0 6 0
W 0 12 12 12
G 2 12
POT 6 12 6 0 10k pos=0.7 name=VR
W 8 6 16 6
V 12 12 12 8 2.5 name=VREF
W 12 8 16 8
CMPR 16 7 f=1
W 20 7 22 7
DLED 22 7 name=HIGH
P 10 6 VIN
P 14 8 REF
! VR=0.7 -> HIGH=1
! VR=0.3 -> HIGH=0` },

    { group: 'mix', title: 'A/D 변환기 → 16진 표시', desc: '가변저항 전압(0~5 V)을 4비트 코드로', text: `TXT 0 -4 "A/D 변환기: 가변저항 전압 → 4비트 코드 → 16진 표시"
V 0 10 0 -2 5
W 0 -2 6 -2
W 0 10 6 10
G 2 10
POT 6 10 6 -2 10k pos=0.6 name=VR
W 8 4 8 2
ADC 14 2 name=ADC
W 14 2 17 2
W 14 3 17 3
W 14 4 17 4
W 14 5 17 5
HEX 17 2 name=HEX
P 8 3 VIN
! VR=0.6 -> HEX=9
! VR=0.3 -> HEX=4` },

    { group: 'mix', title: '릴레이로 램프 켜기', desc: '논리 스위치 → 트랜지스터 → 릴레이 코일 → 접점이 12 V 램프를 켠다', text: `TXT 0 -3 "릴레이 구동: 논리 신호 → NPN → 릴레이 코일 (역기전력 다이오드)"
V 0 14 0 0 12
W 0 0 15 0
W 10 0 10 2
RLY 10 2 name=K1
D 5 6 5 2
W 5 2 10 2
W 5 6 10 6
W 10 6 10 8
Q 8 10
W 10 12 10 14
SW 4 10 name=ON
R 4 10 8 10 1k
W 15 0 15 2
LAMP 14 6 14 14 12 1
W 0 14 14 14
G 2 14
! ON=1 -> I(LP1)=0.083 tol=5%
! ON=0 -> I(LP1)=0 abs=1m` },

    { group: 'mix', title: '아날로그 스위치 (디지털 제어)', desc: '클럭이 1 인 동안만 교류 신호가 통과한다', text: `TXT 0 -5 "아날로그 스위치: CTL = 1 일 때만 사인파 통과"
AC 0 8 0 2 2 5
W 0 2 4 2
ASW 4 2
CLK 4 -2 freq=0.5 name=CTL
W 4 -2 6 -2
W 6 -2 6 0
W 8 2 12 2
R 12 2 12 8 10k
W 0 8 12 8
G 6 8
P 2 2 IN
P 10 2 OUT
scope ch1=IN ch2=OUT tb=0.5 v1=1 v2=1` },

    // ================================================================ 전원 회로 (AC-DC · DC-DC · 정전압 · 정전류)
    { group: 'pwr', title: 'AC-DC 선형 전원: 변압기 + 브리지 + 7805', desc: '220 V 교류 → 변압기 → 전파 정류 → 평활 → 7805 → 5 V', text: `TXT 0 -2 "AC-DC 선형 전원: 220 V → 변압기(20:1) → 브리지 정류 → 평활 1000 µF → 7805 → 5 V"
AC 0 8 0 4 311 60 name=AC220
W 0 4 4 4
W 0 8 4 8
X 4 4 n=0.05
W 8 4 10 4
W 10 4 10 6
W 10 6 12 6
D 12 6 12 2 model=1n4001
D 12 10 12 6 model=1n4001
W 8 8 14 8
W 14 8 14 6
W 14 6 16 6
D 16 6 16 2 model=1n4001
D 16 10 16 6 model=1n4001
W 12 2 22 2
C 20 2 20 10 1000u pol=1
VREG 22 2 part=7805
W 25 4 25 10
W 28 2 34 2
C 30 2 30 10 10u
R 34 2 34 10 50 name=RL
W 12 10 34 10
G 22 10
P 20 2 VRAW
P 32 2 VOUT
scope ch1=VRAW ch2=VOUT tb=5m v1=5 v2=5 o1=-3 o2=-3
! t=0.3 VMIN(VOUT)=5 VMAX(VRAW)=14.6 tol=5%` },

    { group: 'pwr', title: 'AC-DC 전원 모듈 (SMPS, HLK-PM05)', desc: '220 V 교류를 바로 5 V 로 — 스마트 기기용 절연형 모듈', text: `TXT 0 -2 "AC-DC 모듈: 220 V 교류 → HLK-PM05 (절연형 SMPS) → 5 V"
AC 0 6 0 2 311 60 name=AC220
W 0 2 4 2
W 0 6 3 6
W 3 6 3 4
W 3 4 4 4
ACDC 4 2
W 10 2 16 2
C 14 2 14 4 470u pol=1
R 16 2 20 2 150
LED 20 2 20 4 color=green
R 24 2 24 4 50 name=RL
W 20 2 24 2
W 10 4 24 4
G 12 4
G 0 6
P 12 2 V5
scope ch1=V5 tb=20m v1=2 o1=-3
! t=0.3 VAVG(V5)=5 tol=2%` },

    { group: 'pwr', title: '벅 컨버터 원리 (이상적 스위치 · 개루프)', desc: 'Vout ≈ D × Vin — 스위치 · 코일 · 다이오드 · 콘덴서만으로 강압', text: `$ speed=5m dt=0.5u
TXT 0 -5 "벅(강압) 컨버터: 클럭(20 kHz, 듀티 40 %)이 스위치를 켜고 끈다 → Vout ≈ 0.4 × 12 V"
V 0 8 0 2 12
W 0 2 4 2
ASW 4 2 ron=0.05
CLK 4 -2 freq=20k duty=0.4 name=PWM
W 4 -2 6 -2
W 6 -2 6 0
D 8 8 8 2 model=schottky
L 8 2 14 2 220u
C 14 2 14 8 100u
W 14 2 18 2
R 18 2 18 8 5 name=RL
W 0 8 18 8
G 4 8
P 8 2 SW
P 16 2 OUT
scope ch1=SW ch2=OUT tb=20u v1=5 v2=2 o1=-3 o2=-3
! t=20m VAVG(OUT)=4.6 tol=5%` },

    { group: 'pwr', title: '부스트 컨버터 원리 (MOSFET · 개루프)', desc: 'Vout ≈ Vin / (1 − D) — 로우사이드 MOSFET 로 승압', text: `$ speed=5m dt=0.5u
TXT 0 -3 "부스트(승압) 컨버터: 클럭(20 kHz, 듀티 50 %)이 MOSFET 를 켜고 끈다 → Vout ≈ 5 V ÷ (1 − 0.5)"
V 0 8 0 2 5
W 0 2 4 2
L 4 2 10 2 220u
W 10 2 10 4
M 8 6 k=5
CLK 6 6 freq=20k duty=0.5 name=PWM
W 6 6 8 6
D 10 2 16 2 model=schottky
C 16 2 16 8 100u
W 16 2 20 2
R 20 2 20 8 20 name=RL
W 0 8 20 8
G 4 8
P 10 3 SW
P 18 2 OUT
scope ch1=SW ch2=OUT tb=20u v1=5 v2=2 o1=-3 o2=-3
! t=20m VAVG(OUT)=9.2 tol=6%` },

    { group: 'pwr', title: 'LM2596 벅 IC: 12 V → 5 V (폐루프)', desc: '첨두 전류 모드 스위칭 레귤레이터 — 부하가 바뀌어도 5 V 유지', text: `$ speed=2m
TXT 0 -4 "LM2596 강압 레귤레이터: 12 V → 5 V 1 A  (Vout = 1.23 V × (1 + R1/R2))"
V 0 10 0 2 12
W 0 2 6 2
C 3 2 3 10 100u pol=1
BUCK 6 2
W 12 2 14 2
D 14 10 14 2 model=schottky
L 14 2 22 2 100u
C 22 2 22 10 220u pol=1
W 22 2 30 2
R 26 2 26 4 3.06k name=R1
R 26 4 26 10 1k name=R2
W 12 4 26 4
R 30 2 30 10 5 name=RL
W 9 6 9 10
W 0 10 30 10
G 6 10
P 14 2 SW
P 28 2 VOUT
scope ch1=VOUT ch2=SW tb=0.5m v1=1 v2=5 o1=-3 o2=-3
! t=5m VAVG(VOUT)=5 tol=3%` },

    { group: 'pwr', title: 'MT3608 부스트 IC: 3.7 V 배터리 → 5 V', desc: '보조 배터리(파워뱅크)처럼 리튬 전지 전압을 USB 5 V 로 승압', text: `$ speed=2m
TXT 0 -3 "MT3608 승압 레귤레이터: 3.7 V → 5 V  (Vout = 0.6 V × (1 + R1/R2))"
V 0 10 0 0 3.7 name=BAT
W 0 0 6 0
W 6 0 6 2
BOOST 6 2
L 6 0 12 0 100u
W 12 0 12 2
D 12 2 18 2 model=schottky
C 18 2 18 10 47u pol=1
W 18 2 26 2
R 22 2 22 4 73.3k name=R1
R 22 4 22 10 10k name=R2
W 12 4 22 4
R 26 2 26 10 25 name=RL
W 9 6 9 10
W 0 10 26 10
G 3 10
P 12 1 SW
P 24 2 VOUT
scope ch1=VOUT ch2=SW tb=0.5m v1=1 v2=2 o1=-3 o2=-3
! t=10m VAVG(VOUT)=5 tol=3%` },

    { group: 'pwr', title: 'DC-DC 전원 모듈: 24 V → 5 V 2 A', desc: '효율 90 % 모듈 — 출력 전류 2 A 인데 입력 전류는 0.46 A', text: `TXT 0 -2 "DC-DC 모듈 (XL4015 급): 24 V → 5 V · 입력 전력 = 출력 전력 ÷ 효율"
V 0 6 0 2 24 lp=l
AM 0 2 4 2 name=IIN
DCDC 4 2 part=XL4015 vout=5 eff=0.9 ilim=5 uvlo=8
AM 10 2 14 2 name=IOUT
R 14 2 14 6 2.5 name=RL
W 0 6 14 6
W 7 4 7 6
G 3 6
P 14 2 VOUT
! V(VOUT)=5 I(IOUT)=2 I(IIN)=0.463 tol=3%
! V1=12 -> V(VOUT)=5 I(IIN)=0.926 tol=3%` },

    { group: 'pwr', title: '정전압: LM317 가변 레귤레이터', desc: 'Vout = 1.25 V × (1 + R2 / R1) — 가변저항으로 출력 조절', text: `TXT 0 -2 "LM317 정전압: Vout = 1.25 V × (1 + R2 / 240 Ω)  (R2 = 가변저항)"
V 0 10 0 2 15
W 0 2 4 2
VREG 4 2 part=LM317 vout=1.25 vdo=1.5 iq=50u
R 10 2 10 6 240 name=R1
W 7 4 7 6
W 7 6 10 6
POT 10 6 10 10 2k pos=0.36 name=R2
W 8 8 8 10
W 10 2 16 2
R 16 2 16 10 100 name=RL
W 0 10 16 10
G 4 10
P 14 2 VOUT
! V(VOUT)=5.04 tol=2%
! R2=0.84 -> V(VOUT)=10.1 tol=3%` },

    { group: 'pwr', title: '정전압: AMS1117-3.3 LDO (드롭아웃)', desc: '5 V → 3.3 V. 입력이 4.4 V 아래로 떨어지면 출력도 떨어진다', text: `TXT 0 -2 "LDO AMS1117-3.3: 입력 − 출력 차이가 1.1 V 보다 작아지면 조절 불가 (드롭아웃)"
V 0 8 0 2 5 name=USB
W 0 2 4 2
VREG 4 2 part=AMS1117-3.3 vout=3.3 vdo=1.1 ilim=1
W 10 2 14 2
R 14 2 14 8 33 name=RL
W 7 4 7 8
W 0 8 14 8
G 3 8
P 12 2 V33
! V(V33)=3.3 tol=2%
! USB=4 -> V(V33)=2.9 tol=3%` },

    { group: 'pwr', title: '정전압: TL431 정밀 션트 레귤레이터', desc: 'REF = 2.495 V 가 되도록 전류를 흡수 — Vout = 2.495 × (1 + R1/R2)', text: `TXT 0 -3 "TL431 션트 레귤레이터: Vout = 2.495 V × (1 + R1 / R2) = 4.99 V"
V 0 10 0 0 12
W 0 0 8 0
R 8 0 8 4 470 name=RS
W 8 4 4 4
R 4 4 4 6 10k name=R1 lp=l
W 4 6 6 6
R 4 6 4 10 10k name=R2 lp=l
TL431 8 4
W 8 8 8 10
W 8 4 14 4
R 14 4 14 10 1k name=RL
W 0 10 14 10
G 2 10
P 12 4 VOUT
! V(VOUT)=4.99 tol=1%
! V1=9 -> V(VOUT)=4.99 tol=1%` },

    { group: 'pwr', title: '정전압: OP앰프 + 트랜지스터 직렬 레귤레이터', desc: '제너 기준 5.1 V × 2 = 10.2 V — 되먹임으로 부하가 변해도 일정', text: `TXT 0 -3 "직렬 레귤레이터: 제너 기준(5.1 V) → OP앰프 → NPN 패스 트랜지스터, 이득 1 + R1/R2 = 2"
V 0 12 0 0 15
W 0 0 14 0
R 3 0 3 3 1k
Z 3 12 3 3 5.1
W 3 3 6 3
OA 6 4 f=1 vp=15 vn=0
W 10 4 12 4
Q 12 4
W 14 0 14 2
W 14 6 20 6
R 16 6 16 9 10k name=R1
R 16 9 16 12 10k name=R2
W 16 9 5 9
W 5 9 5 5
W 5 5 6 5
R 20 6 20 12 100 name=RL
W 0 12 20 12
G 8 12
P 18 6 VOUT
! t=0.05 V(VOUT)=10.2 tol=2%` },

    { group: 'pwr', title: '정전류: LM317 LED 드라이버', desc: 'I = 1.25 V ÷ R — 전원 전압이 바뀌어도 LED 전류는 20 mA', text: `TXT 0 -2 "LM317 정전류: I = 1.25 V ÷ 62 Ω ≈ 20 mA (OUT 과 ADJ 사이 저항)"
V 0 12 0 2 12
W 0 2 4 2
VREG 4 2 part=LM317 vout=1.25 vdo=1.5 iq=50u
R 10 2 10 6 62 name=RSET
W 7 4 7 6
W 7 6 12 6
LED 12 6 12 8 color=white
LED 12 8 12 10 color=white
AM 12 10 12 12 name=ILED
W 0 12 12 12
G 4 12
! I(ILED)=0.0202 tol=3%
! V1=15 -> I(ILED)=0.0202 tol=3%
! V1=10 -> I(ILED)=0.0202 tol=3%` },

    { group: 'pwr', title: '정전류: OP앰프 + MOSFET 전류 싱크 (전자 부하)', desc: 'I = Vset ÷ Rs — 가변저항으로 전류를 정한다', text: `TXT 0 -2 "정전류 싱크: OP앰프가 Rs 전압을 Vset 과 같게 → I = Vset ÷ 10 Ω"
V 0 12 0 0 12
W 0 0 14 0
POT 3 8 3 0 10k pos=0.0833 name=VSET
W 3 8 3 12
W 5 4 6 4
OA 6 5 f=1 vp=12 vn=0
W 10 5 12 5
M 12 5 k=2
R 14 0 14 3 22 name=LOAD
W 14 7 5 7
W 5 7 5 6
W 5 6 6 6
R 14 7 14 12 10 name=RS
W 0 12 14 12
G 8 12
P 16 7 VS
W 14 7 16 7
! t=0.05 I(LOAD)=0.1 tol=3%` },

    { group: 'pwr', title: '정전류: 트랜지스터 2개 전류 제한', desc: 'Q2 가 Rs 전압을 0.6 V 로 묶어 I ≈ 0.6 V ÷ 33 Ω', text: `TXT 0 -3 "트랜지스터 2개 정전류: Rs 에 걸리는 전압이 Q2 의 V_BE 에 묶인다"
V 0 14 0 0 12
W 0 0 12 0
LED 12 0 12 2 color=red
LED 12 2 12 4 color=red
Q 10 6 name=Q1
R 8 0 8 6 10k
W 8 6 10 6
Q 10 10 rot=2 f=1 name=Q2
W 8 8 8 6
W 12 8 12 10
W 10 10 12 10
R 12 10 12 14 33 name=RS
W 8 12 8 14
W 0 14 12 14
G 4 14
! I(LED1)=0.019 tol=12%
! V1=9 -> I(LED1)=0.019 tol=12%` },

    { group: 'pwr', title: '리튬 배터리 충전 (TP4056 · 정전류 → 정전압)', desc: '처음엔 0.5 A 정전류, 4.2 V 에 닿으면 정전압으로 전류가 줄어든다', text: `$ ic=zero
TXT 0 -2 "TP4056 충전: CC(0.5 A) → CV(4.2 V) — 배터리는 1 F 콘덴서 + 0.2 Ω 로 축소 모델"
V 0 8 0 2 5 name=USB
W 0 2 4 2
VREG 4 2 part=TP4056 vout=4.2 vdo=0.1 ilim=0.5 iq=0.3m
W 7 4 7 8
R 10 2 14 2 0.2 name=RBAT
C 14 2 14 8 1 v0=3.4 name=BAT lbl=배터리
W 0 8 14 8
G 3 8
P 14 2 VBAT
scope ch1=VBAT ch2=I(RBAT) tb=0.5 v1=0.2 v2=0.1 o1=-4 o2=-4
! t=0.5 I(RBAT)=0.5 tol=3%
! t=5 V(VBAT)=4.2 tol=1%` },

    // ================================================================ 아날로그 (회로이론 강좌)
    { group: 'ana', title: '전압 분배 (저항 2개)', desc: 'V(A) = 12 × 2k / (1k + 2k) = 8 V', text: `V 0 8 0 2 12
W 0 2 8 2
R 8 2 8 5 1k
P 8 5 A
R 8 5 8 8 2k
W 8 8 0 8
G 0 8
! V(A)=8` },
    { group: 'ana', title: 'RC 충전 · 방전 (전환 스위치)', desc: '스위치를 눌러 충전 ↔ 방전', text: `$ speed=1 ic=zero
C 2 2 2 8 100u
R 2 2 6 2 10k
SPDT 6 2 10 2 pos=0
W 10 2 14 2
V 14 8 14 2 10
W 10 4 12 4
W 12 4 12 8
W 2 8 14 8
G 8 8
P 2 2 VC
scope ch1=VC tb=0.5 v1=2 o1=-3
! t=1 V(VC)=6.32 tol=2%` },
    { group: 'ana', title: 'LC 진동', desc: '콘덴서와 코일 사이를 에너지가 오간다', text: `$ ic=zero dt=2u speed=5m
C 4 2 4 6 10u v0=5
W 4 2 8 2
L 8 2 8 6 10m
W 8 6 4 6
G 4 6
P 4 2 VC
scope ch1=VC ch2=I(L1) tb=1m v1=2 v2=50m` },
    { group: 'ana', title: '브리지 정류 + 평활', desc: '교류 → 직류', text: `AC 0 10 0 2 12 60
W 0 2 4 2
W 4 2 4 6
W 4 6 8 6
D 8 10 8 6 model=1n4001
D 8 6 8 2 model=1n4001
D 12 10 12 6 model=1n4001
D 12 6 12 2 model=1n4001
W 0 10 0 12
W 0 12 14 12
W 14 12 14 6
W 14 6 12 6
W 8 2 20 2
W 8 10 20 10
C 16 2 16 10 470u pol=1
R 20 2 20 10 1k
G 18 10
P 16 2 OUT
scope ch1=OUT tb=5m v1=2` },
    { group: 'ana', title: 'NPN 공통 이미터 증폭기', desc: '작은 교류 신호를 크게', text: `V 0 12 0 2 12
W 0 2 14 2
R 6 2 6 6 47k
R 6 8 6 12 10k
W 6 6 6 8
W 6 7 10 7
Q 10 7
R 12 2 12 5 4.7k
R 12 9 12 12 1k
C 12 9 14 9 100u
W 14 9 14 12
W 12 5 16 5
C 16 5 20 5 10u
R 20 5 20 12 10k
AC -4 12 -4 7 10m 1k
C -4 7 2 7 10u
W 2 7 6 7
W -4 12 20 12
G 0 12
P 2 7 IN
P 20 5 OUT
scope ch1=IN ch2=OUT tb=0.5m v1=10m v2=1` },
    { group: 'ana', title: '반전 증폭기 (OP앰프)', desc: '이득 −10', text: `AC 0 8 0 4 0.5 1k
R 0 4 4 4 1k
W 4 4 6 4
OA 6 5
W 6 4 6 2
R 6 2 10 2 10k
W 10 2 10 5
W 6 6 6 8
W 0 8 6 8
G 0 8
P 0 4 IN
P 10 5 OUT
scope ch1=IN ch2=OUT tb=0.5m v1=1 v2=2
! VPP(OUT)=10 tol=4%` },
    { group: 'ana', title: 'LED 점멸기 (비안정 멀티바이브레이터)', desc: '트랜지스터 2개가 번갈아 켜진다', text: `$ dt=0.5m speed=1
V 0 16 0 2 9
W 0 2 20 2
R 8 2 8 6 470
LED 8 6 8 10 color=red
R 16 2 16 6 470
LED 16 6 16 10 color=green
R 10 2 10 6 47k
W 10 6 10 12
R 14 2 14 6 47k
W 14 6 14 12
Q 10 12 rot=2 f=1
Q 14 12
W 8 10 9 10
W 9 10 9 7
C 9 7 13 7 10u
W 13 7 14 7
W 16 10 15 10
W 15 10 15 9
C 15 9 11 9 10u
W 11 9 10 9
W 8 14 8 16
W 16 14 16 16
W 0 16 16 16
G 12 16` },
    { group: 'ana', title: '이완 발진기 (OP앰프)', desc: '슈미트 트리거 + RC', text: `$ dt=5u
OA 6 5
W 6 4 4 4
C 4 4 4 8 100n
G 4 8
W 6 4 6 2
R 6 2 10 2 10k
W 10 2 10 5
R 10 5 10 9 10k
R 10 9 10 13 10k
G 10 13
W 6 6 6 9
W 6 9 10 9
P 10 5 OUT
P 4 4 VC lp=tl
scope ch1=OUT ch2=VC tb=1m v1=5 v2=5` },

    // ================================================================ 디지털 (디지털 공학 강좌)
    { group: 'dig', title: '기본 게이트 AND · OR · NOT', desc: '스위치 A, B 로 진리표 확인', text: `TXT 1 0 "기본 게이트: AND · OR · NOT"
SW 3 3 name=A
SW 3 8 name=B
W 3 3 5 3
W 5 3 5 15
W 5 4 9 4
W 5 9 9 9
W 5 15 9 15
W 3 8 7 8
W 7 6 7 11
W 7 6 9 6
W 7 11 9 11
AND 9 5
OR 9 10
NOT 9 15
W 13 5 16 5
DLED 16 5 name=AND
W 13 10 16 10
DLED 16 10 name=OR color=green
W 13 15 16 15
DLED 16 15 name=NOT color=yellow
tt in=A,B out=AND,OR,NOT
! A=0 B=0 -> AND=0 OR=0 NOT=1
! A=1 B=0 -> AND=0 OR=1 NOT=0
! A=0 B=1 -> AND=0 OR=1 NOT=1
! A=1 B=1 -> AND=1 OR=1 NOT=0` },
    { group: 'dig', title: '반가산기 (XOR + AND)', desc: 'S = A ⊕ B, C = A · B', text: `TXT 1 0 "반가산기: S = A ⊕ B, C = A · B"
SW 3 3 name=A
SW 3 11 name=B
W 3 3 9 3
W 5 3 5 9
W 5 9 9 9
W 3 11 9 11
W 7 5 7 11
W 7 5 9 5
XOR 9 4
AND 9 10
W 13 4 15 4
P 15 4 S
W 15 4 17 4
DLED 17 4 name=SUM
W 13 10 15 10
P 15 10 C
W 15 10 17 10
DLED 17 10 name=CARRY color=yellow
! A=0 B=0 -> S=0 C=0
! A=1 B=0 -> S=1 C=0
! A=0 B=1 -> S=1 C=0
! A=1 B=1 -> S=0 C=1` },
    { group: 'dig', title: '4비트 가산기 (DIP + ADD + 16진)', desc: 'DIP 스위치 두 개의 합', text: `TXT 1 0 "4비트 가산기: A + B + CI"
DIP 3 3 n=4 val=5 name=A
DIP 3 8 n=4 val=3 name=B
SW 3 13 name=CI
W 3 3 8 3
W 3 4 8 4
W 3 5 8 5
W 3 6 8 6
W 3 8 8 8
W 3 9 8 9
W 3 10 8 10
W 3 11 8 11
W 3 13 8 13
ADD 8 3 n=4
W 14 3 18 3
W 14 4 18 4
W 14 5 18 5
W 14 6 18 6
HEX 18 3 name=S
W 14 13 18 13
DLED 18 13 name=CO color=yellow
! A=5 B=3 CI=0 -> S=8 CO=0
! A=9 B=9 -> S=2 CO=1
! A=15 B=0 CI=1 -> S=0 CO=1` },
    { group: 'dig', title: 'SR 래치 (NOR 게이트)', desc: '되먹임으로 1 비트를 기억', text: `TXT 1 0 "SR 래치 (NOR 게이트 2개)"
SW 4 3 name=R
SW 4 11 name=S
W 4 3 10 3
W 4 11 10 11
NOR 10 4
NOR 10 10
W 14 4 20 4
W 16 4 16 7
W 16 7 8 7
W 8 7 8 9
W 8 9 10 9
W 14 10 20 10
W 17 10 17 6
W 17 6 7 6
W 7 6 7 5
W 7 5 10 5
DLED 20 4 name=Q
DLED 20 10 name=QN color=yellow
la ch=S,R,Q,QN
! S=1 R=0 -> Q=1 QN=0
! S=0 R=0 -> Q=1 QN=0
! R=1 -> Q=0 QN=1
! R=0 -> Q=0 QN=1` },
    { group: 'dig', title: 'D 플립플롭 + 클럭', desc: '클럭 상승 에지에서 D 를 저장', text: `TXT 1 0 "D 플립플롭: 클럭이 올라가는 순간의 D 를 저장"
SW 3 2 name=D
CLK 3 6 freq=0.5 name=CLK
W 3 2 7 2
W 3 6 5 6
W 5 6 5 4
W 5 4 7 4
DFF 7 2 name=FF1
W 13 2 16 2
DLED 16 2 name=Q
W 13 4 16 4
DLED 16 4 name=QN color=yellow
la ch=CLK,D,Q
! D=1 clk=1 -> Q=1 QN=0
! D=0 -> Q=1
! clk=1 -> Q=0 QN=1` },
    { group: 'dig', title: '10진 카운터 + 7세그먼트', desc: 'CNT(mod=10) → BCD7 → SEG', text: `TXT 1 0 "10진 카운터 + BCD→7세그먼트"
CLK 3 2 freq=2 name=CLK
BTN 3 5 name=RST
W 3 2 5 2
W 3 5 4 5
W 4 5 4 3
W 4 3 5 3
CNT 5 2 n=4 mod=10 name=CNT
W 11 2 14 2
W 11 3 14 3
W 11 4 14 4
W 11 5 14 5
BCD7 14 2
W 20 2 24 2
W 20 3 24 3
W 20 4 24 4
W 20 5 24 5
W 20 6 24 6
W 20 7 24 7
W 20 8 24 8
SEG 24 2 name=DSP
W 11 7 12 7
W 12 7 12 10
DLED 12 10 name=TC color=yellow
la ch=CLK,Q3(CNT),Q2(CNT),Q1(CNT),Q0(CNT),TC
! clk=7 -> CNT=7 DSP=7
! clk=2 -> CNT=9 TC=1
! clk=1 -> CNT=0 TC=0
! RST=1 -> CNT=0` },
    { group: 'dig', title: '4비트 시프트 레지스터', desc: 'SI 로 넣은 비트가 한 칸씩 이동', text: `TXT 1 0 "4비트 시프트 레지스터: SI → Q0 → Q1 → Q2 → Q3"
SW 3 3 name=SI
CLK 3 7 freq=2 name=CLK
W 3 3 8 3
W 3 7 6 7
W 6 7 6 4
W 6 4 8 4
SHR 8 3 n=4
W 14 3 16 3
W 16 3 16 2
W 16 2 18 2
DLED 18 2 name=Q0
W 14 4 18 4
DLED 18 4 name=Q1
W 14 5 17 5
W 17 5 17 6
W 17 6 18 6
DLED 18 6 name=Q2
W 14 6 16 6
W 16 6 16 8
W 16 8 18 8
DLED 18 8 name=Q3
la ch=CLK,SI,Q0,Q1,Q2,Q3
! SI=1 clk=1 -> Q0=1 Q1=0
! SI=0 clk=1 -> Q0=0 Q1=1
! clk=2 -> Q3=1 Q2=0` },
    { group: 'dig', title: '링 발진기 (게이트 지연)', desc: 'NOT 3개를 고리로 — 나노초 발진 (speed=100n)', text: `$ speed=100n
TXT 1 0 "링 발진기: NOT 3개를 고리로 (1초에 100 ns 진행)"
NOT 4 4
NOT 10 4
NOT 16 4
W 2 4 4 4
W 8 4 10 4
P 9 4 A
W 14 4 16 4
P 15 4 B
W 20 4 22 4
P 21 4 C
W 22 4 22 7
W 22 7 2 7
W 2 7 2 4
DLED 22 4 name=Y
la ch=A,B,C tb=10n` }
  ];
  const GROUPS = { mix: '🔀 혼합 신호 (아날로그 + 디지털)', pwr: '🔋 전원 회로 (AC-DC · DC-DC · 정전압 · 정전류)', ana: '〰 아날로그', dig: '🔢 디지털' };
  const api = { EXAMPLES, GROUPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SIM_EXAMPLES = api;
})(typeof window !== 'undefined' ? window : globalThis);
