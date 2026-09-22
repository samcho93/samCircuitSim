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
  const GROUPS = { mix: '🔀 혼합 신호 (아날로그 + 디지털)', ana: '〰 아날로그', dig: '🔢 디지털' };
  const api = { EXAMPLES, GROUPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SIM_EXAMPLES = api;
})(typeof window !== 'undefined' ? window : globalThis);
