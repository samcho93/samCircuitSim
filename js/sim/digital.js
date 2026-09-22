/* 디지털 해석 코어 (브라우저 · Node 공용)
 *  - 논리 부품의 단자 배치(지역 좌표), 동작(평가 함수), 이벤트 구동 시뮬레이션 (값 0 · 1 · X · Z, 관성 지연, 클럭 에지)
 *  - 혼합 신호: 아날로그 넷에 붙은 디지털 단자는
 *      입력 → 아날로그 전압을 문턱값(히스테리시스)으로 읽은 논리값 (net.av)
 *      출력 → 아날로그 쪽 '브리지'(출력 저항 + 목표 전압)로 나간다 (mixed.js 가 연결)
 *  - 아날로그 단자(ain)를 직접 읽는 부품: 비교기(CMPR), 555 타이머, A/D 변환기(ADC)
 *  - 아날로그 전압을 내보내는 단자(aout): D/A 변환기(DAC)
 */
(function (root) {
  'use strict';
  const L0 = 0, L1 = 1, LX = 2, LZ = 3;
  const VCH = ['0', '1', 'X', 'Z'];
  const A = root.CS_A || (typeof require !== 'undefined' ? require('./analog.js') : null);
  const parseNum = (s) => { const v = A.parseNum(s, NaN); return v == null ? NaN : v; };

  // ================================================================== 논리 연산
  const lv = (a) => (a === LZ ? LX : a);
  const NOT = (a) => (a === L0 ? L1 : a === L1 ? L0 : LX);
  function AND(arr) { let x = false; for (const a of arr) { const v = lv(a); if (v === L0) return L0; if (v === LX) x = true; } return x ? LX : L1; }
  function OR(arr) { let x = false; for (const a of arr) { const v = lv(a); if (v === L1) return L1; if (v === LX) x = true; } return x ? LX : L0; }
  function XOR(arr) { let p = 0; for (const a of arr) { const v = lv(a); if (v === LX) return LX; p ^= v; } return p; }
  function toNum(bits) { let v = 0; for (const b of bits) { if (b !== L0 && b !== L1) return null; v = v * 2 + b; } return v; }
  function fromNum(v, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(Math.floor(v / Math.pow(2, i)) % 2); return out; }
  const allX = (n) => new Array(n).fill(LX);

  // ================================================================== 부품 정의
  const PIN_DEFAULT = { CI: L0, EN: L1, CLR: L0, LD: L0, UP: L1, WE: L0, '~PRE': L1, '~CLR': L1, OE: L1 };
  const GATE_TYPES = ['NOT', 'BUF', 'AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'];
  const SEG_TABLE = [0x7e, 0x30, 0x6d, 0x79, 0x33, 0x5b, 0x5f, 0x70, 0x7f, 0x7b, 0x77, 0x1f, 0x4e, 0x3d, 0x4f, 0x47];

  const int = (v, d, lo, hi) => { let n = parseInt(v, 10); if (!isFinite(n)) n = d; return Math.max(lo, Math.min(hi, n)); };
  const on = (v) => v === 1 || v === '1' || v === true || v === 'true' || v === 'on';
  const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const msb = (p, n) => range(n, (i) => p + (n - 1 - i));
  const lsb = (p, n) => range(n, (i) => p + i);

  /** 박스형 부품(IC) 명세 → 단자 목록과 몸체 */
  function boxLayout(spec) {
    const pitch = spec.pitch || 1;
    const w = spec.w || 4;
    const L = spec.L || [], R = spec.R || [], T = spec.T || [], B = spec.B || [];
    const rows = Math.max(L.length, R.length, 1);
    const span = (rows - 1) * pitch;
    const pad = pitch === 1 ? 0.8 : 1;
    const body = { x0: 1, y0: -pad, x1: 1 + w, y1: span + pad };
    const pins = [];
    const mk = (nm, x, y, dir, side) => {
      if (!nm) return;
      const o = typeof nm === 'object' ? nm : { n: nm };
      let n = o.n;
      const clk = n.indexOf('>') >= 0;
      n = n.replace('>', '');
      const bar = n === '~Q';
      const neg = n[0] === '~' && !bar;
      pins.push({ n, lbl: o.lbl || n.replace(/^~/, ''), x, y, dir: o.dir || dir, neg, bar, clk, side, def: o.def != null ? o.def : PIN_DEFAULT[n] });
    };
    const tb = pitch === 1 ? 1.2 : 1;
    L.forEach((n, i) => mk(n, 0, i * pitch, 'in', 'l'));
    R.forEach((n, i) => mk(n, w + 2, i * pitch, 'out', 'r'));
    T.forEach((n, i) => mk(n, 1 + Math.round(w * (i + 1) / (T.length + 1)), -pad - tb, 'in', 't'));
    B.forEach((n, i) => mk(n, 1 + Math.round(w * (i + 1) / (B.length + 1)), span + pad + tb, 'in', 'b'));
    return { pins, body, box: true, title: spec.title || '', pitch, w };
  }

  /** 부품 종류별 단자 배치 (지역 좌표, 회전 전) */
  function localLayout(el) {
    const p = el.params;
    const t = el.type;
    if (GATE_TYPES.indexOf(t) >= 0) {
      const one = t === 'NOT' || t === 'BUF';
      const n = one ? 1 : int(p.n, 2, 2, 8);
      const pins = range(n, (i) => ({ n: 'I' + (i + 1), lbl: '', x: 0, y: 2 * i - (n - 1), dir: 'in', side: 'l' }));
      pins.push({ n: 'Y', lbl: '', x: 4, y: 0, dir: 'out', side: 'r' });
      const h = one ? 1.1 : Math.max(1.6, n - 1 + 0.6);
      return { pins, body: { x0: 0.6, y0: -h, x1: 3.6, y1: h }, gate: true, n };
    }
    switch (t) {
      case 'TBUF': return { pins: [{ n: 'A', lbl: '', x: 0, y: 0, dir: 'in', side: 'l' }, { n: on(p.inv) ? '~EN' : 'EN', lbl: '', x: 2, y: -2, dir: 'in', side: 't', def: on(p.inv) ? L0 : L1 },
        { n: 'Y', lbl: '', x: 4, y: 0, dir: 'out', side: 'r' }], body: { x0: 0.6, y0: -1.1, x1: 3.4, y1: 1.1 }, gate: true };
      case 'SW': case 'BTN': return { pins: [{ n: 'Y', lbl: '', x: 0, y: 0, dir: 'out', side: 'r' }], body: { x0: -3.2, y0: -0.8, x1: -0.3, y1: 0.8 } };
      case 'CLK': return { pins: [{ n: 'Y', lbl: '', x: 0, y: 0, dir: 'out', side: 'r' }], body: { x0: -3.6, y0: -0.9, x1: -0.4, y1: 0.9 } };
      case 'HI': return { pins: [{ n: 'Y', lbl: '', x: 0, y: 0, dir: 'out', side: 'b' }], body: { x0: -0.7, y0: -1.3, x1: 0.7, y1: 0 } };
      case 'LO': return { pins: [{ n: 'Y', lbl: '', x: 0, y: 0, dir: 'out', side: 't' }], body: { x0: -0.7, y0: 0, x1: 0.7, y1: 1.3 } };
      case 'PU': return { pins: [{ n: 'Y', lbl: '', x: 0, y: 0, dir: 'out', side: 'b', weak: true }], body: { x0: -0.6, y0: -3.3, x1: 0.6, y1: 0 } };
      case 'PD': return { pins: [{ n: 'Y', lbl: '', x: 0, y: 0, dir: 'out', side: 't', weak: true }], body: { x0: -0.6, y0: 0, x1: 0.6, y1: 3.3 } };
      case 'DIP': {
        const n = int(p.n, 4, 1, 8);
        return { pins: msb('D', n).map((nm, i) => ({ n: nm, lbl: '', x: 0, y: i, dir: 'out', side: 'r' })), body: { x0: -3.4, y0: -0.6, x1: -0.3, y1: n - 0.4 }, n };
      }
      case 'ADC': {
        const n = int(p.n, 4, 1, 8);
        const pins = msb('D', n).map((nm, i) => ({ n: nm, lbl: nm, x: 0, y: i, dir: 'out', side: 'r' }));
        pins.push({ n: 'VIN', lbl: 'VIN', x: -6, y: 0, dir: 'ain', side: 'l' });
        return { pins, body: { x0: -5, y0: -0.8, x1: -1, y1: Math.max(n - 1, 2) + 0.8 }, n };
      }
      case 'DLED': return { pins: [{ n: 'A', lbl: '', x: 0, y: 0, dir: 'in', side: 'l' }], body: { x0: 0.3, y0: -0.8, x1: 2, y1: 0.8 } };
      case 'LEDS': {
        const n = int(p.n, 8, 1, 16);
        return { pins: msb('D', n).map((nm, i) => ({ n: nm, lbl: '', x: 0, y: i, dir: 'in', side: 'l' })), body: { x0: 0.4, y0: -0.6, x1: 2, y1: n - 0.4 }, n };
      }
      case 'HEX': return { pins: msb('D', 4).map((nm, i) => ({ n: nm, lbl: nm, x: 0, y: i, dir: 'in', side: 'l' })), body: { x0: 1, y0: -0.8, x1: 4.6, y1: 3.8 } };
      case 'SEG': {
        const dp = on(p.dp);
        const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].concat(dp ? ['dp'] : []);
        return { pins: names.map((nm, i) => ({ n: nm, lbl: nm, x: 0, y: i, dir: 'in', side: 'l' })), body: { x0: 1, y0: -0.8, x1: 5.4, y1: names.length - 0.2 } };
      }
      case 'CMPR': return { pins: [{ n: 'IN-', lbl: '−', x: 0, y: -1, dir: 'ain', side: 'l' }, { n: 'IN+', lbl: '+', x: 0, y: 1, dir: 'ain', side: 'l' }, { n: 'OUT', lbl: '', x: 4, y: 0, dir: 'out', side: 'r' }],
        body: { x0: 0.5, y0: -1.8, x1: 3.6, y1: 1.8 } };
    }
    const spec = boxSpec(el);
    if (spec) return boxLayout(spec);
    return null;
  }

  function boxSpec(el) {
    const p = el.params;
    switch (el.type) {
      case 'HA': return { L: ['A', 'B'], R: ['S', 'C'], pitch: 2, title: 'HA' };
      case 'FA': return { L: ['A', 'B', 'CI'], R: ['S', '', 'CO'], pitch: 2, title: 'FA' };
      case 'ADD': {
        const n = int(p.n, 4, 1, 8);
        const L = msb('A', n).concat([''], msb('B', n), ['', 'CI']);
        const R = msb('S', n); while (R.length < L.length - 1) R.push(''); R.push('CO');
        return { L, R, title: 'Σ' };
      }
      case 'CMP': {
        const n = int(p.n, 4, 1, 8);
        return { L: msb('A', n).concat([''], msb('B', n)), R: [{ n: 'GT', lbl: 'A>B' }, { n: 'EQ', lbl: 'A=B' }, { n: 'LT', lbl: 'A<B' }], title: 'CMP' };
      }
      case 'ALU': {
        const n = int(p.n, 4, 1, 8);
        return { L: msb('A', n).concat([''], msb('B', n), ['', 'S2', 'S1', 'S0']), R: msb('F', n).concat(['', 'CO', 'Z']), title: 'ALU' };
      }
      case 'MUX': {
        const k = int(p.sel, 1, 1, 3), m = 1 << k;
        const L = lsb('D', m).concat([''], msb('S', k));
        if (on(p.en)) L.push('', 'EN');
        const R = range(Math.floor((m - 1) / 2), () => ''); R.push('Y');
        return { L, R, title: 'MUX' };
      }
      case 'DEMUX': {
        const k = int(p.sel, 1, 1, 3), m = 1 << k;
        return { L: ['D', ''].concat(msb('S', k)), R: lsb('Y', m), title: 'DMX' };
      }
      case 'DEC': {
        const k = int(p.bits, 2, 1, 4), m = 1 << k;
        const L = msb('A', k);
        if (on(p.en)) L.push('', 'EN');
        return { L, R: lsb(on(p.al) ? '~Y' : 'Y', m), title: 'DEC' };
      }
      case 'ENC': {
        const k = int(p.bits, 2, 1, 3), m = 1 << k;
        return { L: lsb('D', m), R: msb('A', k).concat(['', 'V']), title: 'ENC' };
      }
      case 'BCD7': {
        const al = on(p.ca);
        return { L: msb('D', 4), R: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => (al ? '~' + s : s)), title: 'BCD→7' };
      }
      case 'SRL': return on(p.nand) ? { L: ['~S', '~R'], R: ['Q', '~Q'], pitch: 2, title: 'SR' } : { L: ['S', 'R'], R: ['Q', '~Q'], pitch: 2, title: 'SR' };
      case 'DL': return { L: ['D', 'EN'], R: ['Q', '~Q'], pitch: 2, title: 'D 래치' };
      case 'DFF': case 'TFF': {
        const c = on(p.neg) ? '~>CLK' : '>CLK';
        return { L: [el.type === 'DFF' ? 'D' : 'T', c], R: ['Q', '~Q'], pitch: 2, T: on(p.pre) ? ['~PRE'] : [], B: on(p.clr) ? ['~CLR'] : [], title: el.type === 'DFF' ? 'D' : 'T' };
      }
      case 'JKFF': case 'SRFF': {
        const c = on(p.neg) ? '~>CLK' : '>CLK';
        const a = el.type === 'JKFF' ? ['J', 'K'] : ['S', 'R'];
        return { L: [a[0], c, a[1]], R: ['Q', '', '~Q'], pitch: 2, T: on(p.pre) ? ['~PRE'] : [], B: on(p.clr) ? ['~CLR'] : [], title: el.type === 'JKFF' ? 'JK' : 'SR' };
      }
      case 'REG': {
        const n = int(p.n, 4, 1, 8);
        const L = msb('D', n).concat(['']);
        if (p.ld == null || on(p.ld)) L.push('LD');
        L.push('>CLK');
        if (on(p.clr)) L.push('CLR');
        return { L, R: msb('Q', n), title: 'REG' };
      }
      case 'SHR': {
        const n = int(p.n, 4, 1, 8);
        const L = ['SI', '>CLK'];
        if (on(p.clr)) L.push('CLR');
        if (on(p.par)) L.push('', 'LD', ...lsb('D', n));
        return { L, R: lsb('Q', n), title: 'SHIFT' };
      }
      case 'CNT': {
        const n = int(p.n, 4, 1, 8);
        const L = [];
        if (on(p.en)) L.push('EN');
        if (on(p.ud)) L.push('UP');
        if (on(p.ld)) L.push('LD');
        L.push('>CLK');
        if (p.clr == null || on(p.clr)) L.push('CLR');
        if (on(p.ld)) L.push('', ...msb('D', n));
        const R = msb('Q', n).concat(['', 'TC']);
        return { L, R, title: 'CTR' };
      }
      case 'ROM': {
        const a = int(p.a, 3, 1, 6), d = int(p.d, 4, 1, 8);
        return { L: msb('A', a), R: msb('D', d), title: 'ROM' };
      }
      case 'RAM': {
        const a = int(p.a, 3, 1, 6), d = int(p.d, 4, 1, 8);
        return { L: msb('A', a).concat([''], msb('DI', d), ['', 'WE', '>CLK']), R: msb('DO', d), title: 'RAM' };
      }
      case 'DAC': {
        const n = int(p.n, 4, 1, 8);
        return { L: msb('D', n), R: [{ n: 'OUT', lbl: 'OUT', dir: 'aout' }], title: 'DAC', w: 5 };
      }
      case 'T555':
        return { L: [{ n: 'DIS', dir: 'out' }, { n: 'THR', dir: 'ain' }, { n: 'TRIG', dir: 'ain' }], R: ['', { n: 'OUT', dir: 'out' }, { n: 'CV', dir: 'aout' }],
          T: [{ n: 'VCC', dir: 'ain' }, { n: 'RST', dir: 'ain' }], B: [{ n: 'GND', dir: 'ain' }], pitch: 2, w: 6, title: '555' };
    }
    return null;
  }

  // ---- 좌표 변환 (f: 위아래 뒤집기, rot: 시계 방향 90° × rot)
  function xf(el, a, b) {
    if (on(el.params.f)) b = -b;
    const r = ((int(el.params.rot, 0, 0, 3)) % 4 + 4) % 4;
    for (let i = 0; i < r; i++) { const t = a; a = -b; b = t; }
    return [el.x + a, el.y + b];
  }
  /** 단자 목록 (세계 좌표) */
  function pinsOf(el) {
    const lay = localLayout(el);
    if (!lay) return [];
    return lay.pins.map((pn) => { const [x, y] = xf(el, pn.x, pn.y); return Object.assign({}, pn, { lx: pn.x, ly: pn.y, x, y }); });
  }
  /** 부품 외곽 (세계 좌표) — 단자 포함 */
  function boundsOf(el) {
    const lay = localLayout(el);
    if (!lay) return { x0: el.x, y0: el.y, x1: el.x, y1: el.y };
    const pts = [[lay.body.x0, lay.body.y0], [lay.body.x1, lay.body.y1], [lay.body.x0, lay.body.y1], [lay.body.x1, lay.body.y0]].concat(lay.pins.map((q) => [q.x, q.y]));
    const w = pts.map(([a, b]) => xf(el, a, b));
    return { x0: Math.min(...w.map((q) => q[0])), y0: Math.min(...w.map((q) => q[1])), x1: Math.max(...w.map((q) => q[0])), y1: Math.max(...w.map((q) => q[1])) };
  }
  /** 몸체만의 외곽 (세계 좌표) */
  function bodyOf(el) {
    const lay = localLayout(el);
    if (!lay) return { x0: el.x, y0: el.y, x1: el.x, y1: el.y };
    const c = [[lay.body.x0, lay.body.y0], [lay.body.x1, lay.body.y1]].map(([a, b]) => xf(el, a, b));
    return { x0: Math.min(c[0][0], c[1][0]), y0: Math.min(c[0][1], c[1][1]), x1: Math.max(c[0][0], c[1][0]), y1: Math.max(c[0][1], c[1][1]) };
  }

  // ================================================================== 디지털 부품 목록
  const TYPES = {
    SW: { cat: 'din', name: '토글 스위치 (논리)', desc: '누를 때마다 0 ↔ 1', def: { on: 0 } },
    BTN: { cat: 'din', name: '푸시 버튼 (논리)', desc: '누르고 있는 동안만 1 (inv=1 이면 반대)', def: { inv: 0 } },
    CLK: { cat: 'din', name: '클럭', desc: '주기적인 사각파 (freq = 주파수 Hz)', args: ['freq'], def: { freq: 1, duty: 0.5, run: 1 } },
    HI: { cat: 'din', name: '논리 1 (VCC)', desc: '항상 1 (아날로그에서는 VDD 전원)' },
    LO: { cat: 'din', name: '논리 0 (GND)', desc: '항상 0 (아날로그에서는 0 V)' },
    DIP: { cat: 'din', name: 'DIP 스위치', desc: 'n 비트 입력 (위쪽이 MSB)', def: { n: 4, val: 0 } },
    PU: { cat: 'din', name: '풀업 저항', desc: '약한 1 (아날로그에서는 r 저항으로 VDD)', def: { r: 10000 } },
    PD: { cat: 'din', name: '풀다운 저항', desc: '약한 0 (아날로그에서는 r 저항으로 0 V)', def: { r: 10000 } },
    DLED: { cat: 'dout', name: '로직 LED', desc: '입력이 1 이면 켜지는 표시등 (전류 없음)', def: { color: 'red' } },
    LEDS: { cat: 'dout', name: 'LED 막대', desc: 'n 비트 표시 (위쪽이 MSB)', def: { n: 8 } },
    HEX: { cat: 'dout', name: '16진 표시기', desc: '4 비트 → 0~F 숫자' },
    SEG: { cat: 'dout', name: '7세그먼트', desc: 'a~g 세그먼트 직접 구동 (ca=1 공통 애노드)', def: { ca: 0, dp: 0 } },
    NOT: { cat: 'gate', name: 'NOT (인버터)', def: { d: '10n' } },
    BUF: { cat: 'gate', name: '버퍼', def: { d: '10n' } },
    AND: { cat: 'gate', name: 'AND', def: { n: 2, d: '10n' } },
    OR: { cat: 'gate', name: 'OR', def: { n: 2, d: '10n' } },
    NAND: { cat: 'gate', name: 'NAND', def: { n: 2, d: '10n', oc: 0 } },
    NOR: { cat: 'gate', name: 'NOR', def: { n: 2, d: '10n' } },
    XOR: { cat: 'gate', name: 'XOR', def: { n: 2, d: '10n' } },
    XNOR: { cat: 'gate', name: 'XNOR', def: { n: 2, d: '10n' } },
    TBUF: { cat: 'gate', name: '3상태 버퍼', desc: 'EN=1 이면 통과, 0 이면 Z', def: { inv: 0, d: '10n' } },
    HA: { cat: 'comb', name: '반가산기' },
    FA: { cat: 'comb', name: '전가산기' },
    ADD: { cat: 'comb', name: 'n 비트 가산기', def: { n: 4 } },
    CMP: { cat: 'comb', name: '크기 비교기', def: { n: 4 } },
    ALU: { cat: 'comb', name: 'ALU', desc: 'S2 S1 S0: 000 A+B · 001 A−B · 010 AND · 011 OR · 100 XOR · 101 NOT A · 110 A+1 · 111 A−1', def: { n: 4 } },
    MUX: { cat: 'comb', name: '멀티플렉서', def: { sel: 1, en: 0 } },
    DEMUX: { cat: 'comb', name: '디멀티플렉서', def: { sel: 1 } },
    DEC: { cat: 'comb', name: '디코더', def: { bits: 2, en: 0, al: 0 } },
    ENC: { cat: 'comb', name: '우선순위 인코더', def: { bits: 2 } },
    BCD7: { cat: 'comb', name: 'BCD → 7세그 디코더', def: { ca: 0, hex: 0 } },
    SRL: { cat: 'seq', name: 'SR 래치', def: { nand: 0 } },
    DL: { cat: 'seq', name: 'D 래치', def: { q0: 0 } },
    DFF: { cat: 'seq', name: 'D 플립플롭', def: { neg: 0, pre: 0, clr: 0, q0: 0 } },
    JKFF: { cat: 'seq', name: 'JK 플립플롭', def: { neg: 0, pre: 0, clr: 0, q0: 0 } },
    TFF: { cat: 'seq', name: 'T 플립플롭', def: { neg: 0, pre: 0, clr: 0, q0: 0 } },
    SRFF: { cat: 'seq', name: 'SR 플립플롭 (클럭)', def: { neg: 0, q0: 0 } },
    REG: { cat: 'reg', name: '레지스터', def: { n: 4, ld: 1, clr: 0, val: 0 } },
    SHR: { cat: 'reg', name: '시프트 레지스터', def: { n: 4, clr: 0, par: 0, val: 0 } },
    CNT: { cat: 'reg', name: '카운터', def: { n: 4, mod: 0, en: 0, ud: 0, ld: 0, clr: 1, val: 0 } },
    ROM: { cat: 'mem', name: 'ROM', def: { a: 3, d: 4, data: '' } },
    RAM: { cat: 'mem', name: 'RAM', def: { a: 3, d: 4, data: '' } },
    ADC: { cat: 'mix', name: 'A/D 변환기', desc: 'VIN 전압 → n 비트 (VIN 이 비어 있으면 vin 값)', def: { n: 4, vref: 5, vin: 2.5 } },
    DAC: { cat: 'mix', name: 'D/A 변환기', desc: 'n 비트 → OUT 단자 아날로그 전압', def: { n: 4, vref: 5 } },
    CMPR: { cat: 'mix', name: '비교기', desc: 'V+ > V− 이면 1 (아날로그 입력 → 논리 출력)', def: { hys: 0, oc: 0 } },
    T555: { cat: 'mix', name: '555 타이머', desc: '비안정 · 단안정 멀티바이브레이터 (TRIG < ⅓VCC → 1, THR > ⅔VCC → 0)', def: {} }
  };
  Object.keys(TYPES).forEach((k) => { TYPES[k].kind = 'p'; TYPES[k].dom = 'd'; });
  const NAME_PREFIX = { SW: 'SW', BTN: 'BTN', CLK: 'CLK', DIP: 'DIP', ADC: 'ADC', DLED: 'LED', LEDS: 'LB', HEX: 'HEX', SEG: 'DSP', DAC: 'DAC',
    HA: 'HA', FA: 'FA', ADD: 'ADD', CMP: 'CMP', ALU: 'ALU', MUX: 'MUX', DEMUX: 'DMX', DEC: 'DEC', ENC: 'ENC', BCD7: 'DEC',
    SRL: 'L', DL: 'L', DFF: 'FF', JKFF: 'FF', TFF: 'FF', SRFF: 'FF', REG: 'REG', SHR: 'SR', CNT: 'CTR', ROM: 'ROM', RAM: 'RAM', TBUF: 'TB', PU: 'RP', PD: 'RD',
    CMPR: 'CP', T555: 'IC', HI: 'VCC', LO: 'GND' };
  GATE_TYPES.forEach((g) => { NAME_PREFIX[g] = 'G'; });

  // ================================================================== 부품 동작
  function edge(c, clkVal, neg) {
    const prev = c.s.clk;
    c.s.clk = clkVal;
    if (prev === undefined || c.init) return false;
    return neg ? (prev === L1 && clkVal === L0) : (prev === L0 && clkVal === L1);
  }
  const qOut = (q) => [q, NOT(q)];
  function num(inV, from, n) { return toNum(inV.slice(from, from + n)); }

  const EVAL = {
    NOT: (c, i) => [NOT(i[0])],
    BUF: (c, i) => [lv(i[0])],
    AND: (c, i) => [AND(i)],
    OR: (c, i) => [OR(i)],
    NAND: (c, i) => [NOT(AND(i))],
    NOR: (c, i) => [NOT(OR(i))],
    XOR: (c, i) => [XOR(i)],
    XNOR: (c, i) => [NOT(XOR(i))],
    TBUF: (c, i) => {
      let en = lv(i[1]);
      if (c.inv) en = NOT(en);
      return [en === L1 ? lv(i[0]) : en === L0 ? LZ : LX];
    },
    SW: (c) => [c.s.on ? L1 : L0],
    BTN: (c) => [(c.s.down ? 1 : 0) ^ (c.inv ? 1 : 0)],
    CLK: (c) => [c.s.v],
    HI: () => [L1],
    LO: () => [L0],
    PU: () => [L1],
    PD: () => [L0],
    DIP: (c) => fromNum(c.s.val, c.n),
    ADC: (c) => {
      const vin = c.aconn && c.aconn('VIN') ? c.va('VIN') : c.s.vin;
      c.s.vnow = vin;
      const full = Math.pow(2, c.n);
      const code = Math.max(0, Math.min(full - 1, Math.floor(vin / c.vref * full + 1e-9)));
      c.s.code = code;
      return fromNum(code, c.n);
    },
    DAC: (c, i) => {
      const v = toNum(i.slice(0, c.n).map(lv));
      c.s.code = v;
      c.aoutV = [v == null ? c.vref / 2 : c.vref * v / Math.pow(2, c.n)];
      return [L0];
    },
    CMPR: (c) => {
      const d = c.va('IN+') - c.va('IN-');
      const h = Math.abs(parseNum(c.P.hys) || 0) / 2;
      if (d > h) c.s.q = L1; else if (d < -h) c.s.q = L0;
      else if (c.s.q == null) c.s.q = d > 0 ? L1 : L0;
      return [c.s.q];
    },
    T555: (c) => {
      const g = c.va('GND');
      const vcc = c.va('VCC') - g;
      const vth = c.va('CV') - g;                 // CV 단자: 내부 분압 5k-5k-5k (⅔VCC, 3.3 kΩ) — 밖에서 바꿀 수 있다
      const vtr = vth / 2;
      const rst = c.aconn('RST') ? c.va('RST') - g : vcc;
      const trig = c.va('TRIG') - g, thr = c.va('THR') - g;
      if (vcc < 1 || rst < 0.7) c.s.q = L0;
      else if (trig < vtr) c.s.q = L1;
      else if (thr > vth) c.s.q = L0;
      else if (c.s.q == null) c.s.q = L0;
      c.s.vcc = vcc;
      c.aoutV = c.outPins.map((p) => (p.n === 'CV' ? g + Math.max(0, vcc) * 2 / 3 : 0));
      return c.outPins.map((p) => (p.n === 'OUT' ? c.s.q : p.n === 'DIS' ? (c.s.q === L1 ? LZ : L0) : L0));
    },
    HA: (c, i) => [XOR([i[0], i[1]]), AND([i[0], i[1]])],
    FA: (c, i) => [XOR(i), OR([AND([i[0], i[1]]), AND([i[0], i[2]]), AND([i[1], i[2]])])],
    ADD: (c, i) => {
      const n = c.n, a = num(i, 0, n), b = num(i, n, n), ci = lv(i[2 * n]);
      if (a == null || b == null || ci === LX) return allX(n + 1);
      const s = a + b + ci;
      return fromNum(s % (1 << n), n).concat([s >= (1 << n) ? L1 : L0]);
    },
    CMP: (c, i) => {
      const n = c.n, a = num(i, 0, n), b = num(i, n, n);
      if (a == null || b == null) return allX(3);
      return [a > b ? 1 : 0, a === b ? 1 : 0, a < b ? 1 : 0];
    },
    ALU: (c, i) => {
      const n = c.n, M = 1 << n, a = num(i, 0, n), b = num(i, n, n), op = num(i, 2 * n, 3);
      if (a == null || b == null || op == null) return allX(n + 2);
      let r, co = 0;
      switch (op) {
        case 0: r = a + b; co = r >= M ? 1 : 0; break;
        case 1: r = a + ((~b) & (M - 1)) + 1; co = r >= M ? 1 : 0; break;
        case 2: r = a & b; break;
        case 3: r = a | b; break;
        case 4: r = a ^ b; break;
        case 5: r = (~a) & (M - 1); break;
        case 6: r = a + 1; co = r >= M ? 1 : 0; break;
        default: r = a + M - 1; co = a >= 1 ? 1 : 0;
      }
      r = ((r % M) + M) % M;
      c.s.r = r;
      return fromNum(r, n).concat([co, r === 0 ? 1 : 0]);
    },
    MUX: (c, i) => {
      const m = 1 << c.k;
      if (c.en && lv(i[m + c.k]) !== L1) return [lv(i[m + c.k]) === L0 ? L0 : LX];
      const s = num(i, m, c.k);
      if (s == null) return [LX];
      return [lv(i[s])];
    },
    DEMUX: (c, i) => {
      const m = 1 << c.k, s = num(i, 1, c.k);
      if (s == null) return allX(m);
      return range(m, (j) => (j === s ? lv(i[0]) : L0));
    },
    DEC: (c, i) => {
      const m = 1 << c.k, a = num(i, 0, c.k);
      const en = c.en ? lv(i[c.k]) : L1;
      if (a == null || en === LX) return allX(m);
      return range(m, (j) => ((j === a && en === L1) ? 1 : 0) ^ (c.al ? 1 : 0));
    },
    ENC: (c, i) => {
      const m = 1 << c.k;
      for (let j = m - 1; j >= 0; j--) {
        const v = lv(i[j]);
        if (v === LX) return allX(c.k + 1);
        if (v === L1) return fromNum(j, c.k).concat([L1]);
      }
      return fromNum(0, c.k).concat([L0]);
    },
    BCD7: (c, i) => {
      const v = toNum(i.slice(0, 4));
      if (v == null) return allX(7);
      const code = v < 10 || c.hex ? SEG_TABLE[v] : 0;
      return range(7, (j) => ((code >> (6 - j)) & 1) ^ (c.al ? 1 : 0));
    },
    SRL: (c, i) => {
      let s = lv(i[0]), r = lv(i[1]);
      if (c.nandIn) { s = NOT(s); r = NOT(r); }
      if (s === LX || r === LX) { c.s.q = LX; }
      else if (s && r) { c.s.bad = true; return c.nandIn ? [L1, L1] : [L0, L0]; }
      else if (s) c.s.q = L1;
      else if (r) c.s.q = L0;
      else if (c.s.bad) c.s.q = LX;
      c.s.bad = false;
      return qOut(c.s.q);
    },
    DL: (c, i) => {
      const en = lv(i[1]);
      if (en === L1) c.s.q = lv(i[0]); else if (en === LX) c.s.q = LX;
      return qOut(c.s.q);
    },
    DFF: (c, i) => seqFF(c, i, (q, d) => lv(d[0])),
    TFF: (c, i) => seqFF(c, i, (q, d) => { const t = lv(d[0]); return t === L0 ? q : t === L1 ? NOT(q) : LX; }),
    JKFF: (c, i) => seqFF(c, i, (q, d) => {
      const j = lv(d[0]), k = lv(d[1]);
      if (j === LX || k === LX) return LX;
      if (!j && !k) return q;
      if (!j && k) return L0;
      if (j && !k) return L1;
      return NOT(q);
    }),
    SRFF: (c, i) => seqFF(c, i, (q, d) => {
      const s = lv(d[0]), r = lv(d[1]);
      if (s === LX || r === LX || (s && r)) return LX;
      return s ? L1 : r ? L0 : q;
    }),
    REG: (c, i) => {
      const n = c.n;
      let j = n;
      const ld = c.hasLd ? lv(i[j++]) : L1;
      const clk = lv(i[j++]);
      const clr = c.hasClr ? lv(i[j++]) : L0;
      const e = edge(c, clk);
      if (clr === L1) c.s.val = 0;
      else if (e && ld === L1) c.s.val = num(i, 0, n);
      else if (e && ld === LX) c.s.val = null;
      return c.s.val == null ? allX(n) : fromNum(c.s.val, n);
    },
    SHR: (c, i) => {
      const n = c.n;
      let j = 0;
      const si = lv(i[j++]), clk = lv(i[j++]);
      const clr = c.hasClr ? lv(i[j++]) : L0;
      const e = edge(c, clk);
      let q = c.s.q;
      if (clr === L1) q = new Array(n).fill(L0);
      else if (e) {
        const ld = c.par ? lv(i[j]) : L0;
        if (ld === L1) q = i.slice(j + 1, j + 1 + n).map(lv);
        else q = [si].concat(q.slice(0, n - 1));
      }
      c.s.q = q;
      return q.slice();
    },
    CNT: (c, i) => {
      const n = c.n, M = c.mod;
      let j = 0;
      const en = c.hasEn ? lv(i[j++]) : L1;
      const up = c.hasUd ? lv(i[j++]) : L1;
      const ld = c.hasLd ? lv(i[j++]) : L0;
      const clk = lv(i[j++]);
      const clr = c.hasClr ? lv(i[j++]) : L0;
      const e = edge(c, clk);
      if (clr === L1) c.s.val = 0;
      else if (e && c.s.val != null) {
        if (ld === L1) { const d = num(i, j, n); c.s.val = d == null ? null : d % Math.pow(2, n); }
        else if (en === L1 && up !== LX) c.s.val = up === L1 ? (c.s.val + 1) % M : (c.s.val + M - 1) % M;
        else if (en === LX) c.s.val = null;
      }
      const v = c.s.val;
      if (v == null) return allX(n + 1);
      const tc = en === L1 && ((up === L1 && v === M - 1) || (up === L0 && v === 0)) ? L1 : L0;
      return fromNum(v, n).concat([tc]);
    },
    ROM: (c, i) => {
      const a = num(i, 0, c.a);
      if (a == null) return allX(c.d);
      return fromNum(c.s.mem[a] || 0, c.d);
    },
    RAM: (c, i) => {
      const Aw = c.a, D = c.d;
      const a = num(i, 0, Aw);
      const we = lv(i[Aw + D]), clk = lv(i[Aw + D + 1]);
      const e = edge(c, clk);
      if (e && we === L1 && a != null) {
        const d = num(i, Aw, D);
        c.s.mem[a] = d == null ? 0 : d;
        c.s.last = a;
      }
      if (a == null) return allX(D);
      return fromNum(c.s.mem[a] || 0, D);
    }
  };

  function seqFF(c, i, next) {
    const nd = c.nData;
    const clk = lv(i[1]);
    let j = nd + 1;
    const pre = c.hasPre ? lv(i[j++]) : L1;
    const clr = c.hasClr ? lv(i[j++]) : L1;
    const e = edge(c, clk, c.neg);
    if (pre === L0 && clr === L0) return [L1, L1];
    if (pre === L0) c.s.q = L1;
    else if (clr === L0) c.s.q = L0;
    else if (e) c.s.q = next(c.s.q, nd === 2 ? [i[0], i[2]] : [i[0]]);
    return qOut(c.s.q);
  }

  function parseData(s) {
    return String(s || '').split(/[\s,;]+/).filter(Boolean).map((x) => { const v = /^[0-9a-f]+$/i.test(x) ? parseInt(x, 16) : parseNum(x); return isFinite(v) ? v : 0; });
  }

  // ================================================================== 코어
  const DEFAULT_DELAY = { gate: 10e-9, box: 20e-9, seq: 15e-9, mix: 100e-9 };
  const SEQ = ['SRL', 'DL', 'DFF', 'TFF', 'JKFF', 'SRFF', 'REG', 'SHR', 'CNT', 'RAM'];
  const SOURCES = ['SW', 'BTN', 'CLK', 'HI', 'LO', 'PU', 'PD', 'DIP', 'ADC'];
  const MIXED = ['CMPR', 'T555', 'ADC', 'DAC'];

  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    peek() { return this.a[0]; }
    push(e) {
      const a = this.a; a.push(e);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (less(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    }
    pop() {
      const a = this.a; const top = a[0]; const last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
      }
      return top;
    }
  }
  const less = (x, y) => x.t < y.t || (x.t === y.t && x.id < y.id);

  /**
   * @param comps 부품 {el, type, P, name, pins, ins, inPins, outs, outPins, apins:{이름: 넷}}
   * @param nets  넷 {id, v, drv, rd, hist, names, analog, av}
   */
  class DigitalCore {
    constructor(comps, nets, opts = {}) {
      this.comps = comps;
      this.nets = nets;
      this.histMax = opts.histMax || 4000;
      this.afterBatch = null;
      this.onAout = null;
      comps.forEach((c) => this.prep(c));
      this.hasClock = comps.some((c) => c.type === 'CLK');
      this.hasSeq = comps.some((c) => SEQ.indexOf(c.type) >= 0);
      this.anaReaders = comps.filter((c) => c.apins && Object.keys(c.apins).length);
      this.t = 0;
      this.heap = new Heap();
      this.dirty = new Set();
    }

    prep(c) {
      const P = c.P, t = c.type;
      c.n = int(P.n, t === 'LEDS' ? 8 : 4, 1, 16);
      c.k = int(t === 'DEC' || t === 'ENC' ? (P.bits != null ? P.bits : 2) : P.sel, t === 'DEC' || t === 'ENC' ? 2 : 1, 1, 4);
      c.en = on(P.en); c.al = on(P.al) || (t === 'BCD7' && on(P.ca)); c.hex = on(P.hex);
      c.inv = on(P.inv); c.neg = on(P.neg); c.nandIn = on(P.nand); c.oc = on(P.oc);
      c.hasPre = on(P.pre); c.hasClr = t === 'CNT' ? (P.clr == null || on(P.clr)) : on(P.clr);
      c.hasEn = on(P.en); c.hasUd = on(P.ud); c.hasLd = t === 'REG' ? (P.ld == null || on(P.ld)) : on(P.ld); c.par = on(P.par);
      c.nData = t === 'JKFF' || t === 'SRFF' ? 2 : 1;
      c.mod = Math.min(Math.pow(2, c.n), parseNum(P.mod) > 1 ? parseNum(P.mod) : Math.pow(2, c.n));
      c.a = int(P.a, 3, 1, 6); c.d = int(P.d, 4, 1, 8);
      c.vref = parseNum(P.vref) || 5;
      const kind = GATE_TYPES.indexOf(t) >= 0 || t === 'TBUF' ? 'gate' : SEQ.indexOf(t) >= 0 ? 'seq' : MIXED.indexOf(t) >= 0 ? 'mix' : 'box';
      const d = parseNum(P.d != null && !(t === 'ROM' || t === 'RAM') ? P.d : NaN);
      c.delay = (isFinite(d) && d > 0 ? d : DEFAULT_DELAY[kind]) * (1 + 0.013 * ((c.idx * 7) % 5));
      c.fn = EVAL[t];
      c.source = SOURCES.indexOf(t) >= 0;
      c.hasAout = c.outPins.some((p) => p.dir === 'aout');
    }

    initState(c) {
      const P = c.P;
      c.s = {};
      c.ov = c.outs.map(() => L0);
      c.pend = c.outs.map(() => null);
      c.aoutV = null;
      switch (c.type) {
        case 'SW': c.s.on = on(P.on); break;
        case 'BTN': c.s.down = false; break;
        case 'CLK': c.s.v = L0; c.f = parseNum(P.freq) > 0 ? parseNum(P.freq) : 1; c.duty = Math.max(0.05, Math.min(0.95, parseNum(P.duty) || 0.5)); c.running = P.run == null || on(P.run); break;
        case 'DIP': c.s.val = (parseNum(P.val) || 0) % Math.pow(2, c.n); break;
        case 'ADC': c.s.vin = parseNum(P.vin); if (!isFinite(c.s.vin)) c.s.vin = c.vref / 2; break;
        case 'DL': case 'DFF': case 'TFF': case 'JKFF': case 'SRFF': case 'SRL': c.s.q = on(P.q0) ? L1 : L0; break;
        case 'REG': case 'CNT': c.s.val = (parseNum(P.val) || 0) % (c.type === 'CNT' ? c.mod : Math.pow(2, c.n)); break;
        case 'SHR': c.s.q = fromNum(parseNum(P.val) || 0, c.n).reverse(); break;
        case 'ROM': case 'RAM': c.s.mem = parseData(P.data); break;
      }
    }

    // ---------------------------------------------------------------- 처음 상태
    resetStart() {
      this.t = 0;
      this.seq = 0;
      this.heap = new Heap();
      this.dirty = new Set();
      this.conflict = false;
      this.overload = false;
      this.events = 0;
      this.edges = 0;
      this.nets.forEach((n) => { n.hist = []; n.toggles = 0; n.v = n.analog ? n.av : LZ; });
      this.comps.forEach((c) => this.initState(c));
      this.nets.forEach((n) => { if (!n.analog) n.v = this.resolve(n); });
      this.comps.forEach((c) => { c.init = true; });
    }
    /** 부품을 차례로 평가하며 바로 반영 (Gauss-Seidel) — 래치가 한쪽 상태로 자리 잡는다 */
    relax() {
      for (let pass = 0; pass < 80; pass++) {
        let changed = false;
        for (const c of this.comps) {
          if (!c.fn) continue;
          const out = c.fn(c, this.inputs(c));
          for (let k = 0; k < c.outs.length; k++) {
            const v = this.drive(c, out[k]);
            if (c.ov[k] !== v) {
              c.ov[k] = v; changed = true;
              const n = this.nets[c.outs[k]];
              if (n.analog) this.bridgeDirty = true; else n.v = this.resolve(n);
            }
          }
        }
        if (!changed) break;
      }
    }
    resetFinish() {
      this.comps.forEach((c) => { c.init = false; });
      this.nets.forEach((n) => { n.hist = [[0, n.v]]; });
      this.comps.forEach((c) => { if (c.fn && c.outs.length) this.evaluate(c); });
      this.comps.filter((c) => c.type === 'CLK').forEach((c) => this.scheduleTick(c, this.t + (1 - c.duty) / c.f));
    }

    inputs(c) {
      return c.ins.map((n, k) => {
        const net = this.nets[n];
        const v = net.v;
        if (v === LZ && c.inPins[k].def != null && !net.analog && net.drv.length === 0) return c.inPins[k].def;
        return v;
      });
    }
    drive(c, v) {
      if (c.oc && v === L1) return LZ;
      return v;
    }
    resolve(n) {
      if (n.analog) return n.av;
      let strong = -1, weak = -1, conflict = false, weakX = false;
      for (const [c, k, isWeak] of n.drv) {
        const v = c.ov[k];
        if (v === LZ || v === undefined) continue;
        if (isWeak) { if (weak >= 0 && weak !== v) weakX = true; weak = v; continue; }
        if (strong >= 0 && strong !== v) conflict = true;
        strong = v;
      }
      if (conflict) { n.conflict = true; this.conflict = true; return LX; }
      n.conflict = false;
      if (strong >= 0) return strong;
      if (weak >= 0) return weakX ? LX : weak;
      return LZ;
    }

    schedule(c, k, v, t) {
      const e = { t, c, k, v, id: ++this.seq };
      c.pend[k] = e;
      this.heap.push(e);
    }
    scheduleTick(c, t) {
      const e = { t, c, k: -1, v: 0, id: ++this.seq, tick: true };
      c.tickEv = e;
      this.heap.push(e);
    }

    evaluate(c) {
      if (!c.fn) return;
      const prevA = c.aoutV;
      const out = c.fn(c, this.inputs(c));
      for (let k = 0; k < c.outs.length; k++) {
        const v = this.drive(c, out[k]);
        const p = c.pend[k];
        const target = p ? p.v : c.ov[k];
        if (v === target) continue;
        if (p) c.pend[k] = null;
        if (v !== c.ov[k]) this.schedule(c, k, v, this.t + (c.source ? 0 : c.delay));
      }
      if (c.hasAout && String(prevA) !== String(c.aoutV)) { this.bridgeDirty = true; if (this.onAout) this.onAout(c); }
    }

    setOut(c, k, v) {
      if (c.ov[k] === v) return;
      c.ov[k] = v;
      const n = this.nets[c.outs[k]];
      if (n.analog) { this.bridgeDirty = true; return; }
      const nv = this.resolve(n);
      if (nv === n.v) return;
      this.setNet(n, nv);
    }
    setNet(n, nv) {
      n.v = nv;
      n.toggles++;
      const h = n.hist;
      h.push([this.t, nv]);
      if (h.length > this.histMax) h.splice(0, h.length - this.histMax * 0.75);
      for (const r of n.rd) this.dirty.add(r);
      if (n.watch) n.watch.forEach((f) => f(n));
    }
    /** 아날로그 넷의 논리값이 바뀜 (문턱값을 넘었다) */
    setAnalogLogic(n, v) {
      if (n.av === v && n.v === v) return false;
      n.av = v;
      if (n.v === v) return false;
      this.setNet(n, v);
      return true;
    }

    runBatchHook() {
      if (!this.afterBatch) return;
      for (let k = 0; k < 40; k++) {
        if (!this.afterBatch()) break;
        if (!this.dirty.size) break;
        this.flush();
      }
    }

    /** 시뮬레이션 시간 tEnd 까지 진행. 사건이 너무 많으면(빠른 발진) 중간에 멈춘다 */
    runUntil(tEnd, budget = 60000) {
      const heap = this.heap;
      let count = 0;
      this.overload = false;
      this.flush();
      this.runBatchHook();
      while (heap.size && heap.peek().t <= tEnd) {
        const t = heap.peek().t;
        this.t = Math.max(this.t, t);
        while (heap.size && heap.peek().t === t) {
          const e = heap.pop();
          if (e.tick) {
            const c = e.c;
            if (c.tickEv !== e || !c.running) continue;
            c.s.v = c.s.v ? L0 : L1;
            if (c.s.v) this.edges++;
            this.setOut(c, 0, c.s.v);
            this.scheduleTick(c, t + (c.s.v ? c.duty : 1 - c.duty) / c.f);
            continue;
          }
          if (e.c.pend[e.k] !== e) continue;
          e.c.pend[e.k] = null;
          this.setOut(e.c, e.k, e.v);
        }
        this.flush();
        this.runBatchHook();
        count++;
        this.events++;
        if (count > budget) { this.overload = true; return false; }
      }
      this.t = Math.max(this.t, tEnd);
      return true;
    }
    flush() {
      let guard = 0;
      while (this.dirty.size && guard++ < 50) {
        const list = [...this.dirty];
        this.dirty.clear();
        for (const c of list) this.evaluate(c);
      }
    }
    /** 다음 사건 시각 (없으면 Infinity) */
    nextEventT() { return this.heap.size ? this.heap.peek().t : Infinity; }
    /** 클럭을 뺀 사건이 남아 있는가 */
    busy() { return this.dirty.size > 0 || this.heap.a.some((e) => !e.tick && e.c.pend[e.k] === e); }
    /** 조합 회로가 안정될 때까지 */
    settle(maxT = 1e-5) {
      const end = this.t + maxT;
      this.flush();
      this.runBatchHook();
      while (this.heap.size) {
        const pending = this.heap.a.some((e) => !e.tick && e.c.pend[e.k] === e);
        if (!pending && !this.dirty.size) break;
        const next = this.heap.a.filter((e) => !e.tick).reduce((m, e) => Math.min(m, e.t), Infinity);
        if (next > end) break;
        if (!this.runUntil(Math.min(end, next), 200000)) break;
      }
    }

    // ---------------------------------------------------------------- 입력 조작
    poke(c) { this.dirty.add(c); this.runUntil(this.t); }
    toggle(c) {
      if (c.type === 'SW') { c.s.on = !c.s.on; this.poke(c); }
      else if (c.type === 'CLK' && !c.running) { c.s.v = c.s.v ? L0 : L1; if (c.s.v) this.edges++; this.setOut(c, 0, c.s.v); this.runUntil(this.t); }
    }
    press(c, down) { if (c.type === 'BTN') { c.s.down = down; this.poke(c); } }
    setDip(c, val) { c.s.val = ((val % Math.pow(2, c.n)) + Math.pow(2, c.n)) % Math.pow(2, c.n); this.poke(c); }
    setAdc(c, vin) { c.s.vin = vin; this.poke(c); }
    setClockRun(c, run) {
      c.running = run;
      if (run) this.scheduleTick(c, this.t + (c.s.v ? c.duty : 1 - c.duty) / c.f);
    }
    setClockFreq(c, f) {
      c.f = f;
      if (c.running) this.scheduleTick(c, this.t + (c.s.v ? c.duty : 1 - c.duty) / c.f);
    }

    // ---------------------------------------------------------------- 값 읽기
    netValue(n) { return n == null || n < 0 || !this.nets[n] ? LZ : this.nets[n].v; }
    pinValue(c, name) {
      const pn = c.pins.find((q) => q.n === name || q.n === '~' + name || q.lbl === name);
      return pn ? this.netValue(pn.net) : undefined;
    }
    compValue(c) {
      const bits = (nets) => toNum(nets.map((n) => this.netValue(n)));
      switch (c.type) {
        case 'SW': case 'BTN': case 'CLK': case 'HI': case 'LO': return this.netValue(c.outs[0]);
        case 'DLED': return this.netValue(c.ins[0]);
        case 'DIP': return c.s.val;
        case 'ADC': return c.s.code;
        case 'DAC': return c.s.code == null ? null : c.s.code;
        case 'LEDS': case 'HEX': return bits(c.ins);
        case 'SEG': {
          const v = c.ins.slice(0, 7).map((n) => this.netValue(n));
          if (v.some((b) => b > 1)) return null;
          const code = v.reduce((a, b) => a * 2 + ((on(c.P.ca) ? 1 - b : b)), 0);
          const d = SEG_TABLE.indexOf(code);
          return d >= 0 ? d : (code === 0 ? ' ' : '?');
        }
        case 'REG': case 'CNT': return c.s.val;
        case 'SHR': return toNum(c.s.q.slice().reverse());
        case 'DL': case 'DFF': case 'TFF': case 'JKFF': case 'SRFF': case 'SRL': case 'CMPR': return this.netValue(c.outs[0]);
        case 'T555': return c.s.q;
      }
      if (c.outs.length === 1) return this.netValue(c.outs[0]);
      return bits(c.outs);
    }
  }

  const CS_D = {
    L0, L1, LX, LZ, VCH, TYPES, GATE_TYPES, SEG_TABLE, PIN_DEFAULT, NAME_PREFIX, SEQ, SOURCES, MIXED, EVAL,
    toNum, fromNum, on, int, localLayout, pinsOf, boundsOf, bodyOf, xf, DigitalCore,
    isSeq: (t) => SEQ.indexOf(t) >= 0
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CS_D;
  root.CS_D = CS_D;
})(typeof window !== 'undefined' ? window : globalThis);
