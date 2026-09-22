/* 혼합 신호(아날로그 + 디지털) 회로 시뮬레이션 엔진 (브라우저 · Node 공용)
 *
 *  회로 텍스트 한 줄 = 부품 하나.  아날로그 부품(R, C, Q, OA …)과 디지털 부품(AND, DFF, CNT …)을 한 회로에 섞어 놓는다.
 *
 *  연결: 모든 단자 · 도선 끝점을 점으로 모아 넷(net)을 만든다.
 *    - 아날로그 단자(또는 접지)가 하나라도 닿은 넷 = 아날로그 넷 → MNA 마디
 *    - 디지털 단자만 닿은 넷 = 디지털 넷 → 이벤트 구동 논리값 (0 · 1 · X · Z)
 *  경계(브리지):
 *    - 디지털 출력 → 아날로그 넷: 출력 저항(기본 25 Ω) + 목표 전압(0 / VDD) 의 노턴 등가
 *    - 아날로그 넷 → 디지털 입력: 문턱값 (0.4·VDD ↓ / 0.6·VDD ↑ 히스테리시스)
 *  시간 진행:
 *    - 상태가 있는 아날로그 소자(C, L, 교류 …)가 있으면 고정 시간 간격 dt 로 함께 진행 (lockstep)
 *    - 없으면 디지털 사건이 생길 때마다 아날로그를 다시 푼다 (event)
 */
(function (root) {
  'use strict';
  const A = root.CS_A || require('./analog.js');
  const D = root.CS_D || require('./digital.js');
  const { L0, L1, LX, LZ } = D;
  const { parseNum, siText, fmt } = A;

  // ================================================================= 부품 종류 (아날로그 + 디지털 + 공용)
  const TYPES = Object.assign({}, A.TYPES, D.TYPES, {
    P: { kind: '1', name: '측정점', args: ['label'], dom: 'x' },
    N: { kind: '1', name: '연결 이름표', args: ['label'], dom: 'x' },
    TXT: { kind: '1', name: '글자', dom: 'x' }
  });
  TYPES.W.dom = 'x';
  TYPES.G.dom = 'a';
  const isDigital = (t) => TYPES[t] && TYPES[t].dom === 'd';
  const isAnalog = (t) => TYPES[t] && TYPES[t].dom === 'a';

  const NAME_PREFIX = Object.assign({ R: 'R', POT: 'VR', C: 'C', L: 'L', V: 'V', AC: 'V', I: 'I', S: 'S', PB: 'SW', SPDT: 'S', FUSE: 'F', D: 'D', Z: 'ZD', LED: 'LED',
    LAMP: 'LP', AM: 'AM', VM: 'VM', Q: 'Q', M: 'M', J: 'J', OA: 'U', X: 'T', ASW: 'AS', RLY: 'K',
    VREG: 'U', TL431: 'U', BUCK: 'U', BOOST: 'U', DCDC: 'PS', ACDC: 'PS' }, D.NAME_PREFIX);

  // ================================================================= 파싱
  function tokenize(line) {
    const out = [];
    const re = /(\S+?=)"([^"]*)"|"([^"]*)"|(\S+)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) out.push(m[1] + m[2]);
      else if (m[3] != null) out.push({ q: m[3] });
      else out.push(m[4]);
    }
    return out;
  }
  function unq(v) { return v.replace(/^"|"$/g, ''); }
  function kv(tks) {
    const o = {};
    tks.forEach((t) => {
      if (typeof t !== 'string') return;
      const eq = t.indexOf('=');
      if (eq > 0) o[t.slice(0, eq)] = unq(t.slice(eq + 1));
      else o[t] = true;
    });
    return o;
  }
  const isNumTok = (t) => typeof t === 'string' && /^[-+]?\d+(\.\d+)?$/.test(t);

  const NUM_PARAMS = ['r', 'c', 'l', 'v', 'amp', 'freq', 'phase', 'dc', 'duty', 'i', 'vz', 'w', 'beta', 'is', 'va', 'br', 'vt', 'k', 'lambda',
    'idss', 'vp', 'vn', 'gain', 'drop', 'gbw', 'n', 'pos', 'on', 'pnp', 'p', 'r0', 'v0', 'i0', 'rot', 'f', 'min', 'max', 'size', 'rs', 'ron', 'a', 'ion', 'inv',
    'vout', 'vdo', 'ilim', 'iq', 'eff', 'uvlo', 'fsw', 'vref', 'kp', 'ki', 'tss', 'vmin'];

  /**
   * 회로 텍스트 → { elements, opts, scope, meter, la, tt, checks, errors }
   * 예전 형식(회로이론 · 디지털 강좌)도 그대로 읽는다:
   *   LED x y (좌표 2개) → 로직 LED(DLED),  PB x y → 논리 버튼(BTN),  CLK f=2 → freq=2,  TXT label="…"
   */
  function parse(text) {
    const res = { elements: [], opts: {}, scope: null, meter: null, la: null, tt: null, bode: null, checks: [], errors: [] };
    String(text || '').split(/\r?\n/).forEach((raw, ln) => {
      const line = raw.replace(/(^|\s)(#|\/\/).*$/, '').trim();
      if (!line) return;
      if (line[0] === '!') { res.checks.push({ text: line.slice(1).trim(), line: ln + 1 }); return; }
      const tk = tokenize(line);
      const head = tk[0];
      if (typeof head !== 'string') return;
      if (head === '$') { Object.assign(res.opts, kv(tk.slice(1))); return; }
      if (head === 'scope' || head === 'meter' || head === 'la' || head === 'tt' || head === 'bode') { res[head] = kv(tk.slice(1)); return; }
      let type = head.toUpperCase();
      // 예전 디지털 형식: 좌표가 2개뿐인 LED / PB
      const nNums = tk.slice(1).filter(isNumTok).length;
      if ((type === 'LED' || type === 'PB') && nNums < 4) type = type === 'LED' ? 'DLED' : 'BTN';
      const def = TYPES[type];
      if (!def) { res.errors.push(`${ln + 1}행: 알 수 없는 부품 '${head}'`); return; }
      const el = { type, params: {} };
      let i = 1;
      const num = () => { const v = +tk[i++]; if (isNaN(v)) throw new Error('좌표'); return v; };
      try {
        if (def.kind === '2') { el.x1 = num(); el.y1 = num(); el.x2 = num(); el.y2 = num(); }
        else { el.x = num(); el.y = num(); }
      } catch (e) { res.errors.push(`${ln + 1}행: 좌표가 잘못되었습니다 (${raw.trim()})`); return; }
      const pos = [];
      for (; i < tk.length; i++) {
        const t = tk[i];
        if (typeof t === 'object') { pos.push(t.q); continue; }
        const eq = t.indexOf('=');
        if (eq > 0) el.params[t.slice(0, eq)] = unq(t.slice(eq + 1));
        else pos.push(t);
      }
      const p = el.params;
      if (type === 'TXT') { p.text = p.text != null ? p.text : p.label != null ? p.label : pos.join(' '); delete p.label; }
      else if (def.args) def.args.forEach((a, k) => { if (pos[k] != null && p[a] == null) p[a] = pos[k]; });
      else if (def.dom === 'd' && pos.length) {
        if (D.GATE_TYPES.indexOf(type) >= 0 && p.n == null && /^\d$/.test(pos[0])) p.n = pos[0];
        else if (/^[A-Za-z]/.test(pos[0]) && p.name == null) p.name = pos[0];
      }
      if (def.dom === 'a' && def.def) Object.keys(def.def).forEach((k) => { if (p[k] == null) p[k] = def.def[k]; });
      if (type === 'CLK' && p.f != null) { if (p.freq == null) p.freq = p.f; delete p.f; }
      if (p.name != null && String(p.name) !== '') { el.name = String(p.name); }
      delete p.name;
      el.line = ln + 1;
      res.elements.push(el);
    });
    normalizeParams(res.elements);
    autoName(res.elements);
    return res;
  }

  function normalizeParams(els) {
    els.forEach((el) => {
      const p = el.params;
      const ana = isAnalog(el.type);
      NUM_PARAMS.forEach((k) => {
        if (p[k] == null || typeof p[k] !== 'string') return;
        if (!ana && k !== 'rot' && k !== 'f') return;          // 디지털 부품 옵션은 문자열 그대로 (엔진이 읽을 때 해석)
        const v = parseNum(p[k]);
        if (v != null && !isNaN(v)) p[k] = v;
      });
      if (el.type === 'P' && p.label == null) p.label = '?';
      if (el.type === 'N' && p.label == null) p.label = 'NET';
    });
  }

  function autoName(els) {
    const used = new Set(els.filter((e) => e.name).map((e) => e.name));
    const cnt = {};
    els.forEach((el) => {
      if (el.name) return;
      const pre = NAME_PREFIX[el.type];
      if (!pre) return;
      let n = cnt[pre] || 0, name;
      do { n++; name = pre + n; } while (used.has(name));
      cnt[pre] = n;
      used.add(name);
      el.name = name;
      el.autoName = true;
    });
  }

  /** 회로 → 텍스트 */
  function serialize(circ) {
    const lines = [];
    const o = circ.opts || {};
    const ok = Object.keys(o).filter((k) => o[k] != null && o[k] !== '');
    if (ok.length) lines.push('$ ' + ok.map((k) => `${k}=${o[k]}`).join(' '));
    circ.elements.forEach((el) => lines.push(serializeEl(el)));
    ['scope', 'meter', 'la', 'tt', 'bode'].forEach((k) => {
      const c = circ[k];
      if (c && Object.keys(c).length) lines.push(k + ' ' + Object.keys(c).map((q) => `${q}=${quote(c[q])}`).join(' '));
    });
    (circ.checks || []).forEach((c) => lines.push('! ' + c.text));
    return lines.join('\n') + '\n';
  }
  function serializeEl(el) {
    const def = TYPES[el.type];
    const parts = [el.type];
    if (def.kind === '2') parts.push(el.x1, el.y1, el.x2, el.y2);
    else parts.push(el.x, el.y);
    const p = Object.assign({}, el.params);
    const ana = def.dom === 'a';
    const val = (v) => (typeof v === 'number' ? (ana ? siText(v, 4) : String(+v.toPrecision(6))) : quote(v));
    if (el.type === 'TXT') { parts.push(quote(p.text || '') || '""'); delete p.text; }
    (def.args || []).forEach((a) => {
      if (p[a] != null && p[a] !== '') { parts.push(val(p[a])); }
      delete p[a];
    });
    Object.keys(p).forEach((k) => {
      const dv = def.def ? def.def[k] : undefined;
      if (p[k] == null || p[k] === '' || (dv != null && String(p[k]) === String(dv))) return;
      if ((k === 'rot' || k === 'f') && !+p[k]) return;
      parts.push(`${k}=${val(p[k])}`);
    });
    if (el.name && !el.autoName) parts.push(`name=${quote(el.name)}`);
    return parts.join(' ');
  }
  function quote(s) { s = String(s); return /[\s"]/.test(s) ? `"${s.replace(/"/g, "'")}"` : s; }

  // ================================================================= 기하
  /** 소자의 단자 목록 [{x, y, n(이름), dir, dom}] */
  function pinList(el) {
    const def = TYPES[el.type];
    if (!def) return [];
    if (el.type === 'W') return [{ x: el.x1, y: el.y1, n: '1', dom: 'x' }, { x: el.x2, y: el.y2, n: '2', dom: 'x' }];
    if (el.type === 'P' || el.type === 'N') return [{ x: el.x, y: el.y, n: 'P', dom: 'x' }];
    if (el.type === 'TXT') return [];
    if (def.dom === 'a') {
      const names = A.PIN_NAMES[el.type] || [];
      const dp = def.dpins || [];
      return A.pins(el).map(([x, y], k) => ({ x, y, n: names[k] || String(k + 1), dom: dp.indexOf(k) >= 0 ? 'd' : 'a', dir: dp.indexOf(k) >= 0 ? 'in' : 'io' }));
    }
    return D.pinsOf(el).map((pn) => Object.assign(pn, { dom: pn.dir === 'ain' || pn.dir === 'aout' ? 'a' : 'd' }));
  }
  /** 핀 좌표만 [[x,y]] */
  function pins(el) { return pinList(el).map((q) => [q.x, q.y]); }

  /** 소자 외곽 (격자) */
  function boundsOf(el) {
    const def = TYPES[el.type];
    if (def && def.dom === 'd') return D.boundsOf(el);
    const ps = pins(el);
    if (!ps.length) return { x0: el.x, y0: el.y, x1: el.x, y1: el.y };
    return { x0: Math.min(...ps.map((q) => q[0])), y0: Math.min(...ps.map((q) => q[1])), x1: Math.max(...ps.map((q) => q[0])), y1: Math.max(...ps.map((q) => q[1])) };
  }

  // ================================================================= 혼합 시뮬레이터
  class Sim {
    constructor(circ) {
      this.circ = circ;
      this.opts = circ.opts || {};
      this.vdd = parseNum(this.opts.vdd, 5) || 5;
      this.vih = this.vdd * (parseNum(this.opts.vih, 0.6) > 1 ? parseNum(this.opts.vih) / this.vdd : parseNum(this.opts.vih, 0.6));
      this.vil = this.vdd * (parseNum(this.opts.vil, 0.4) > 1 ? parseNum(this.opts.vil) / this.vdd : parseNum(this.opts.vil, 0.4));
      this.listeners = new Set();
      this.t = 0;
      this.warn = '';
      this.build();
      this.reset();
    }

    // ---------------------------------------------------------------- 연결
    build() {
      const els = this.circ.elements.filter((e) => e.type !== 'TXT' && TYPES[e.type]);
      this.els = els;
      const ptIndex = new Map();
      const pts = [];
      const addPt = (x, y) => {
        const k = x + ',' + y;
        if (!ptIndex.has(k)) { ptIndex.set(k, pts.length); pts.push([x, y]); }
        return ptIndex.get(k);
      };
      els.forEach((el) => {
        el._pl = pinList(el);
        el._pins = el._pl.map((q) => addPt(q.x, q.y));
      });
      // 도선 위(끝점이 아닌 곳)에 놓인 점 → 도선을 조각으로 나눈다
      const segs = [];
      els.filter((e) => e.type === 'W').forEach((w) => {
        const a = w._pins[0], b = w._pins[1];
        const [x1, y1] = pts[a], [x2, y2] = pts[b];
        const onw = [];
        const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (len2 > 0) {
          pts.forEach((p, i) => {
            if (i === a || i === b) return;
            if (p[0] < Math.min(x1, x2) || p[0] > Math.max(x1, x2) || p[1] < Math.min(y1, y2) || p[1] > Math.max(y1, y2)) return;
            const cross = (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1);
            if (Math.abs(cross) > 1e-9) return;
            const dot = (p[0] - x1) * (x2 - x1) + (p[1] - y1) * (y2 - y1);
            if (dot > 0 && dot < len2) onw.push({ i, t: dot / len2 });
          });
        }
        onw.sort((u, v) => u.t - v.t);
        const chain = [a, ...onw.map((o) => o.i), b];
        w._segs = [];
        for (let k = 0; k + 1 < chain.length; k++) {
          if (chain[k] === chain[k + 1]) continue;
          const s = { a: chain[k], b: chain[k + 1], wire: w, i: 0 };
          segs.push(s);
          w._segs.push(s);
        }
      });
      this.pts = pts;
      this.segs = segs;
      this.ptIndex = ptIndex;
      // union-find
      const par = pts.map((_, i) => i);
      const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
      segs.forEach((s) => uni(s.a, s.b));
      els.filter((e) => e.type === 'W' && !e._segs.length).forEach((w) => uni(w._pins[0], w._pins[1]));
      const tunnels = {};
      els.filter((e) => e.type === 'N').forEach((e) => {
        const lb = String(e.params.label);
        if (tunnels[lb] != null) uni(e._pins[0], tunnels[lb]); else tunnels[lb] = e._pins[0];
      });
      const grounds = els.filter((e) => e.type === 'G').map((e) => e._pins[0]);
      grounds.forEach((g) => uni(g, grounds[0]));
      // 넷
      const netOfRoot = new Map();
      const nets = [];
      this.ptNet = pts.map((_, i) => {
        const r = find(i);
        if (!netOfRoot.has(r)) {
          netOfRoot.set(r, nets.length);
          nets.push({ id: nets.length, pts: [], wires: [], analog: false, gnd: false, node: -1, names: [], drv: [], rd: [], hist: [], v: LZ, av: L0, npins: 0, watch: null });
        }
        const n = netOfRoot.get(r);
        nets[n].pts.push(i);
        return n;
      });
      this.nets = nets;
      els.forEach((el) => {
        if (el.type === 'W') { const n = nets[this.ptNet[el._pins[0]]]; n.wires.push(el); return; }
        el._pl.forEach((q, k) => {
          const n = nets[this.ptNet[el._pins[k]]];
          if (el.type !== 'P' && el.type !== 'N') n.npins++;
          if (q.dom === 'a') n.analog = true;
        });
        if (el.type === 'G') { const n = nets[this.ptNet[el._pins[0]]]; n.gnd = true; n.analog = true; }
      });
      // 기준 마디 (접지가 없으면 첫 전원의 (−) 단자)
      let gnd = nets.find((n) => n.gnd);
      if (!gnd) {
        const src = els.find((e) => e.type === 'V' || e.type === 'AC');
        if (src) { gnd = nets[this.ptNet[src._pins[0]]]; this.noGround = true; }
      }
      this.gndNet = gnd ? gnd.id : -1;
      let nNodes = 1;
      nets.forEach((n) => { if (!n.analog) return; n.node = n === gnd ? 0 : nNodes++; });
      this.nNodes = nNodes;
      // 이름 (측정점 · 이름표)
      this.probes = [];
      els.forEach((el) => {
        if (el.type === 'P') { const net = this.ptNet[el._pins[0]]; this.probes.push({ label: String(el.params.label), net, el }); nets[net].names.push(String(el.params.label)); }
        if (el.type === 'N') nets[this.ptNet[el._pins[0]]].names.push(String(el.params.label));
      });

      // ---- 아날로그 쪽
      this.aEls = els.filter((e) => isAnalog(e.type));
      this.aEls.forEach((el) => {
        el._n = el._pins.map((pt) => nets[this.ptNet[pt]].node);
        if (el.type === 'ASW') {
          const cn = nets[this.ptNet[el._pins[2]]];
          el._ctl = () => cn.v === L1 ? 1 : 0;
          (cn.watch || (cn.watch = [])).push(() => { if (this.analog) { this.analog.invalidate(); this.analogDirty = true; } });
        }
      });
      // ---- 디지털 쪽
      this.comps = [];
      this.byName = {};
      els.forEach((el) => {
        if (!isDigital(el.type)) return;
        const c = { el, type: el.type, P: el.params, name: el.name, pins: el._pl, ins: [], inPins: [], outs: [], outPins: [], apins: {}, s: {}, idx: this.comps.length };
        el._pl.forEach((pn, k) => {
          const n = this.ptNet[el._pins[k]];
          pn.net = n;
          if (pn.dir === 'out' || pn.dir === 'aout') { c.outs.push(n); c.outPins.push(pn); nets[n].drv.push([c, c.outs.length - 1, !!pn.weak]); if (pn.dir === 'aout') c.apins[pn.n] = n; }
          else if (pn.dir === 'in') { c.ins.push(n); c.inPins.push(pn); nets[n].rd.push(c); }
          else if (pn.dir === 'ain') c.apins[pn.n] = n;
        });
        c.va = (nm) => this.netV(c.apins[nm]);
        c.aconn = (nm) => { const n = c.apins[nm]; return n != null && nets[n].npins > 1; };
        this.comps.push(c);
        this.byName[el.name] = c;
        if (['SW', 'BTN', 'CLK'].indexOf(el.type) >= 0) nets[c.outs[0]].names.push(el.name);
        if (el.type === 'DLED') nets[c.ins[0]].names.push(el.name);
      });
      this.dig = new D.DigitalCore(this.comps, nets, {});
      // 브리지: 아날로그 넷에 붙은 디지털 출력
      this.bridges = [];
      this.comps.forEach((c) => c.outs.forEach((n, k) => {
        const net = nets[n];
        if (!net.analog) return;
        const pn = c.outPins[k];
        let rout = parseNum(this.opts.rout, 25) || 25;
        if (pn.weak) rout = parseNum(c.P.r, 10000) || 10000;
        else if (c.type === 'HI' || c.type === 'LO') rout = 0.5;
        else if (c.type === 'T555') rout = pn.n === 'DIS' ? 5 : pn.n === 'CV' ? 3333 : 10;
        else if (c.type === 'DAC') rout = 10;
        this.bridges.push({ c, k, net, node: net.node, g: 1 / rout, z: false, v: 0, pin: pn });
      }));
      this.hasAnalog = this.nNodes > 1 || this.aEls.some((e) => e.type !== 'G');
      this.analog = this.hasAnalog ? new A.AnalogCore(this.aEls, this.nNodes, this.opts, this.bridges) : null;
      // 시간 간격 · 모드
      const clocks = this.comps.filter((c) => c.type === 'CLK');
      this.fclk = clocks.reduce((m, c) => Math.max(m, parseNum(c.P.freq, 1) || 1), 0);
      this.fmax = this.analog ? this.analog.fmax : 0;
      let dt = this.opts.dt != null ? parseNum(this.opts.dt) : null;
      if (!dt) {
        dt = this.fmax > 0 ? 1 / (this.fmax * 400) : 1e-4;
        if (this.fclk > 0) dt = Math.min(dt, 1 / (this.fclk * 200));
        this.aEls.forEach((e) => { if (e.type === 'BUCK' || e.type === 'BOOST') dt = Math.min(dt, 1 / ((+e.params.fsw || 50000) * 100)); });
      }
      this.dt = dt;
      if (this.analog) { this.analog.dt = dt; this.analog.h = dt; }
      this.mode = !this.analog ? 'digital' : this.analog.dynamic ? 'lock' : 'event';
      this.dig.afterBatch = this.mode === 'event' ? () => this.staticHook() : null;
      this.hasClock = clocks.length > 0;
      this.hasSeq = this.dig.hasSeq;
    }

    // ---------------------------------------------------------------- 브리지 · 문턱값
    levelOf(b) {
      const c = b.c, v = c.ov[b.k];
      if (b.pin.dir === 'aout') return { z: false, v: c.aoutV ? c.aoutV[b.k] || 0 : 0 };
      if (v === LZ) return { z: true, v: 0 };
      if (c.type === 'T555') {
        const g = c.va('GND');
        return { z: false, v: v === L1 ? g + Math.max(0, (c.s.vcc || this.vdd) - 1.5) : g + 0.05 };
      }
      return { z: false, v: v === L1 ? this.vdd : v === L0 ? 0 : this.vdd / 2 };
    }
    /** 디지털 출력 → 브리지 값. 값이 바뀌었으면 true */
    updateBridges() {
      let ch = false, zch = false;
      for (const b of this.bridges) {
        const l = this.levelOf(b);
        if (l.z !== b.z) { b.z = l.z; zch = true; ch = true; }
        if (l.v !== b.v) { b.v = l.v; ch = true; }
      }
      if (zch && this.analog) this.analog.invalidate();
      this.dig.bridgeDirty = false;
      return ch;
    }
    /** 아날로그 전압 → 논리값 (히스테리시스). 디지털 쪽에 할 일이 생겼으면 true */
    updateAD(init) {
      if (!this.analog) return false;
      let ch = false;
      for (const n of this.nets) {
        if (!n.analog) continue;
        const v = this.analog.nv(n.node);
        let lvl;
        if (init) lvl = v >= this.vdd / 2 ? L1 : L0;
        else lvl = n.av === L1 ? (v < this.vil ? L0 : L1) : (v > this.vih ? L1 : L0);
        if (init) { if (n.av !== lvl || n.v !== lvl) { n.av = lvl; n.v = lvl; ch = true; } }
        else if (this.dig.setAnalogLogic(n, lvl)) ch = true;
      }
      for (const c of this.dig.anaReaders) {
        let sig = '';
        for (const k in c.apins) sig += this.netV(c.apins[k]).toFixed(6) + ',';
        if (sig !== c._asig) { c._asig = sig; if (!init) this.dig.dirty.add(c); ch = true; }
      }
      return ch || this.dig.dirty.size > 0;
    }
    /** event 모드: 디지털 사건 묶음이 끝날 때마다 아날로그를 다시 푼다 */
    staticHook() {
      if (!this.analogDirty && !this.dig.bridgeDirty) return false;
      this.analogDirty = false;
      return this.solveStatic();
    }
    solveStatic() {
      this.updateBridges();
      const a = this.analog;
      a.t = this.dig.t;
      for (let k = 0; k < 6; k++) {
        a.solveAt(this.dig.t, false);
        if (!a.updateRelays()) break;
      }
      return this.updateAD(false);
    }

    // ---------------------------------------------------------------- 처음 상태
    reset() {
      this.t = 0;
      this.warn = '';
      this.carry = 0;
      const a = this.analog;
      const zero = this.opts.ic === 'zero';
      if (a) a.initState();
      this.dig.resetStart();
      for (let it = 0; it < 16; it++) {
        this.dig.relax();
        const bch = this.updateBridges();
        if (a && !zero && (bch || it === 0)) { a.dcop(); a.updateRelays(); }
        const adch = this.updateAD(true);
        if (!adch && !bch && it > 0) break;
      }
      if (a && !zero) a.adoptDcop();
      if (a) { a.t = 0; a.warn = ''; a._baseDirty = true; }
      this.dig.resetFinish();
      this.updateBridges();
      this.analogDirty = true;
      if (this.mode === 'event') this.dig.runUntil(0);
      this.computeCurrents();
      this.emit();
    }

    // ---------------------------------------------------------------- 시간 진행
    /** 자동 속도 (시뮬레이션 초 / 실제 초) */
    autoSpeed(scopeTb) {
      const o = this.opts.speed;
      if (o != null && o !== 'auto') return parseNum(o, 1);
      const byScope = scopeTb ? (scopeTb >= 0.02 ? 1 : scopeTb * 10 / 0.35) : null;
      if (this.fmax > 0) return byScope || 2.5 / this.fmax;
      if (this.hasClock) return 1;
      if (this.mode === 'lock') return byScope || 1;
      return 1;
    }

    /** lockstep 한 단계 */
    stepLock() {
      const t1 = this.t + this.dt;
      this.dig.runUntil(t1);
      this.updateBridges();
      const a = this.analog;
      a.t = this.t;
      a.advance(this.dt, 0);
      this.t = t1;
      a.t = t1;
      this.updateAD(false);
      this.dig.flush();
      if (a.warn) this.warn = a.warn;
      this.emit();
    }
    /** event / digital 모드 한 구간 */
    stepEvent(h) {
      const t1 = this.t + h;
      const ok = this.dig.runUntil(t1);
      this.t = this.dig.t;
      if (this.analog) this.analog.t = this.t;
      this.emit();
      return ok;
    }
    /**
     * 시뮬레이션 시간 simDt 만큼 진행 (시간 예산 budgetMs 를 넘으면 멈춘다). 실제로 진행한 시간을 돌려준다
     */
    run(simDt, budgetMs) {
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t0 = now(), tStart = this.t;
      budgetMs = budgetMs || 12;
      if (this.mode === 'lock') {
        const want = simDt + (this.carry || 0);
        const steps = Math.floor(want / this.dt);
        this.carry = want - steps * this.dt;
        for (let k = 0; k < steps; k++) {
          this.stepLock();
          if ((k & 7) === 7 && now() - t0 > budgetMs) { this.carry = 0; break; }
        }
      } else {
        const n = 32, h = simDt / n;
        for (let k = 0; k < n; k++) {
          if (!this.stepEvent(h)) break;
          if ((k & 3) === 3 && now() - t0 > budgetMs) break;
        }
      }
      if (this.analog && this.analog.visualDirty) { this.analog.visualDirty = false; this.visualDirty = true; }
      return this.t - tStart;
    }
    /** 조합 회로 · 아날로그가 안정될 때까지 */
    settle(maxT) {
      if (this.mode === 'lock') {
        const T = maxT != null ? maxT : parseNum(this.opts.settle, Math.max(this.dt * 50, 2e-3));
        const n = Math.min(200000, Math.ceil(T / this.dt));
        for (let k = 0; k < n; k++) this.stepLock();
      } else {
        this.dig.settle(maxT || 1e-5);
        this.t = this.dig.t;
        if (this.analog) this.analog.t = this.t;
      }
    }
    /** 부품 값 · 스위치가 바뀐 뒤 (행렬 다시) */
    invalidate() {
      if (this.analog) { this.analog.invalidate(); this.analogDirty = true; }
      if (this.mode === 'event') { this.dig.runUntil(this.t); }
    }

    emit() { if (this.listeners.size) this.listeners.forEach((f) => f(this)); }
    onStep(f) { this.listeners.add(f); return () => this.listeners.delete(f); }

    // ---------------------------------------------------------------- 조작
    comp(el) { return this.comps.find((c) => c.el === el); }
    /** 스위치 누르기 (아날로그 S · SPDT, 디지털 SW · 수동 CLK) */
    toggle(el) {
      if (el.type === 'S') { el.params.on = +el.params.on ? 0 : 1; this.invalidate(); return true; }
      if (el.type === 'SPDT') { el.params.pos = +el.params.pos ? 0 : 1; this.invalidate(); return true; }
      const c = this.comp(el);
      if (!c) return false;
      if (c.type === 'SW') { this.dig.toggle(c); if (c.s.on) el.params.on = 1; else delete el.params.on; return true; }
      if (c.type === 'CLK') {
        if (String(el.params.run) === '0') this.dig.toggle(c); else this.dig.setClockRun(c, !c.running);
        return true;
      }
      return false;
    }
    press(el, down) {
      if (el.type === 'PB') { el.params.on = down ? 1 : 0; this.invalidate(); return true; }
      const c = this.comp(el);
      if (c && c.type === 'BTN') { this.dig.press(c, down); return true; }
      return false;
    }
    setDip(el, val) { const c = this.comp(el); if (c) { this.dig.setDip(c, val); if (c.s.val) el.params.val = String(c.s.val); else delete el.params.val; } }
    /** 속성 값이 바뀐 부품 (가변저항 위치 · ADC 입력 · 클럭 주파수 …) */
    partChanged(el) {
      if (isAnalog(el.type)) { this.invalidate(); return; }
      const c = this.comp(el);
      if (!c) return;
      if (el.type === 'ADC') this.dig.setAdc(c, parseNum(el.params.vin, 2.5));
      if (el.type === 'CLK') this.dig.setClockFreq(c, parseNum(el.params.freq, 1) || 1);
    }
    stepClock() {
      const d = this.dig;
      const clocks = this.comps.filter((c) => c.type === 'CLK');
      if (!clocks.length) return false;
      const run = clocks.filter((c) => c.running);
      if (run.length) {
        const e0 = d.edges;
        const limit = this.t + 2 / Math.min(...run.map((c) => c.f));
        let guard = 0;
        while (d.edges === e0 && this.t < limit && guard++ < 1e6) {
          if (this.mode === 'lock') this.stepLock();
          else { const next = Math.min(limit, d.nextEventT()); this.stepEvent(Math.max(next - this.t, 1e-12)); }
        }
        this.settle(this.mode === 'lock' ? this.dt * 20 : 1e-5);
        return true;
      }
      clocks.forEach((c) => { if (c.s.v) { c.s.v = L0; d.setOut(c, 0, L0); } });
      d.runUntil(d.t); this.settle(this.mode === 'lock' ? this.dt * 20 : 1e-5);
      clocks.forEach((c) => { c.s.v = L1; d.edges++; d.setOut(c, 0, L1); });
      d.runUntil(d.t); this.settle(this.mode === 'lock' ? this.dt * 20 : 1e-5);
      return true;
    }

    // ---------------------------------------------------------------- 값 읽기
    /** 넷 전압: 아날로그 넷은 마디 전압, 디지털 넷은 논리값 × VDD (Z 는 NaN) */
    netV(n) {
      if (n == null || n < 0) return 0;
      const net = this.nets[n];
      if (!net) return NaN;
      if (net.analog) return this.analog ? this.analog.nv(net.node) : 0;
      return net.v === L1 ? this.vdd : net.v === L0 ? 0 : net.v === LX ? this.vdd / 2 : NaN;
    }
    netL(n) { if (n == null || n < 0) return L0; const net = this.nets[n]; return net ? net.v : LZ; }
    nv(node) { return this.analog ? this.analog.nv(node) : 0; }
    netOfPoint(x, y) { const k = this.ptIndex.get(x + ',' + y); return k == null ? -1 : this.ptNet[k]; }
    pointVoltage(x, y) { const n = this.netOfPoint(x, y); return n < 0 ? null : this.netV(n); }
    /** 측정점 · 이름표 이름 → 넷 ('GND' = 접지) */
    probeNet(label) {
      label = String(label);
      const pr = this.probes.find((p) => p.label === label);
      if (pr) return pr.net;
      if (label === 'GND' || label === '0') return this.gndNet;
      const n = this.nets.find((q) => q.names.indexOf(label) >= 0);
      return n ? n.id : -2;
    }
    /** 이름 → 넷 (측정점, 이름표, 부품 이름, '단자(부품)') */
    netByName(name) {
      name = String(name).trim();
      const m = /^([~\w<>=+-]+)\((\w+)\)$/.exec(name);
      if (m) {
        const el = this.findEl(m[2]);
        if (!el) return null;
        const k = el._pl.findIndex((q) => q.n === m[1] || q.n === '~' + m[1] || q.lbl === m[1]);
        return k >= 0 ? this.ptNet[el._pins[k]] : null;
      }
      const pn = this.probeNet(name);
      if (pn >= -1 && pn !== -2) return pn;
      const c = this.byName[name];
      if (c) { if (c.outs.length) return c.outs[0]; if (c.ins.length) return c.ins[0]; }
      return null;
    }
    findEl(name) { return this.els.find((e) => e.name === name); }

    /** 소자 단자별 전류 (단자로 들어가는 방향) */
    pinCurrents(el) {
      if (isAnalog(el.type)) return this.analog ? this.analog.pinCurrents(el) : el._pins.map(() => 0);
      const out = el._pins.map(() => 0);
      if (!isDigital(el.type) || !this.analog) return out;
      for (const b of this.bridges) {
        if (b.c.el !== el || b.z) continue;
        const k = el._pl.indexOf(b.pin);
        if (k < 0) continue;
        out[k] = -b.g * (b.v - this.analog.nv(b.node));
      }
      return out;
    }
    /** 도선 조각의 전류 (KCL 을 신장 트리로 풀기). 각 소자의 핀 전류도 저장 */
    computeCurrents() {
      const inj = new Float64Array(this.pts.length);
      this.els.forEach((el) => {
        if (el.type === 'W') return;
        const ic = this.pinCurrents(el);
        el._ic = ic;
        el._pins.forEach((pt, k) => { inj[pt] += ic[k] || 0; });
      });
      const adj = this.pts.map(() => []);
      this.segs.forEach((s, k) => { s.i = 0; adj[s.a].push(k); adj[s.b].push(k); });
      const seen = new Uint8Array(this.pts.length);
      const order = [], parentSeg = new Int32Array(this.pts.length).fill(-1);
      for (let r = 0; r < this.pts.length; r++) {
        if (seen[r] || !adj[r].length) continue;
        const stack = [r];
        seen[r] = 1;
        while (stack.length) {
          const u = stack.pop();
          order.push(u);
          adj[u].forEach((k) => {
            const s = this.segs[k];
            const w = s.a === u ? s.b : s.a;
            if (seen[w]) return;
            seen[w] = 1;
            parentSeg[w] = k;
            stack.push(w);
          });
        }
      }
      const acc = Float64Array.from(inj);
      for (let k = order.length - 1; k >= 0; k--) {
        const u = order[k];
        const ps = parentSeg[u];
        if (ps < 0) continue;
        const s = this.segs[ps];
        const parent = s.a === u ? s.b : s.a;
        s.i = s.a === parent ? acc[u] : -acc[u];
        acc[parent] += acc[u];
      }
    }

    /** 소자 정보 (측정 표시용) */
    info(el) {
      if (isAnalog(el.type)) return this.analog.info(el);
      const c = this.comp(el);
      const out = { name: el.name || '', type: el.type };
      if (!c) return out;
      out.value = this.dig.compValue(c);
      return out;
    }

    /** 측정식: V(A), V(A,B), I(R1), P(R1), VBE(Q1) …, L(A) = 논리값 */
    evalExpr(expr) {
      const m = /^([A-Za-z]+)\(([^,)]*)(?:,([^)]*))?\)$/.exec(String(expr).trim());
      if (!m) return NaN;
      const f = m[1].toUpperCase(), a = m[2].trim(), bb = (m[3] || '').trim();
      const nodeV = (lab) => { const n = this.probeNet(lab); return n === -2 ? NaN : this.netV(n); };
      if (f === 'R') {
        const na = this.probeNet(a), nb = bb ? this.probeNet(bb) : this.gndNet;
        return this.measureResistance(na, nb);
      }
      if (f === 'L') { const n = this.netByName(a); return n == null ? NaN : this.netL(n); }
      if (f === 'V') {
        if (!bb) { const n = this.probeNet(a); if (n !== -2) return this.netV(n); const el = this.findEl(a); return el && isAnalog(el.type) ? this.info(el).v : NaN; }
        return nodeV(a) - nodeV(bb);
      }
      const el = this.findEl(a);
      if (!el || !isAnalog(el.type)) return NaN;
      const inf = this.info(el);
      const map = { I: 'i', P: 'p', VBE: 'vbe', VCE: 'vce', IB: 'ib', IC: 'ic', IE: 'ie', ID: 'id', VGS: 'vgs', VDS: 'vds', VOUT: 'vout', VIN: 'vin',
        IIN: 'iin', PIN: 'pin', POUT: 'pout', DUTY: 'duty', VREF: 'vref' };
      const key = map[f];
      if (!key) return NaN;
      let val = inf[key];
      if (f === 'I' && el.type === 'Q') val = inf.ic;
      if (f === 'I' && (el.type === 'M' || el.type === 'J')) val = inf.id;
      return val;
    }
    /** 두 넷 사이 저항 (Ω) — 아날로그 넷끼리만 */
    measureResistance(na, nb) {
      if (!this.analog) return NaN;
      const node = (n) => (n == null || n < 0 ? 0 : this.nets[n] && this.nets[n].analog ? this.nets[n].node : -1);
      const a = node(na), b = node(nb);
      if (a < 0 || b < 0) return NaN;
      return this.analog.measureResistance(a, b);
    }

    /** 이름으로 값 읽기 (검사식 · 진리표): 디지털 부품 대표값, 측정점 · 이름표의 논리값 */
    read(name) {
      const m = /^([~\w<>=+-]+)\((\w+)\)$/.exec(name);
      if (m) { const n = this.netByName(name); return n == null ? undefined : this.netL(n); }
      const c = this.byName[name];
      if (c) return this.dig.compValue(c);
      const pn = this.probeNet(name);
      if (pn >= 0) return this.netL(pn);
      return undefined;
    }
    /** 이름으로 입력 값 설정 */
    set(name, v) {
      const c = this.byName[name];
      if (c) {
        const d = this.dig;
        if (c.type === 'SW') { c.s.on = !!v; d.poke(c); return true; }
        if (c.type === 'BTN') { c.s.down = !!v; d.poke(c); return true; }
        if (c.type === 'DIP') { d.setDip(c, v); return true; }
        if (c.type === 'ADC') { d.setAdc(c, v); return true; }
        if (c.type === 'CLK') { c.running = false; c.s.v = v ? L1 : L0; if (v) d.edges++; d.setOut(c, 0, c.s.v); d.runUntil(d.t); return true; }
        return false;
      }
      const el = this.findEl(name);
      if (!el) return false;
      if (el.type === 'S' || el.type === 'PB') { el.params.on = v ? 1 : 0; this.invalidate(); return true; }
      if (el.type === 'SPDT') { el.params.pos = v ? 1 : 0; this.invalidate(); return true; }
      if (el.type === 'POT') { el.params.pos = Math.max(0, Math.min(1, +v)); this.invalidate(); return true; }
      if (el.type === 'V') { el.params.v = +v; this.invalidate(); return true; }
      return false;
    }
    inputsList() { return this.comps.filter((c) => ['SW', 'BTN', 'DIP', 'CLK', 'ADC'].indexOf(c.type) >= 0); }
    outputsList() { return this.comps.filter((c) => ['DLED', 'LEDS', 'HEX', 'SEG', 'DAC'].indexOf(c.type) >= 0); }
  }

  // ================================================================= 진리표
  function truthTable(circ, cfg) {
    cfg = cfg || {};
    const sim = new Sim(circ);
    const inNames = cfg.in ? String(cfg.in).split(',') : sim.comps.filter((c) => c.type === 'SW' || c.type === 'DIP').map((c) => c.name);
    const outNames = cfg.out ? String(cfg.out).split(',')
      : sim.comps.filter((c) => ['DLED', 'LEDS', 'HEX', 'SEG', 'DAC'].indexOf(c.type) >= 0).map((c) => c.name).concat(sim.probes.map((p) => p.label));
    const width = inNames.map((n) => { const c = sim.byName[n]; return c && c.type === 'DIP' ? c.n : 1; });
    const total = width.reduce((a, b) => a + b, 0);
    if (!inNames.length || total > 8) return { error: !inNames.length ? '논리 입력 스위치(SW · DIP)가 없습니다' : `입력 비트가 너무 많습니다 (${total}비트)`, inNames, outNames };
    const rows = [];
    for (let v = 0; v < (1 << total); v++) {
      let shift = total;
      const ins = inNames.map((n, i) => { shift -= width[i]; return (v >> shift) & ((1 << width[i]) - 1); });
      ins.forEach((x, i) => sim.set(inNames[i], x));
      sim.settle();
      rows.push({ ins, outs: outNames.map((n) => sim.read(n)) });
    }
    return { inNames, outNames, width, rows, seq: sim.hasSeq };
  }

  // ================================================================= 검사식
  const VCH = D.VCH;
  function valText(v) { return v == null ? '?' : typeof v === 'number' && v > 1 ? String(v) : (VCH[v] != null ? VCH[v] : String(v)); }
  function parseExpect(s) {
    s = String(s).trim();
    if (/^[xX]$/.test(s)) return LX;
    if (/^[zZ]$/.test(s)) return LZ;
    const v = parseNum(s, NaN);
    return isFinite(v) ? v : s;
  }
  const isDigitalCheck = (t) => /->/.test(t) || /^reset$/i.test(t.trim()) || /(^|\s)clk=\d/.test(t);
  function kvTokens(s) {
    return tokenize(s).filter((t) => typeof t === 'string' && t.indexOf('=') > 0).map((t) => { const i = t.indexOf('='); return { k: t.slice(0, i), v: t.slice(i + 1) }; });
  }

  /** 디지털식 검사: "! A=1 B=0 -> Y=1", "! clk=3 -> Q=3", "! t=2 -> Q=1", "! reset" */
  function runDigitalChecks(circ) {
    const results = [];
    let sim = new Sim(circ);
    sim.settle();
    for (const ck of circ.checks) {
      const txt = ck.text;
      if (!isDigitalCheck(txt)) continue;
      if (/^reset$/i.test(txt.trim())) { sim = new Sim(circ); sim.settle(); continue; }
      const [lhs, rhs] = txt.indexOf('->') >= 0 ? txt.split('->') : ['', txt];
      let err = null;
      for (const s of kvTokens(lhs)) {
        if (s.k === 't') {
          const T = parseNum(s.v);
          if (sim.mode === 'lock') { const n = Math.round(T / sim.dt); for (let k = 0; k < n; k++) sim.stepLock(); }
          else { const end = sim.t + T; let g = 0; while (sim.t < end - 1e-15 && g++ < 1000) sim.stepEvent(end - sim.t); }
        }
        else if (s.k === 'clk') { for (let i = 0; i < parseNum(s.v); i++) sim.stepClock(); }
        else if (!sim.set(s.k, parseExpect(s.v))) err = `입력 '${s.k}' 를 찾을 수 없습니다`;
      }
      sim.settle();
      const fails = [];
      const rt = kvTokens(rhs);
      let tol = 0.03, abs = 1e-3;
      rt.forEach((t) => { if (t.k === 'tol') tol = parseFloat(t.v) / (/%$/.test(t.v) ? 100 : 1); if (t.k === 'abs') abs = parseNum(t.v); });
      rt.filter((t) => t.k !== 'tol' && t.k !== 'abs').forEach((t) => {
        let got = /^[A-Za-z]+\(/.test(t.k) && !/^[~\w<>=+-]+\(\w+\)$/.test(t.k) ? undefined : sim.read(t.k);
        const want = parseExpect(t.v);
        const analogExpr = /^(V|I|P|VBE|VCE|IB|IC|IE|ID|VGS|VDS|VOUT|VIN|R)\(/i.test(t.k);
        if (analogExpr) got = sim.evalExpr(t.k);
        else if (got === undefined) { const x = sim.evalExpr(t.k); if (isFinite(x)) got = x; }
        if (got === undefined) fails.push(`'${t.k}' 없음`);
        else if (analogExpr) { if (!(Math.abs(got - want) <= Math.max(Math.abs(want) * tol, abs))) fails.push(`${t.k}=${fmt(got, '')} (기대 ${t.v})`); }
        else if (got !== want && !(typeof want === 'string' && String(got) === want)) fails.push(`${t.k}=${valText(got)} (기대 ${t.v})`);
      });
      results.push({ line: ck.line, text: txt, ok: !err && !fails.length, msg: err || fails.join(', ') });
    }
    return results;
  }

  /** 아날로그식 검사: "! t=10m V(A)=2.5 I(R1)=1m tol=5%", 통계식 VPP() VRMS() … */
  function parseAnalogCheck(text, line) {
    const c = { line, t: null, items: [], tol: 0.03 };
    tokenize(text).forEach((t) => {
      if (typeof t !== 'string') return;
      const m = /^([A-Za-z]+\([^)]*\))\s*=\s*(.+)$/.exec(t);
      if (m) { c.items.push({ expr: m[1], value: parseNum(m[2]) }); return; }
      const eq = t.indexOf('=');
      if (eq > 0) {
        const k = t.slice(0, eq), v = t.slice(eq + 1);
        if (k === 't') c.t = parseNum(v);
        else if (k === 'tol') c.tol = parseFloat(v) / (/%$/.test(v) ? 100 : 1);
        else if (k === 'abs') c.abs = parseNum(v);
      }
    });
    return c;
  }
  function runAnalogChecks(circ) {
    const checks = circ.checks.filter((c) => !isDigitalCheck(c.text)).map((c) => parseAnalogCheck(c.text, c.line));
    checks.forEach((c) => { c.items = c.items.filter((it) => !/^(GAIN|PHASE)\(/i.test(it.expr)); });
    for (let i = checks.length - 1; i >= 0; i--) if (!checks[i].items.length) checks.splice(i, 1);
    const out = [];
    if (!checks.length) return out;
    const sim = new Sim(circ);
    const step = sim.mode === 'lock' ? sim.dt : Math.max(sim.dt, 1e-6);
    const tEnd = Math.max(...checks.map((c) => c.t || 0), sim.fmax > 0 ? 6 / sim.fmax : step * 50);
    const steps = Math.min(2e6, Math.ceil(tEnd / step));
    const statOf = (expr) => {
      const m = /^(VPP|VRMS|VAVG|VMAX|VMIN|VAC|IPP|IRMS|IAVG|IMAX|IMIN|IAC)\((.*)\)$/i.exec(expr);
      return m ? { kind: m[1].toUpperCase(), inner: (m[1][0].toUpperCase() === 'I' ? 'I(' : 'V(') + m[2] + ')' } : null;
    };
    const all = [];
    checks.forEach((c) => c.items.forEach((it) => all.push(it)));
    const statItems = all.map((it) => ({ it, s: statOf(it.expr) })).filter((x) => x.s);
    const stats = {};
    for (let k = 0; k < steps; k++) {
      if (sim.mode === 'lock') sim.stepLock(); else sim.stepEvent(step);
      if (k >= steps / 2) {
        statItems.forEach(({ it, s }) => {
          const v = sim.evalExpr(s.inner);
          const st = stats[it.expr] || (stats[it.expr] = { min: Infinity, max: -Infinity, sum: 0, sq: 0, n: 0 });
          st.min = Math.min(st.min, v); st.max = Math.max(st.max, v); st.sum += v; st.sq += v * v; st.n++;
        });
      }
      checks.forEach((c) => {
        if (c.t != null && !c.done && sim.t >= c.t - step / 2) {
          c.done = true;
          c.items.forEach((it) => { if (!statOf(it.expr)) it.got = sim.evalExpr(it.expr); });
        }
      });
    }
    checks.forEach((c) => c.items.forEach((it) => {
      const s = statOf(it.expr);
      if (s) {
        const st = stats[it.expr];
        const kind = s.kind.slice(1);
        const mean = st.sum / st.n;
        it.got = kind === 'PP' ? st.max - st.min : kind === 'RMS' ? Math.sqrt(st.sq / st.n) : kind === 'AVG' ? mean
          : kind === 'AC' ? Math.sqrt(Math.max(0, st.sq / st.n - mean * mean)) : kind === 'MAX' ? st.max : st.min;
      } else if (it.got == null) it.got = sim.evalExpr(it.expr);
      const tol = Math.max(Math.abs(it.value) * c.tol, c.abs != null ? c.abs : 1e-9);
      const ok = isFinite(it.got) && Math.abs(it.got - it.value) <= tol;
      out.push({ line: c.line, text: `${it.expr}=${it.value}`, ok, msg: ok ? '' : `${it.expr} = ${fmt(it.got, '')} (기대 ${it.value})` });
    }));
    return out;
  }
  // ================================================================= 주파수 응답 (보드 선도)
  /**
   * 교류 전원의 주파수를 바꿔 가며 과도 해석으로 이득 · 위상을 잰다 (비선형 · 능동 회로도 그대로).
   *   한 주기를 N 단계로 나누어 입력 · 출력의 기본파 성분(푸리에)을 구하고, 주기마다 값이 더 이상 변하지 않으면(정상 상태) 멈춘다.
   * cfg: { src: 교류 전원 이름, in: 입력 측정점(없으면 전원 전압), out: 출력 측정점 · V(a,b) }
   */
  function bodeTargets(circ, cfg) {
    const own = {};
    Object.keys(cfg || {}).forEach((k) => { if (cfg[k] != null && cfg[k] !== '') own[k] = cfg[k]; });
    cfg = Object.assign({}, circ.bode || {}, own);
    const acs = circ.elements.filter((e) => e.type === 'AC');
    const src = cfg.src ? circ.elements.find((e) => e.name === cfg.src) : acs[0];
    const probes = circ.elements.filter((e) => e.type === 'P').map((e) => String(e.params.label));
    const out = cfg.out || (probes.indexOf('OUT') >= 0 ? 'OUT' : probes[probes.length - 1]);
    return { src, srcName: src && src.name, inp: cfg.in || null, out, fmin: cfg.fmin != null ? parseNum(cfg.fmin) : null, fmax: cfg.fmax != null ? parseNum(cfg.fmax) : null, points: cfg.points != null ? +cfg.points : null };
  }
  function measureFreq(text, cfg, f) {
    const circ = parse(text);
    const tg = bodeTargets(circ, cfg);
    if (!tg.src) return { f, error: '교류 전원(AC)이 없습니다' };
    const N = 128;
    tg.src.params.freq = f;
    tg.src.params.wave = 'sine';
    circ.opts = Object.assign({}, circ.opts, { dt: String(1 / (f * N)) });
    const sim = new Sim(circ);
    if (sim.mode !== 'lock') return { f, error: '시간 진행 모드가 아닙니다' };
    const sEl = sim.findEl(tg.srcName);
    const nP = sim.ptNet[sEl._pins[1]], nM = sim.ptNet[sEl._pins[0]];
    const ref = (s) => {
      const m = /^V\(([^,)]+)(?:,([^)]+))?\)$/i.exec(s);
      const a = sim.netByName(m ? m[1].trim() : s), b = m && m[2] ? sim.netByName(m[2].trim()) : sim.gndNet;
      return a == null || a < -1 || b == null || b < -1 ? null : [a, b];
    };
    const ni = tg.inp ? ref(tg.inp) : [nP, nM];
    const no = ref(tg.out || '');
    if (!ni || !no) return { f, error: '입력 · 출력 측정점을 찾을 수 없습니다' };
    const w = 2 * Math.PI * f;
    let prev = null, H = null, cyc = 0, vin = 0;
    const maxCyc = 400;
    for (; cyc < maxCyc; cyc++) {
      let ir = 0, ii = 0, or = 0, oi = 0;
      for (let k = 0; k < N; k++) {
        sim.stepLock();
        const ph = w * sim.t, c = Math.cos(ph), s = Math.sin(ph);
        const vi = sim.netV(ni[0]) - sim.netV(ni[1]), vo = sim.netV(no[0]) - sim.netV(no[1]);
        ir += vi * c; ii -= vi * s; or += vo * c; oi -= vo * s;
      }
      const d = ir * ir + ii * ii;
      if (d < 1e-30) return { f, error: '입력 신호가 0 입니다' };
      H = [(or * ir + oi * ii) / d, (oi * ir - or * ii) / d];
      vin = 2 * Math.sqrt(d) / N;
      if (prev && cyc >= 2) {
        const e = Math.hypot(H[0] - prev[0], H[1] - prev[1]);
        if (e < 2e-4 * Math.hypot(H[0], H[1]) + 1e-7) break;
      }
      prev = H;
    }
    const mag = Math.hypot(H[0], H[1]);
    return { f, mag, db: 20 * Math.log10(Math.max(mag, 1e-12)), phase: Math.atan2(H[1], H[0]) * 180 / Math.PI, cycles: cyc + 1, vin };
  }
  class FreqResponse {
    constructor(text, cfg) {
      this.text = typeof text === 'string' ? text : serialize(text);
      const circ = parse(this.text);
      this.tg = bodeTargets(circ, cfg);
      const f0 = this.tg.src ? +this.tg.src.params.freq || 1000 : 1000;
      this.fmin = this.tg.fmin || f0 / 100;
      this.fmax = this.tg.fmax || f0 * 100;
      const n = this.tg.points || Math.max(12, Math.round(Math.log10(this.fmax / this.fmin) * 12) + 1);
      this.freqs = Array.from({ length: n }, (_, i) => this.fmin * Math.pow(this.fmax / this.fmin, i / (n - 1)));
      this.points = [];
      this.error = this.tg.src ? '' : '교류 전원(AC)이 없습니다';
    }
    get done() { return !!this.error || this.points.length >= this.freqs.length; }
    /** 한 주파수를 잰다. 끝났으면 false */
    next() {
      if (this.done) return false;
      const r = measureFreq(this.text, { src: this.tg.srcName, in: this.tg.inp, out: this.tg.out }, this.freqs[this.points.length]);
      if (r.error) { this.error = r.error; return false; }
      // 위상을 이어지게 (−180 ↔ +180 뛰기 없애기)
      const last = this.points[this.points.length - 1];
      if (last) { while (r.phase - last.phase > 180) r.phase -= 360; while (r.phase - last.phase < -180) r.phase += 360; }
      this.points.push(r);
      return true;
    }
    run() { while (this.next()); return this; }
    /** 최대 이득과 −3 dB 주파수들 */
    summary() {
      const p = this.points;
      if (!p.length) return null;
      let mx = p[0];
      p.forEach((q) => { if (q.db > mx.db) mx = q; });
      const lvl = mx.db - 3.0103;
      const cross = [];
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], b = p[i];
        if ((a.db - lvl) * (b.db - lvl) < 0) {
          const t = (lvl - a.db) / (b.db - a.db);
          cross.push(Math.exp(Math.log(a.f) + t * (Math.log(b.f) - Math.log(a.f))));
        }
      }
      return { peak: mx, f3db: cross };
    }
  }

  /** GAIN(f)=dB · PHASE(f)=도 검사 */
  function runBodeChecks(text) {
    const circ = parse(text);
    const out = [];
    circ.checks.filter((c) => !isDigitalCheck(c.text)).forEach((ck) => {
      const c = parseAnalogCheck(ck.text, ck.line);
      c.items.forEach((it) => {
        const m = /^(GAIN|PHASE)\(([^)]+)\)$/i.exec(it.expr);
        if (!m) return;
        const [fs, outName] = m[2].split(',').map((s) => s.trim());
        const r = measureFreq(text, outName ? { out: outName } : null, parseNum(fs));
        const got = r.error ? NaN : m[1].toUpperCase() === 'GAIN' ? r.db : r.phase;
        const tol = c.abs != null ? c.abs : m[1].toUpperCase() === 'GAIN' ? 0.3 : 3;
        const ok = isFinite(got) && Math.abs(got - it.value) <= tol;
        out.push({ line: ck.line, text: `${it.expr}=${it.value}`, ok, msg: ok ? '' : `${it.expr} = ${r.error || got.toFixed(2)} (기대 ${it.value})` });
      });
    });
    return out;
  }

  function runChecks(text) {
    if (typeof text !== 'string') text = serialize(text);
    const circ = parse(text);
    if (circ.errors.length) return { errors: circ.errors, results: [] };
    // 검사가 부품 값을 바꾸므로(V1=12 …) 따로 파싱한 회로로 돌린다
    return { errors: [], results: runDigitalChecks(circ).concat(runAnalogChecks(parse(text)), runBodeChecks(text)) };
  }

  const api = {
    TYPES, NAME_PREFIX, parse, serialize, serializeEl, tokenize, autoName, pins, pinList, boundsOf, isDigital, isAnalog,
    Sim, truthTable, runChecks, FreqResponse, measureFreq, valText, parseNum, siText, fmt, L0, L1, LX, LZ, VCH,
    A, D, waveValue: A.waveValue, LED_RGB: A.LED_RGB, lampR: A.lampR, PIN_NAMES: A.PIN_NAMES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CircuitSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
