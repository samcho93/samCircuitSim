/* 아날로그 해석 코어 (브라우저 · Node 공용)
 *  - 수정 마디 해석(MNA) + 부분 피벗 LU + 과도 해석(사다리꼴 / 후진 오일러) + 비선형 소자 뉴턴-랩슨
 *  - 소자 모델: 저항 · 가변저항 · 콘덴서 · 코일 · 변압기 · 전원 · 스위치 · 퓨즈 · 다이오드 · 제너 · LED · 전구 ·
 *               BJT · MOSFET · JFET · 연산증폭기 · 아날로그 스위치 · 릴레이
 *  - 디지털 부품의 출력은 '브리지'(노턴 등가: 컨덕턴스 g + 목표 전압)로 들어온다 (mixed.js 가 관리)
 *  연결(마디 번호 매기기)은 mixed.js 가 하고, 여기서는 마디 번호가 붙은 소자 목록을 받아 푼다.
 */
(function (root) {
  'use strict';

  const VT = 0.025852;          // 열전압 (27°C)
  const GMIN = 1e-12;

  // ================================================================= 숫자 (SI 접두어)
  const PREFIX = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

  /** "4.7k", "10u", "1meg", "2k2", "100mA", "0x1F" → 숫자 */
  function parseNum(s, def) {
    if (typeof s === 'number') return s;
    if (s == null) return def;
    let t = String(s).trim();
    if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16);
    if (/^0b[01]+$/i.test(t)) return parseInt(t.slice(2), 2);
    t = t.replace(/Ω|ohm|[VAFHWΩ]$|Hz$|s$/g, '');
    if (!t) return def;
    const m = /^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(meg|[fpnuµμmkKMG])?$/i.exec(t);
    if (!m) {
      const m2 = /^(\d+)([kKMRmunp])(\d+)$/.exec(t);      // 2k2 = 2.2k
      if (m2) {
        const mult = m2[2] === 'R' ? 1 : PREFIX[m2[2]];
        return parseFloat(m2[1] + '.' + m2[3]) * mult;
      }
      const v = parseFloat(t);
      return isNaN(v) ? def : v;
    }
    let v = parseFloat(m[1]);
    if (m[2]) {
      const p = m[2];
      v *= /^meg$/i.test(p) ? 1e6 : (PREFIX[p] != null ? PREFIX[p] : PREFIX[p.toLowerCase()] || 1);
    }
    return v;
  }

  /** 숫자 → "4.7k" 같은 짧은 표기 (단위 기호 없이) */
  function siText(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return '0';
    const units = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
    for (const [m, p] of units) {
      if (a >= m * 0.9995) {
        const x = v / m;
        const d = digits != null ? digits : 3;
        let s = Math.abs(x) >= 100 ? x.toFixed(Math.max(0, d - 3)) : Math.abs(x) >= 10 ? x.toFixed(Math.max(0, d - 2)) : x.toFixed(Math.max(0, d - 1));
        if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
        return s + p;
      }
    }
    return v.toExponential(2);
  }

  /** 측정값 표시: 3자리 유효숫자 + 단위 */
  function fmt(v, unit, digits) {
    if (v == null || !isFinite(v)) return '—';
    if (Math.abs(v) < 1e-13) v = 0;
    const d = digits || 3;
    const a = Math.abs(v);
    if (a === 0) return '0 ' + unit;
    const units = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    for (const [m, p] of units) {
      if (a >= m * 0.99995) {
        const x = v / m;
        const ax = Math.abs(x);
        const s = ax >= 100 ? x.toFixed(Math.max(0, d - 3)) : ax >= 10 ? x.toFixed(Math.max(0, d - 2)) : x.toFixed(Math.max(0, d - 1));
        return s + ' ' + p + unit;
      }
    }
    return v.toExponential(2) + ' ' + unit;
  }

  // ================================================================= 아날로그 소자 정의
  /* kind: '2' = 두 점(x1,y1)-(x2,y2) 로 놓는 2단자,  'p' = 한 점 + 회전/반전,  '1' = 한 점
   * dpins: 디지털 입력 단자 번호 (그 넷을 아날로그로 만들지 않는다) */
  const TYPES = {
    W: { kind: '2', name: '도선', cat: 'basic' },
    G: { kind: '1', name: '접지', cat: 'basic' },
    R: { kind: '2', name: '저항', args: ['r'], def: { r: 1000 } },
    POT: { kind: '2', name: '가변저항', args: ['r'], def: { r: 10000, pos: 0.5 }, three: true },
    C: { kind: '2', name: '콘덴서', args: ['c'], def: { c: 1e-6 } },
    L: { kind: '2', name: '코일', args: ['l'], def: { l: 1e-3 } },
    V: { kind: '2', name: '직류 전원', args: ['v'], def: { v: 5 } },
    AC: { kind: '2', name: '교류 · 함수 발생기', args: ['amp', 'freq'], def: { amp: 5, freq: 1000, phase: 0, dc: 0, wave: 'sine', duty: 0.5 } },
    I: { kind: '2', name: '전류원', args: ['i'], def: { i: 1e-3 } },
    S: { kind: '2', name: '스위치', def: { on: 0 } },
    PB: { kind: '2', name: '푸시 버튼', def: { on: 0 } },
    FUSE: { kind: '2', name: '퓨즈', args: ['a'], def: { a: 1 } },
    SPDT: { kind: '2', name: '전환 스위치', def: { pos: 0 }, three: true },
    D: { kind: '2', name: '다이오드', def: { model: '1n4148' } },
    Z: { kind: '2', name: '제너 다이오드', args: ['vz'], def: { vz: 5.1 } },
    LED: { kind: '2', name: 'LED', def: { color: 'red' } },
    LAMP: { kind: '2', name: '전구', args: ['v', 'w'], def: { v: 12, w: 1 } },
    AM: { kind: '2', name: '전류계' },
    VM: { kind: '2', name: '전압계' },
    Q: { kind: 'p', name: '트랜지스터(BJT)', def: { pnp: 0, beta: 100, is: 1e-14, va: 100, br: 1 } },
    M: { kind: 'p', name: 'MOSFET', def: { p: 0, vt: 2, k: 0.2, lambda: 0.01 } },
    J: { kind: 'p', name: 'JFET', def: { p: 0, idss: 0.01, vp: -2, lambda: 0.01 } },
    OA: { kind: 'p', name: '연산증폭기', def: { gain: 1e5, vp: 15, vn: -15, drop: 1, gbw: 1e6 } },
    X: { kind: 'p', name: '변압기', def: { n: 0.1, l: 10, k: 0.999 } },
    ASW: { kind: 'p', name: '아날로그 스위치', def: { ron: 50, inv: 0 }, dpins: [2] },
    RLY: { kind: 'p', name: '릴레이', def: { r: 100, ion: 0.02 } }
  };
  Object.keys(TYPES).forEach((k) => { TYPES[k].dom = 'a'; });

  /* 다이오드 모델 */
  const DIODE_MODELS = {
    '1n4148': { is: 2.52e-9, n: 1.752 },
    '1n4001': { is: 14.1e-9, n: 1.984 },
    schottky: { is: 3e-7, n: 1.05 },
    ideal: { is: 1e-14, n: 1 },
    ge: { is: 2e-7, n: 1.1 }
  };
  const LED_VF = { red: 1.8, orange: 2.0, yellow: 2.05, green: 2.15, blue: 3.0, white: 3.1 };
  const LED_RGB = { red: '#ff3b30', orange: '#ff9500', yellow: '#ffd60a', green: '#30d158', blue: '#0a84ff', white: '#f5f5f7' };

  // ================================================================= 기하 (핀 위치)
  /** 한 점 소자의 지역 좌표 → 전체 좌표 (rot: 시계 방향 90° 단위, f: 상하 반전) */
  function xf(el, lx, ly) {
    const f = +(el.params.f || 0), r = ((+(el.params.rot || 0)) % 4 + 4) % 4;
    if (f) ly = -ly;
    let x = lx, y = ly;
    for (let i = 0; i < r; i++) { const t = x; x = -y; y = t; }
    return [el.x + x, el.y + y];
  }
  /** 2단자 소자의 수직 방향 단위 벡터 (가변저항 와이퍼, 전환 스위치 두 번째 접점) */
  function perp(el) {
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  }
  /** 아날로그 소자의 핀 좌표 목록 (격자 단위) */
  function pins(el) {
    switch (el.type) {
      case 'G': return [[el.x, el.y]];
      case 'POT': {
        const [px, py] = perp(el);
        const mx = (el.x1 + el.x2) / 2, my = (el.y1 + el.y2) / 2;
        return [[el.x1, el.y1], [el.x2, el.y2], [Math.round(mx + px * 2), Math.round(my + py * 2)]];
      }
      case 'SPDT': {
        const [px, py] = perp(el);
        return [[el.x1, el.y1], [el.x2, el.y2], [Math.round(el.x2 + px * 2), Math.round(el.y2 + py * 2)]];
      }
      case 'Q': case 'M': case 'J':
        return [xf(el, 0, 0), xf(el, 2, -2), xf(el, 2, 2)];          // B/G, C/D, E/S
      case 'OA':
        return [xf(el, 0, -1), xf(el, 0, 1), xf(el, 4, 0)];          // −, +, 출력
      case 'X':
        return [xf(el, 0, 0), xf(el, 0, 4), xf(el, 4, 0), xf(el, 4, 4)]; // P1, P2, S1, S2
      case 'ASW':
        return [xf(el, 0, 0), xf(el, 4, 0), xf(el, 2, -2)];          // A, B, 제어
      case 'RLY':
        return [xf(el, 0, 0), xf(el, 0, 4), xf(el, 4, 4), xf(el, 5, 0), xf(el, 3, 0)];   // 코일1, 코일2, COM, NO, NC
      default:
        return [[el.x1, el.y1], [el.x2, el.y2]];
    }
  }
  const PIN_NAMES = {
    Q: ['B', 'C', 'E'], M: ['G', 'D', 'S'], J: ['G', 'D', 'S'], OA: ['−', '+', '출력'], X: ['1차 ●', '1차', '2차 ●', '2차'],
    POT: ['A', 'B', '와이퍼'], SPDT: ['공통', '접점 0', '접점 1'], D: ['A', 'K'], LED: ['A', 'K'], Z: ['A', 'K'], V: ['−', '+'], AC: ['−', '+'],
    ASW: ['A', 'B', 'CTL'], RLY: ['코일 1', '코일 2', 'COM', 'NO', 'NC']
  };

  // ================================================================= 선형대수
  /** 부분 피벗 LU 분해 (제자리). 실패하면 false */
  function luFactor(A, n, perm) {
    for (let i = 0; i < n; i++) perm[i] = i;
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > max) { max = v; p = i; } }
      if (max < 1e-300) return false;
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = perm[k]; perm[k] = perm[p]; perm[p] = t;
      }
      const piv = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = (A[i * n + k] /= piv);
        if (f === 0) continue;
        const ri = i * n, rk = k * n;
        for (let j = k + 1; j < n; j++) A[ri + j] -= f * A[rk + j];
      }
    }
    return true;
  }
  function luSolve(A, n, perm, b, x) {
    for (let i = 0; i < n; i++) {
      let s = b[perm[i]];
      const ri = i * n;
      for (let j = 0; j < i; j++) s -= A[ri + j] * x[j];
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      const ri = i * n;
      for (let j = i + 1; j < n; j++) s -= A[ri + j] * x[j];
      x[i] = s / A[ri + i];
    }
  }

  // ================================================================= 파형
  function waveValue(p, t) {
    const f = +p.freq || 0, amp = +p.amp || 0, dc = +p.dc || 0;
    const ph = (+p.phase || 0) * Math.PI / 180;
    const w = String(p.wave || 'sine');
    if (w === 'dc' || f === 0) return dc + amp;
    const x = t * f + ph / (2 * Math.PI);
    const fr = x - Math.floor(x);
    switch (w) {
      case 'square': return dc + (fr < (+p.duty || 0.5) ? amp : -amp);
      case 'pulse': return dc + (fr < (+p.duty || 0.5) ? amp : 0);
      case 'tri': return dc + amp * (fr < 0.25 ? 4 * fr : fr < 0.75 ? 2 - 4 * fr : 4 * fr - 4);
      case 'saw': return dc + amp * (2 * fr - 1);
      default: return dc + amp * Math.sin(2 * Math.PI * f * t + ph);
    }
  }

  // ================================================================= pn 접합 (SPICE pnjlim)
  let LIMITED = false;
  function pnjlim(vnew, vold, nvt, vcrit) {
    const v0 = vnew;
    vnew = pnjlim0(vnew, vold, nvt, vcrit);
    if (Math.abs(vnew - v0) > 1e-9) LIMITED = true;
    return vnew;
  }
  function pnjlim0(vnew, vold, nvt, vcrit) {
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
      if (vold > 0) {
        const arg = 1 + (vnew - vold) / nvt;
        vnew = arg > 0 ? vold + nvt * Math.log(arg) : vcrit;
      } else {
        vnew = nvt * Math.log(Math.max(vnew / nvt, 1e-30));
      }
    }
    return vnew;
  }
  function junction(v, is, nvt) {
    const k = Math.max(40, Math.log(1 / is));
    const vmax = nvt * k;
    if (v > vmax) {
      const e = Math.exp(k);
      return { i: is * (e * (1 + (v - vmax) / nvt) - 1), g: is * e / nvt };
    }
    const e = Math.exp(v / nvt);
    return { i: is * (e - 1), g: is * e / nvt };
  }

  /* 제너 역방향 항복: 5 mA 에서 정확히 Vz */
  const ZIS = 5e-3, ZVCRIT = VT * Math.log(VT / (Math.SQRT2 * ZIS));
  function zenerRev(v, vz) {
    const u = -v - vz;
    const umax = VT * 12;
    if (u > umax) { const e = Math.exp(12); return { i: ZIS * e * (1 + (u - umax) / VT), g: ZIS * e / VT }; }
    const e = Math.exp(u / VT);
    return { i: ZIS * e, g: ZIS * e / VT };
  }
  const FUSE_R = 0.02;
  function lampR(p) {
    const w = Math.max(1e-6, +p.w || 1), v = +p.v || 12;
    return Math.max(0.01, v * v / w);
  }
  function diodeModel(el) {
    const p = el.params;
    if (el.type === 'LED') {
      const vf = LED_VF[p.color] || (+p.vf) || 1.8;
      const n = 2;
      return { n, is: 0.01 / Math.exp(vf / (n * VT)) };
    }
    const m = DIODE_MODELS[String(p.model || '1n4148').toLowerCase()] || DIODE_MODELS['1n4148'];
    return { is: p.is != null ? +p.is : m.is, n: p.n != null ? +p.n : m.n };
  }
  const NONLINEAR = ['D', 'Z', 'LED', 'Q', 'M', 'J', 'OA'];
  /** 시간에 따라 변하는(상태가 있는) 소자: 이것이 있으면 고정 시간 간격으로 함께 진행해야 한다 */
  const DYNAMIC = ['C', 'L', 'X', 'AC', 'OA', 'FUSE'];

  // ================================================================= 해석 코어
  /**
   * @param els     아날로그 소자 (el._n = 핀별 마디 번호, 0 = 접지)
   * @param nNodes  마디 수 (접지 포함)
   * @param opts    회로 옵션 ($ 줄)
   * @param bridges 디지털 출력 브리지 [{node, g, z, v}] — mixed.js 가 값을 바꾼다
   */
  class AnalogCore {
    constructor(els, nNodes, opts, bridges) {
      this.els = els;
      this.nNodes = nNodes;
      this.opts = opts || {};
      this.bridges = bridges || [];
      this.t = 0;
      this.warn = '';
      let nb = 0;
      els.forEach((el) => {
        el._br = -1;
        switch (el.type) {
          case 'V': case 'AC': case 'AM': case 'L': case 'OA': el._br = nb++; break;
          case 'X': el._br = nb; nb += 2; break;
        }
      });
      this.nBranch = nb;
      this.N = (nNodes - 1) + nb;
      const N = this.N;
      this.A = new Float64Array(N * N);
      this.Abase = new Float64Array(N * N);
      this.b = new Float64Array(N);
      this.bbase = new Float64Array(N);
      this.x = new Float64Array(N);
      this.perm = new Int32Array(N);
      this.nonlinear = els.some((e) => NONLINEAR.includes(e.type));
      this.dynamic = els.some((e) => DYNAMIC.includes(e.type));
      const acs = els.filter((e) => e.type === 'AC');
      this.fmax = acs.reduce((m, e) => Math.max(m, +e.params.freq || 0), 0);
      this.method = this.opts.method === 'be' ? 'be' : 'trap';
      this.dt = 1e-4;
      this.initState();
    }

    initState() {
      this.h = this.dt;
      this.els.forEach((el) => {
        const p = el.params;
        el.st = {};
        if (el.type === 'C') { el.st.v = +p.v0 || 0; el.st.i = 0; }
        if (el.type === 'L') { el.st.i = +p.i0 || 0; el.st.v = 0; }
        if (el.type === 'X') { el.st.i1 = 0; el.st.i2 = 0; el.st.v1 = 0; el.st.v2 = 0; }
        if (el.type === 'OA') el.st.xs = 0;
        if (el.type === 'FUSE') { el.st.blown = false; el.st.heat = 0; }
        if (el.type === 'RLY') el.st.on = false;
        el.lim = {};
      });
      this.x.fill(0);
      this.t = 0;
      this._baseDirty = true;
    }

    nv(n) { return n > 0 ? this.x[n - 1] : 0; }
    brI(k) { return this.x[this.nNodes - 1 + k]; }

    // ---------------------------------------------------------------- 스탬프
    _g(A, N, n1, n2, g) {
      if (n1 > 0) A[(n1 - 1) * N + n1 - 1] += g;
      if (n2 > 0) A[(n2 - 1) * N + n2 - 1] += g;
      if (n1 > 0 && n2 > 0) { A[(n1 - 1) * N + n2 - 1] -= g; A[(n2 - 1) * N + n1 - 1] -= g; }
    }
    _i(b, n1, n2, i) {
      if (n1 > 0) b[n1 - 1] -= i;
      if (n2 > 0) b[n2 - 1] += i;
    }
    _nl(A, b, N, nodes, V, I, J) {
      for (let i = 0; i < nodes.length; i++) {
        const ni = nodes[i];
        if (ni <= 0) continue;
        let rhs = I[i];
        for (let j = 0; j < nodes.length; j++) {
          rhs -= J[i][j] * V[j];
          const nj = nodes[j];
          if (nj > 0) A[(ni - 1) * N + nj - 1] += J[i][j];
        }
        b[ni - 1] -= rhs;
      }
    }

    /** 아날로그 스위치 · 릴레이 접점이 닫혀 있는가 */
    aswOn(el) { const c = el._ctl ? el._ctl() : 0; return (c === 1) !== !!+el.params.inv; }

    stampLinear(dc) {
      const A = this.Abase, b = this.bbase, N = this.N, dt = this.h || this.dt;
      A.fill(0);
      b.fill(0);
      for (let n = 1; n < this.nNodes; n++) A[(n - 1) * N + n - 1] += GMIN;
      const trap = this.method === 'trap';
      this.els.forEach((el) => {
        const p = el.params, n = el._n;
        switch (el.type) {
          case 'R': this._g(A, N, n[0], n[1], 1 / Math.max(1e-6, +p.r || 1e-6)); break;
          case 'LAMP': this._g(A, N, n[0], n[1], 1 / lampR(p)); break;
          case 'POT': {
            const R = Math.max(1, +p.r || 1), pos = Math.min(1, Math.max(0, +p.pos));
            this._g(A, N, n[0], n[2], 1 / Math.max(0.5, R * pos));
            this._g(A, N, n[2], n[1], 1 / Math.max(0.5, R * (1 - pos)));
            break;
          }
          case 'S': case 'PB':
            if (+p.on) this._g(A, N, n[0], n[1], 1 / (+p.ron || 1e-2));
            break;
          case 'FUSE':
            if (!el.st.blown) this._g(A, N, n[0], n[1], 1 / FUSE_R);
            break;
          case 'SPDT':
            this._g(A, N, n[0], +p.pos ? n[2] : n[1], 1 / (+p.ron || 1e-2));
            break;
          case 'ASW':
            this._g(A, N, n[0], n[1], this.aswOn(el) ? 1 / Math.max(1e-3, +p.ron || 50) : 1e-10);
            break;
          case 'RLY':
            this._g(A, N, n[0], n[1], 1 / Math.max(1e-3, +p.r || 100));
            this._g(A, N, n[2], el.st.on ? n[3] : n[4], 1 / 0.05);
            break;
          case 'C':
            if (!dc) this._g(A, N, n[0], n[1], (trap ? 2 : 1) * (+p.c) / dt);
            break;
          case 'L': {
            const r = this.nNodes - 1 + el._br;
            if (n[0] > 0) { A[(n[0] - 1) * N + r] += 1; A[r * N + n[0] - 1] += 1; }
            if (n[1] > 0) { A[(n[1] - 1) * N + r] -= 1; A[r * N + n[1] - 1] -= 1; }
            if (!dc) A[r * N + r] -= (trap ? 2 : 1) * (+p.l) / dt;
            else A[r * N + r] -= 1e-9;
            break;
          }
          case 'X': {
            const L1 = +p.l, L2 = L1 * (+p.n) * (+p.n), M = (+p.k) * Math.sqrt(L1 * L2);
            const r1 = this.nNodes - 1 + el._br, r2 = r1 + 1;
            const s = (trap ? 2 : 1) / dt;
            [[n[0], n[1], r1], [n[2], n[3], r2]].forEach(([a, c, r]) => {
              if (a > 0) { A[(a - 1) * N + r] += 1; A[r * N + a - 1] += 1; }
              if (c > 0) { A[(c - 1) * N + r] -= 1; A[r * N + c - 1] -= 1; }
            });
            if (!dc) {
              A[r1 * N + r1] -= s * L1; A[r1 * N + r2] -= s * M;
              A[r2 * N + r1] -= s * M; A[r2 * N + r2] -= s * L2;
            } else { A[r1 * N + r1] -= 1e-9; A[r2 * N + r2] -= 1e-9; }
            this._g(A, N, n[1], n[3], 1e-9);
            break;
          }
          case 'V': case 'AC': case 'AM': {
            const r = this.nNodes - 1 + el._br;
            if (n[1] > 0) { A[(n[1] - 1) * N + r] += 1; A[r * N + n[1] - 1] += 1; }
            if (n[0] > 0) { A[(n[0] - 1) * N + r] -= 1; A[r * N + n[0] - 1] -= 1; }
            break;
          }
          case 'OA': {
            const r = this.nNodes - 1 + el._br;
            if (n[2] > 0) A[(n[2] - 1) * N + r] += 1;
            break;
          }
          case 'D': case 'Z': case 'LED':
            this._g(A, N, n[0], n[1], GMIN);
            break;
          case 'Q': case 'M': case 'J':
            this._g(A, N, n[0], n[1], GMIN); this._g(A, N, n[0], n[2], GMIN); this._g(A, N, n[1], n[2], GMIN);
            break;
        }
      });
      // 디지털 출력 브리지 (끊김 Z 가 아니면 출력 저항으로 연결)
      for (const br of this.bridges) if (!br.z && br.node > 0) A[(br.node - 1) * N + br.node - 1] += br.g;
    }

    stampRhs(b, t, dc) {
      const trap = this.method === 'trap', dt = this.h || this.dt;
      this.els.forEach((el) => {
        const p = el.params, n = el._n;
        switch (el.type) {
          case 'V': b[this.nNodes - 1 + el._br] += +p.v || 0; break;
          case 'AC': b[this.nNodes - 1 + el._br] += waveValue(p, t); break;
          case 'I': this._i(b, n[0], n[1], +p.i || 0); break;
          case 'C': {
            if (dc) break;
            const geq = (trap ? 2 : 1) * (+p.c) / dt;
            const ieq = trap ? geq * el.st.v + el.st.i : geq * el.st.v;
            this._i(b, n[1], n[0], ieq);
            break;
          }
          case 'L': {
            if (dc) break;
            const req = (trap ? 2 : 1) * (+p.l) / dt;
            b[this.nNodes - 1 + el._br] += trap ? -req * el.st.i - el.st.v : -req * el.st.i;
            break;
          }
          case 'X': {
            if (dc) break;
            const L1 = +p.l, L2 = L1 * (+p.n) * (+p.n), M = (+p.k) * Math.sqrt(L1 * L2);
            const s = (trap ? 2 : 1) / dt, st = el.st;
            const r1 = this.nNodes - 1 + el._br;
            b[r1] += -s * (L1 * st.i1 + M * st.i2) - (trap ? st.v1 : 0);
            b[r1 + 1] += -s * (M * st.i1 + L2 * st.i2) - (trap ? st.v2 : 0);
            break;
          }
        }
      });
      for (const br of this.bridges) if (!br.z && br.node > 0) b[br.node - 1] += br.g * br.v;
    }

    stampNonlinear(A, b, dc) {
      const N = this.N;
      for (const el of this.els) {
        const p = el.params, n = el._n;
        switch (el.type) {
          case 'D': case 'LED': {
            const m = diodeModel(el);
            const nvt = m.n * VT;
            const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * m.is));
            let v = this.nv(n[0]) - this.nv(n[1]);
            v = pnjlim(v, el.lim.v != null ? el.lim.v : 0, nvt, vcrit);
            el.lim.v = v;
            const j = junction(v, m.is, nvt);
            this._nl(A, b, N, [n[0], n[1]], [v, 0], [j.i, -j.i], [[j.g, -j.g], [-j.g, j.g]]);
            break;
          }
          case 'Z': {
            const is = 1e-14, nvt = VT, vz = +p.vz || 5.1;
            const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * is));
            let v = this.nv(n[0]) - this.nv(n[1]);
            const vold = el.lim.v != null ? el.lim.v : 0;
            if (v > 0) v = pnjlim(v, vold, nvt, vcrit);
            else if (v < -vz) v = -pnjlim(-v - vz, -vold - vz, VT, ZVCRIT) - vz;
            el.lim.v = v;
            const jf = junction(v, is, nvt);
            const jr = zenerRev(v, vz);
            const i = jf.i - jr.i, g = jf.g + jr.g;
            this._nl(A, b, N, [n[0], n[1]], [v, 0], [i, -i], [[g, -g], [-g, g]]);
            break;
          }
          case 'Q': this.stampBJT(A, b, el); break;
          case 'M': this.stampFET(A, b, el, false); break;
          case 'J': this.stampFET(A, b, el, true); break;
          case 'OA': this.stampOpamp(A, b, el, dc); break;
        }
      }
    }

    stampBJT(A, b, el) {
      const p = el.params, n = el._n, N = this.N;
      const pol = +p.pnp ? -1 : 1;
      const is = +p.is || 1e-14, bf = +p.beta || 100, br = +p.br || 1, va = +p.va || 0;
      const vcrit = VT * Math.log(VT / (Math.SQRT2 * is));
      const VB = this.nv(n[0]), VC = this.nv(n[1]), VE = this.nv(n[2]);
      let vbe = pol * (VB - VE), vbc = pol * (VB - VC);
      vbe = pnjlim(vbe, el.lim.vbe != null ? el.lim.vbe : 0, VT, vcrit);
      vbc = pnjlim(vbc, el.lim.vbc != null ? el.lim.vbc : 0, VT, vcrit);
      el.lim.vbe = vbe; el.lim.vbc = vbc;
      const F = junction(vbe, is, VT), R = junction(vbc, is, VT);
      let q = 1, dq = 0;
      if (va > 0) { q = 1 - vbc / va; dq = -1 / va; if (q < 0.05) { q = 0.05; dq = 0; } }
      const ict = (F.i - R.i) * q;
      const dict_dvbe = F.g * q;
      const dict_dvbc = -R.g * q + (F.i - R.i) * dq;
      const ic = ict - R.i / br;
      const ib = F.i / bf + R.i / br;
      const dic_dvbe = dict_dvbe, dic_dvbc = dict_dvbc - R.g / br;
      const dib_dvbe = F.g / bf, dib_dvbc = R.g / br;
      const Jc = [dic_dvbe + dic_dvbc, -dic_dvbc, -dic_dvbe];
      const Jb = [dib_dvbe + dib_dvbc, -dib_dvbc, -dib_dvbe];
      const Je = [-(Jc[0] + Jb[0]), -(Jc[1] + Jb[1]), -(Jc[2] + Jb[2])];
      const Vabs = [VE + pol * vbe, VE + pol * (vbe - vbc), VE];
      el.op = { ic: pol * ic, ib: pol * ib, ie: -pol * (ic + ib), vbe: pol * vbe, vce: pol * (vbe - vbc) };
      this._nl(A, b, N, [n[0], n[1], n[2]], Vabs, [pol * ib, pol * ic, -pol * (ic + ib)], [Jb, Jc, Je]);
    }

    stampFET(A, b, el, jfet) {
      const p = el.params, n = el._n, N = this.N;
      const pol = +p.p ? -1 : 1;
      const VG = this.nv(n[0]), VD = this.nv(n[1]), VS = this.nv(n[2]);
      let vgs = pol * (VG - VS), vds = pol * (VD - VS);
      const lg = el.lim.vgs != null ? el.lim.vgs : vgs, ld = el.lim.vds != null ? el.lim.vds : vds;
      const cl = (v, o, m) => { const r = Math.max(o - m, Math.min(o + m, v)); if (r !== v) LIMITED = true; return r; };
      vgs = cl(vgs, lg, 1.0); vds = cl(vds, ld, 3.0);
      el.lim.vgs = vgs; el.lim.vds = vds;
      let vt, k;
      const lam = +p.lambda || 0;
      if (jfet) {
        const idss = +p.idss || 0.01, vp = -Math.abs(+p.vp || 2);
        vt = vp; k = 2 * idss / (vp * vp);
      } else { vt = p.vt != null ? +p.vt : 2; k = +p.k || 0.2; }
      let rev = false, vgsE = vgs, vdsE = vds;
      if (vds < 0) { rev = true; vgsE = vgs - vds; vdsE = -vds; }
      const vov = vgsE - vt;
      let id = 0, gm = 0, gds = 0;
      if (vov > 0) {
        const c = 1 + lam * vdsE;
        if (vdsE < vov) {
          id = k * (vov * vdsE - vdsE * vdsE / 2) * c;
          gm = k * vdsE * c;
          gds = k * (vov - vdsE) * c + k * (vov * vdsE - vdsE * vdsE / 2) * lam;
        } else {
          id = k / 2 * vov * vov * c;
          gm = k * vov * c;
          gds = k / 2 * vov * vov * lam;
        }
      }
      gds += 1e-9;
      id += 1e-9 * vdsE;
      let Id, J;
      if (!rev) { Id = id; J = [gm, gds, -gm - gds]; }
      else { Id = -id; J = [-gm, gm + gds, -gds]; }
      const Jd = J, Js = J.map((v) => -v), Jg = [0, 0, 0];
      const Vabs = [VS + pol * vgs, VS + pol * vds, VS];
      const I = [0, pol * Id, -pol * Id];
      el.op = { id: pol * Id, vgs: pol * vgs, vds: pol * vds, region: vov <= 0 ? '차단' : (vdsE < vov ? '선형(저항)' : '포화') };
      this._nl(A, b, N, [n[0], n[1], n[2]], Vabs, I, [Jg, Jd, Js]);
      if (jfet) {
        const is = 1e-14, vcrit = VT * Math.log(VT / (Math.SQRT2 * is));
        [[2, 'gs'], [1, 'gd']].forEach(([t, key]) => {
          let v = pol * (VG - this.nv(n[t]));
          v = pnjlim(v, el.lim[key] != null ? el.lim[key] : 0, VT, vcrit);
          el.lim[key] = v;
          const jn = junction(v, is, VT);
          const nodes = [n[0], n[t]];
          const Vv = [this.nv(n[t]) + pol * v, this.nv(n[t])];
          this._nl(A, b, N, nodes, Vv, [pol * jn.i, -pol * jn.i], [[jn.g, -jn.g], [-jn.g, jn.g]]);
        });
      }
    }

    opampParams(el) {
      const p = el.params;
      const vp = p.vp != null ? +p.vp : 15, vn = p.vn != null ? +p.vn : -15, drop = p.drop != null ? +p.drop : 1;
      const hi = vp - drop, lo = vn + drop;
      return { A: +p.gain || 1e5, mid: (hi + lo) / 2, half: Math.max(0.01, (hi - lo) / 2), gbw: p.gbw != null ? +p.gbw : 1e6 };
    }

    stampOpamp(A, b, el, dc) {
      const n = el._n, N = this.N;
      const o = this.opampParams(el);
      const r = this.nNodes - 1 + el._br;
      const vd = this.nv(n[1]) - this.nv(n[0]);
      let alpha = 0, beta = o.A;
      if (!dc && o.gbw > 0) {
        const tau = o.A / (2 * Math.PI * o.gbw);
        const h = (this.h || this.dt) / tau;
        alpha = 1 / (1 + h); beta = o.A * h / (1 + h);
      }
      let xs = alpha * el.st.xs + beta * vd;
      const lx = el.lim.xs;
      if (lx != null) {
        const m = o.half * 4;
        if (xs > lx + m) { xs = lx + m; LIMITED = true; } else if (xs < lx - m) { xs = lx - m; LIMITED = true; }
      }
      el.lim.xs = xs;
      const th = Math.tanh(xs / o.half);
      const vout = o.mid + o.half * th;
      const dvdx = 1 - th * th;
      const g = dvdx * beta;
      const vd0 = beta ? (xs - alpha * el.st.xs) / beta : 0;
      if (n[2] > 0) A[r * N + n[2] - 1] += 1;
      if (n[1] > 0) A[r * N + n[1] - 1] -= g;
      if (n[0] > 0) A[r * N + n[0] - 1] += g;
      b[r] += vout - g * vd0;
      el._xsNew = xs;
    }

    // ---------------------------------------------------------------- 풀이
    solveAt(t, dc) {
      const N = this.N;
      if (N === 0) return true;
      const needBase = dc || this._baseDirty || this._baseDc !== !!dc || this._baseH !== this.h;
      if (needBase) {
        this.stampLinear(dc);
        this._baseH = this.h;
        this._baseDirty = false;
        this._baseDc = !!dc;
        this._luValid = false;
      }
      const A = this.A, b = this.b, x = this.x;
      if (!this.nonlinear) {
        b.set(this.bbase);
        this.stampRhs(b, t, dc);
        if (!this._luValid) {
          A.set(this.Abase);
          if (!luFactor(A, N, this.perm)) { this.warn = '회로를 풀 수 없습니다 (떠 있는 마디 또는 전압원 루프)'; return false; }
          this._luValid = true;
        }
        luSolve(A, N, this.perm, b, x);
        return true;
      }
      const maxIt = dc ? 200 : 80;
      const xnew = this._xn && this._xn.length === N ? this._xn : (this._xn = new Float64Array(N));
      let ok = false;
      for (let it = 0; it < maxIt; it++) {
        A.set(this.Abase);
        b.set(this.bbase);
        this.stampRhs(b, t, dc);
        LIMITED = false;
        this.stampNonlinear(A, b, dc);
        const limited = LIMITED;
        if (!luFactor(A, N, this.perm)) { this.warn = '회로를 풀 수 없습니다 (떠 있는 마디 또는 전압원 루프)'; return false; }
        luSolve(A, N, this.perm, b, xnew);
        let conv = true;
        for (let i = 0; i < N; i++) {
          if (!isFinite(xnew[i])) { conv = false; xnew[i] = 0; }
          const d = Math.abs(xnew[i] - x[i]);
          const tol = i < this.nNodes - 1 ? 1e-6 + 1e-6 * Math.abs(xnew[i]) : 1e-9 + 1e-6 * Math.abs(xnew[i]);
          if (d > tol) conv = false;
        }
        if (it > 30 && !conv) for (let i = 0; i < N; i++) xnew[i] = 0.5 * (x[i] + xnew[i]);
        x.set(xnew);
        if (conv && it > 0 && !limited) { ok = true; break; }
      }
      if (!ok && (dc || (this.h || this.dt) < this.dt / 60 || (this._failStreak || 0) >= 4)) this.warn = '수렴하지 않은 단계가 있습니다';
      return ok;
    }

    /** 직류 동작점(콘덴서 개방, 코일 단락) — 초기 상태로 쓴다 */
    dcop() {
      this._baseDirty = true;
      const ok = this.solveAt(0, true);
      this._baseDirty = true;
      return ok;
    }
    /** 동작점을 콘덴서 · 코일 초기 상태로 */
    adoptDcop() {
      this.els.forEach((el) => {
        const n = el._n;
        if (el.type === 'C') { el.st.v = this.nv(n[0]) - this.nv(n[1]); el.st.i = 0; }
        if (el.type === 'L') { el.st.i = this.brI(el._br); el.st.v = 0; }
        if (el.type === 'X') { el.st.i1 = this.brI(el._br); el.st.i2 = this.brI(el._br + 1); }
        if (el.type === 'OA') { el.st.xs = (el._xsNew || 0) + 1e-3 * this.opampParams(el).half; }
      });
      this._baseDirty = true;
    }

    saveState() {
      return { x: Float64Array.from(this.x), st: this.els.map((e) => Object.assign({}, e.st)), lim: this.els.map((e) => Object.assign({}, e.lim)) };
    }
    loadState(s) {
      this.x.set(s.x);
      this.els.forEach((e, i) => { e.st = Object.assign({}, s.st[i]); e.lim = Object.assign({}, s.lim[i]); });
    }

    /** 시간 한 단계 (수렴하지 않으면 잘게 나누어 다시 푼다). 상태가 바뀌어 행렬을 다시 만들어야 하면 true */
    advance(h, depth) {
      depth = depth || 0;
      const canSplit = this.nonlinear && depth < 3 && (this._failStreak || 0) < 4;
      const saved = canSplit ? this.saveState() : null;
      this.h = h;
      const t = this.t + h;
      const ok = this.solveAt(t, false);
      if (depth === 0) this._failStreak = ok ? 0 : (this._failStreak || 0) + 1;
      if (!ok && saved) {
        this.loadState(saved);
        for (let k = 0; k < 4; k++) this.advance(h / 4, depth + 1);
        this.h = this.dt;
        return;
      }
      this.commitStep(h);
      this.t = t;
      if (depth === 0) this.h = this.dt;
    }
    /** 풀린 해로 상태 변수(콘덴서 전압 · 코일 전류 …)를 갱신 */
    commitStep(dt) {
      const trap = this.method === 'trap';
      this.els.forEach((el) => {
        const n = el._n, st = el.st, p = el.params;
        if (el.type === 'C') {
          const v = this.nv(n[0]) - this.nv(n[1]);
          const geq = (trap ? 2 : 1) * (+p.c) / dt;
          st.i = trap ? geq * (v - st.v) - st.i : geq * (v - st.v);
          st.v = v;
        } else if (el.type === 'L') {
          st.i = this.brI(el._br);
          st.v = this.nv(n[0]) - this.nv(n[1]);
        } else if (el.type === 'X') {
          st.i1 = this.brI(el._br); st.i2 = this.brI(el._br + 1);
          st.v1 = this.nv(n[0]) - this.nv(n[1]); st.v2 = this.nv(n[2]) - this.nv(n[3]);
        } else if (el.type === 'OA') {
          const o = this.opampParams(el);
          st.xs = Math.max(-5 * o.half, Math.min(5 * o.half, el._xsNew || 0));
        } else if (el.type === 'FUSE' && !st.blown) {
          const a = Math.max(1e-6, +p.a || 1);
          const i = (this.nv(n[0]) - this.nv(n[1])) / FUSE_R;
          st.heat = Math.max(0, st.heat + ((i * i) / (a * a) - 1) * dt);
          if (st.heat > 0.05) { st.blown = true; this._baseDirty = true; this.visualDirty = true; }
        }
      });
      this.updateRelays();
    }
    /** 릴레이: 코일 전류가 ion 을 넘으면 붙고, 절반 아래로 떨어지면 떨어진다. 바뀌면 true */
    updateRelays() {
      let ch = false;
      this.els.forEach((el) => {
        if (el.type !== 'RLY') return;
        const n = el._n, p = el.params;
        const i = Math.abs(this.nv(n[0]) - this.nv(n[1])) / Math.max(1e-3, +p.r || 100);
        const ion = +p.ion || 0.02;
        const on = el.st.on ? i > ion * 0.5 : i > ion;
        if (on !== el.st.on) { el.st.on = on; ch = true; }
      });
      if (ch) { this._baseDirty = true; this.visualDirty = true; }
      return ch;
    }

    invalidate() { this._baseDirty = true; this._luValid = false; }

    // ---------------------------------------------------------------- 결과 조회
    pinCurrents(el) {
      const p = el.params, n = el._n;
      const v = (k) => this.nv(n[k]);
      switch (el.type) {
        case 'R': { const i = (v(0) - v(1)) / Math.max(1e-6, +p.r); return [i, -i]; }
        case 'LAMP': { const i = (v(0) - v(1)) / lampR(p); return [i, -i]; }
        case 'POT': {
          const R = Math.max(1, +p.r), pos = Math.min(1, Math.max(0, +p.pos));
          const ia = (v(0) - v(2)) / Math.max(0.5, R * pos), ib = (v(1) - v(2)) / Math.max(0.5, R * (1 - pos));
          return [ia, ib, -ia - ib];
        }
        case 'S': case 'PB': { const i = +p.on ? (v(0) - v(1)) / (+p.ron || 1e-2) : 0; return [i, -i]; }
        case 'FUSE': { const i = el.st && el.st.blown ? 0 : (v(0) - v(1)) / FUSE_R; return [i, -i]; }
        case 'SPDT': {
          const k = +p.pos ? 2 : 1;
          const i = (v(0) - v(k)) / (+p.ron || 1e-2);
          return k === 1 ? [i, -i, 0] : [i, 0, -i];
        }
        case 'ASW': { const i = (v(0) - v(1)) * (this.aswOn(el) ? 1 / Math.max(1e-3, +p.ron || 50) : 1e-10); return [i, -i, 0]; }
        case 'RLY': {
          const ic = (v(0) - v(1)) / Math.max(1e-3, +p.r || 100);
          const k = el.st && el.st.on ? 3 : 4;
          const is = (v(2) - v(k)) / 0.05;
          return k === 3 ? [ic, -ic, is, -is, 0] : [ic, -ic, is, 0, -is];
        }
        case 'C': return [el.st.i, -el.st.i];
        case 'L': return [this.brI(el._br), -this.brI(el._br)];
        case 'X': return [this.brI(el._br), -this.brI(el._br), this.brI(el._br + 1), -this.brI(el._br + 1)];
        case 'V': case 'AC': case 'AM': { const i = this.brI(el._br); return [-i, i]; }
        case 'I': return [+p.i, -(+p.i)];
        case 'OA': return [0, 0, this.brI(el._br)];
        case 'D': case 'LED': {
          const m = diodeModel(el);
          const i = junction(v(0) - v(1), m.is, m.n * VT).i;
          return [i, -i];
        }
        case 'Z': {
          const vv = v(0) - v(1), vz = +p.vz || 5.1;
          const i = junction(vv, 1e-14, VT).i - zenerRev(vv, vz).i;
          return [i, -i];
        }
        case 'Q': { const o = el.op || { ib: 0, ic: 0, ie: 0 }; return [o.ib, o.ic, o.ie]; }
        case 'M': case 'J': { const o = el.op || { id: 0 }; return [0, o.id, -o.id]; }
        default: return (el._n || []).map(() => 0);
      }
    }

    /** 소자 정보 (측정 표시용) */
    info(el) {
      const n = el._n || [];
      const v = (k) => this.nv(n[k]);
      const ic = this.pinCurrents(el);
      const p = el.params;
      const out = { name: el.name || TYPES[el.type].name, type: el.type };
      switch (el.type) {
        case 'Q': {
          const pol = +p.pnp ? -1 : 1;
          const vbe = v(0) - v(2), vce = v(1) - v(2);
          let region = '차단';
          const ib = pol * (ic[0] || 0);
          if (pol * vbe > 0.5 && ib > 1e-7) region = pol * vce > 0.25 ? '활성(증폭)' : '포화';
          Object.assign(out, { vbe, vce, ib: ic[0], ic: ic[1], ie: ic[2], region, beta: +p.beta, p: vce * ic[1] + vbe * ic[0] });
          break;
        }
        case 'M': case 'J': {
          const vgs = v(0) - v(2), vds = v(1) - v(2);
          Object.assign(out, { vgs, vds, id: ic[1], region: el.op ? el.op.region : '', p: vds * ic[1] });
          break;
        }
        case 'OA':
          Object.assign(out, { vin: v(1) - v(0), vplus: v(1), vminus: v(0), vout: v(2), iout: -(ic[2] || 0) });
          break;
        case 'POT':
          Object.assign(out, { v: v(0) - v(1), vw: v(2), i: ic[0], pos: +p.pos });
          break;
        case 'X':
          Object.assign(out, { v1: v(0) - v(1), v2: v(2) - v(3), i1: ic[0], i2: ic[2] });
          break;
        case 'ASW':
          Object.assign(out, { v: v(0) - v(1), i: ic[0], on: this.aswOn(el) });
          break;
        case 'RLY':
          Object.assign(out, { v: v(0) - v(1), i: ic[0], isw: ic[2], on: !!(el.st && el.st.on) });
          break;
        case 'G':
          out.v = 0;
          break;
        default: {
          const vv = v(0) - v(1);
          const i = ic[0] || 0;
          Object.assign(out, { v: vv, i, p: vv * i });
        }
      }
      if (el.type === 'I') { out.v = v(1) - v(0); out.i = +p.i || 0; out.p = out.v * out.i; }
      if (el.type === 'V' || el.type === 'AC') {
        const iout = -(ic[1] || 0);
        out.v = v(1) - v(0); out.i = iout; out.p = out.v * iout;
      }
      return out;
    }

    /** 저항 측정 (멀티미터 Ω): 독립 전원을 0 으로, 디지털 출력은 끊고, 두 마디 사이에 시험 전류를 흘린다 */
    measureResistance(nodeA, nodeB) {
      if (nodeA === nodeB) return 0;
      if (nodeA < 0 || nodeB < 0) return NaN;
      const els = this.els.map((e) => {
        const c = Object.assign({}, e, { params: Object.assign({}, e.params), _n: e._n, st: Object.assign({}, e.st) });
        if (c.type === 'V') c.params.v = 0;
        if (c.type === 'AC') { c.params.amp = 0; c.params.dc = 0; }
        if (c.type === 'I') c.params.i = 0;
        return c;
      });
      const s = new AnalogCore(els, this.nNodes, { ic: 'dcop' }, []);
      s.els.forEach((e, i) => { e.st = Object.assign({}, this.els[i].st); });
      const itest = 1e-4;
      const orig = s.stampRhs.bind(s);
      s.stampRhs = (b, t, dc) => {
        orig(b, t, dc);
        if (nodeA > 0) b[nodeA - 1] += itest;
        if (nodeB > 0) b[nodeB - 1] -= itest;
      };
      s.solveAt(0, true);
      const r = (s.nv(nodeA) - s.nv(nodeB)) / itest;
      return r > 1e10 ? Infinity : r;
    }
  }

  const CS_A = { VT, GMIN, parseNum, siText, fmt, TYPES, DIODE_MODELS, LED_VF, LED_RGB, xf, perp, pins, PIN_NAMES, waveValue,
    lampR, diodeModel, NONLINEAR, DYNAMIC, AnalogCore };
  if (typeof module !== 'undefined' && module.exports) module.exports = CS_A;
  root.CS_A = CS_A;
})(typeof window !== 'undefined' ? window : globalThis);
