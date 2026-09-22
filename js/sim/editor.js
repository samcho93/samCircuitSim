/* 회로 편집기
 *  - 부품 목록(검색 · 접기)에서 골라 놓기, 도선 긋기, 선택 · 이동 · 늘이기 · 회전 · 반전 · 삭제 · 복사
 *  - 속성 편집 (아날로그 값 4.7k · 100u / 디지털 옵션), 되돌리기/다시 하기, 확대 · 축소 · 이동
 *  편집하는 동안에도 시뮬레이션은 계속 돈다 (구조가 바뀌면 회로를 다시 만든다)
 */
(function () {
  'use strict';
  const CS = window.CircuitSim;
  const D = CS.D;
  const G = CircuitView.GRID;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const on = (v) => v === 1 || v === '1' || v === true || v === 'true';
  const isDig = (t) => CS.isDigital(t);
  const isP = (t) => CS.TYPES[t] && CS.TYPES[t].kind === 'p';

  // ================================================================= 부품 목록
  const it = (type, name, extra) => Object.assign({ key: type, type, name }, extra || {});
  const PALETTE = [
    ['basic', '기본', [it('W', '도선', { hot: 'W' }), it('G', '접지', { hot: 'G' }), it('P', '측정점', { hot: 'P' }), it('N', '이름표 (연결)'), it('TXT', '글자')]],
    ['src', '전원 · 신호', [it('V', '직류 전원', { hot: 'B' }), it('AC', '교류 전원'), { key: 'FG', type: 'AC', name: '구형파 발생기', params: { wave: 'square', amp: 2.5, dc: 2.5, freq: 1000 } },
      it('I', '전류원'), it('HI', '논리 1 / VCC'), it('LO', '논리 0 / GND')]],
    ['pas', '수동 소자', [it('R', '저항', { hot: 'R' }), it('POT', '가변저항'), it('C', '콘덴서', { hot: 'C' }), { key: 'CE', type: 'C', name: '전해 콘덴서', params: { c: 100e-6, pol: 1 } },
      it('L', '코일', { hot: 'L' }), it('X', '변압기'), it('LAMP', '전구')]],
    ['swt', '스위치 · 보호', [it('S', '스위치', { hot: 'S' }), it('PB', '푸시 버튼'), it('SPDT', '전환 스위치'), it('RLY', '릴레이'), it('FUSE', '퓨즈')]],
    ['semi', '반도체', [it('D', '다이오드', { hot: 'D' }), it('Z', '제너'), it('LED', 'LED'), { key: 'QN', type: 'Q', name: 'NPN', hot: 'T' }, { key: 'QP', type: 'Q', name: 'PNP', params: { pnp: 1, f: 1 } },
      { key: 'MN', type: 'M', name: 'N-MOSFET' }, { key: 'MP', type: 'M', name: 'P-MOSFET', params: { p: 1, f: 1 } }, it('J', 'JFET')]],
    ['aic', '아날로그 IC · 계측', [it('OA', 'OP앰프', { hot: 'O' }), it('CMPR', '비교기'), it('T555', '555 타이머'), it('ASW', '아날로그 스위치'), it('AM', '전류계'), it('VM', '전압계')]],
    ['conv', 'A/D · D/A 변환', [it('ADC', 'A/D 변환기'), it('DAC', 'D/A 변환기')]],
    ['din', '디지털 입력', [it('SW', '토글 스위치'), it('BTN', '푸시 버튼'), it('CLK', '클럭', { hot: 'K' }), it('DIP', 'DIP 스위치'), it('PU', '풀업'), it('PD', '풀다운')]],
    ['dout', '디지털 출력', [it('DLED', '로직 LED'), it('LEDS', 'LED 막대'), it('HEX', '16진 표시'), it('SEG', '7세그먼트')]],
    ['gate', '논리 게이트', [it('NOT', 'NOT', { hot: 'N' }), it('BUF', '버퍼'), it('AND', 'AND', { hot: 'A' }), it('OR', 'OR'), it('NAND', 'NAND'), it('NOR', 'NOR'), it('XOR', 'XOR'), it('XNOR', 'XNOR'), it('TBUF', '3상태 버퍼')]],
    ['comb', '조합 회로', [it('HA', '반가산기'), it('FA', '전가산기'), it('ADD', '가산기'), it('CMP', '크기 비교기'), it('ALU', 'ALU'), it('MUX', 'MUX'), it('DEMUX', 'DEMUX'), it('DEC', '디코더'), it('ENC', '인코더'), it('BCD7', 'BCD→7세그')]],
    ['seq', '플립플롭 · 래치', [it('SRL', 'SR 래치'), it('DL', 'D 래치'), it('DFF', 'D FF'), it('JKFF', 'JK FF'), it('TFF', 'T FF'), it('SRFF', 'SR FF')]],
    ['reg', '레지스터 · 카운터', [it('REG', '레지스터'), it('SHR', '시프트 레지스터'), it('CNT', '카운터')]],
    ['mem', '메모리', [it('ROM', 'ROM'), it('RAM', 'RAM')]]
  ];
  const PAL = {};
  PALETTE.forEach(([, , items]) => items.forEach((x) => { PAL[x.key] = x; }));
  const ICON_PARAMS = { DIP: { n: 3 }, ADC: { n: 2 }, LEDS: { n: 4 }, ADD: { n: 2 }, CMP: { n: 2 }, ALU: { n: 2 }, REG: { n: 2 }, SHR: { n: 2 }, CNT: { n: 2 },
    ROM: { a: 2, d: 2 }, RAM: { a: 1, d: 2 }, DAC: { n: 3 }, DEC: { bits: 2 }, ENC: { bits: 2 }, MUX: { sel: 1 } };

  /** 부품 목록 아이콘 */
  function iconSvg(x) {
    if (x.type === 'W') return '<svg viewBox="-6 -14 92 28"><line x1="0" y1="0" x2="80" y2="0" stroke="var(--sch-wire)" stroke-width="4" stroke-linecap="round"/><circle cx="0" cy="0" r="4" fill="var(--sch-fg)"/><circle cx="80" cy="0" r="4" fill="var(--sch-fg)"/></svg>';
    if (x.type === 'TXT') return '<svg viewBox="0 0 60 36"><text x="30" y="26" text-anchor="middle" font-size="24" font-weight="800" fill="var(--sch-fg)">Aa</text></svg>';
    const el = sample(x, 0, 0);
    if (isDig(x.type)) {
      Object.assign(el.params, ICON_PARAMS[x.type] || {});
      const b = D.boundsOf(el);
      const lay = D.localLayout(el);
      const top = lay && lay.box ? 1.1 : 0.35;
      const d = CircuitView.drawEl(el, { names: false, iec: CircuitView.iec });
      const vb = [(b.x0 - 0.35) * G, (b.y0 - top) * G, (b.x1 - b.x0 + 0.7) * G, (b.y1 - b.y0 + top + 0.35) * G].map((v) => Math.round(v)).join(' ');
      return `<svg viewBox="${vb}" class="cv still">${d.body}</svg>`;
    }
    const d = CircuitView.drawEl(el, { names: false, iec: CircuitView.iec });
    const leads = d.leads.map((l) => `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" stroke="var(--sch-wire)" stroke-width="3"/>`).join('');
    let vb = '-6 -30 92 60';
    if (x.type === 'G') vb = '-30 -8 60 36';
    if (x.type === 'P') vb = '-14 -22 60 36';
    if (x.type === 'N') vb = '-6 -16 50 32';
    if (['Q', 'M', 'J'].includes(x.type)) vb = '-6 -46 64 92';
    if (x.type === 'OA') vb = '-4 -42 88 84';
    if (x.type === 'X') vb = '-6 -8 92 96';
    if (x.type === 'ASW') vb = '-6 -46 92 60';
    if (x.type === 'RLY') vb = '-20 -8 136 96';
    if (x.type === 'SPDT' || x.type === 'POT') vb = '-6 -24 92 70';
    return `<svg viewBox="${vb}" class="cv">${leads}${d.body.replace(/class="glow"[^>]*opacity="0"/, 'class="glow" opacity="0"')}</svg>`;
  }

  function sample(x, px, py) {
    const def = CS.TYPES[x.type];
    const el = { type: x.type, params: Object.assign({}, def.dom === 'a' ? def.def || {} : {}, x.params || {}) };
    if (def.kind === '2') { el.x1 = px; el.y1 = py; el.x2 = px + 4; el.y2 = py; }
    else { el.x = px; el.y = py; }
    if (x.type === 'P') el.params.label = 'A';
    if (x.type === 'N') el.params.label = 'NET';
    if (x.type === 'TXT') el.params.text = '글자';
    return el;
  }

  // ================================================================= 속성 정의
  const F = {
    r: ['저항', 'Ω'], c: ['용량', 'F'], l: ['인덕턴스', 'H'], v: ['전압', 'V'], amp: ['진폭(최대값)', 'V'], freq: ['주파수', 'Hz'], dc: ['직류 성분', 'V'],
    phase: ['위상', '°'], duty: ['듀티비(0~1)', ''], i: ['전류', 'A'], vz: ['제너 전압', 'V'], w: ['정격 전력', 'W'], beta: ['전류 증폭률 β', ''],
    vt: ['문턱 전압 Vth', 'V'], k: ['k (A/V²)', ''], idss: ['IDSS', 'A'], vp: ['+전원', 'V'], vn: ['−전원', 'V'], drop: ['출력 여유', 'V'],
    gain: ['개방 이득', ''], gbw: ['이득-대역폭 곱', 'Hz'], n: ['권선비 (2차/1차)', ''], v0: ['초기 전압', 'V'], i0: ['초기 전류', 'A'], pos: ['위치 (0~1)', ''],
    size: ['글자 크기', 'px'], a: ['정격 전류', 'A'], va: ['얼리 전압', 'V'], lambda: ['λ', ''], ron: ['ON 저항', 'Ω'], ion: ['동작 전류', 'A']
  };
  const PROPS = {
    R: ['r'], POT: ['r', 'pos'], C: ['c', 'pol', 'v0'], L: ['l', 'i0'], V: ['v'], AC: ['wave', 'amp', 'freq', 'dc', 'phase', 'duty'], I: ['i'],
    S: ['on'], PB: [], SPDT: ['pos01'], FUSE: ['a'], D: ['model'], Z: ['vz'], LED: ['color'], LAMP: ['v', 'w'], AM: [], VM: [],
    Q: ['pnp', 'beta', 'va', 'rot', 'f'], M: ['p', 'vt', 'k', 'lambda', 'rot', 'f'], J: ['p', 'idss', 'vpj', 'rot', 'f'],
    OA: ['vp', 'vn', 'drop', 'gain', 'gbw', 'rot', 'f'], X: ['n', 'l', 'rot', 'f'], ASW: ['ron', 'inv', 'rot', 'f'], RLY: ['r', 'ion', 'rot', 'f'],
    P: ['label', 'lp'], N: ['label'], TXT: ['text', 'size'], G: [], W: []
  };
  const SELECTS = {
    wave: [['sine', '정현파'], ['square', '구형파'], ['tri', '삼각파'], ['saw', '톱니파'], ['pulse', '펄스(0~+)'], ['dc', '직류']],
    model: [['1n4148', '1N4148 (신호용)'], ['1n4001', '1N4001 (정류용)'], ['schottky', '쇼트키'], ['ge', '게르마늄']],
    color: [['red', '빨강'], ['orange', '주황'], ['yellow', '노랑'], ['green', '초록'], ['blue', '파랑'], ['white', '흰색']],
    lp: [['tr', '오른쪽 위'], ['tl', '왼쪽 위'], ['br', '오른쪽 아래'], ['bl', '왼쪽 아래']],
    rot: [['0', '0°'], ['1', '90°'], ['2', '180°'], ['3', '270°']]
  };
  const CHECKS = { pol: '전해(극성) 콘덴서', on: '닫힘(ON)', pnp: 'PNP', p: 'P 채널', f: '위아래 뒤집기', inv: 'CTL 반전 (0 일 때 닫힘)' };
  /* 디지털 부품 옵션 이름 */
  const DP = {
    on: '처음에 켜짐 (1)', inv: '반전 (평소 1, 누르면 0)', freq: '주파수 (Hz)', duty: '듀티비 (0 ~ 1)', run: '자동 동작 (끄면 누를 때마다 0↔1)',
    n: '비트 수', val: '초기값', vref: '기준 전압 (V)', vin: 'VIN 이 비었을 때 입력 (V)', color: '색', ca: '공통 애노드 (0 에서 켜짐)', dp: '소수점(dp) 단자',
    d: '전파 지연 (예: 10n)', oc: '오픈 컬렉터 출력', sel: '선택 비트 수', en: 'EN(허용) 단자', bits: '입력 비트 수', al: '출력 액티브 LOW (~Y)',
    hex: 'A ~ F 도 표시', nand: 'NAND형 (S̅ · R̅ 입력)', q0: '처음 Q = 1', neg: '하강 에지에서 동작', pre: '~PRE 단자 (비동기, 0 에서 Q=1)',
    clr: 'CLR 단자', ld: 'LD(로드) 단자', ud: 'UP 단자 (업/다운)', par: '병렬 로드 (LD · D 단자)', mod: '모듈러스 (0 = 2ⁿ)', a: '주소 비트 수',
    data: '초기 내용 (16진, 쉼표 구분)', r: '저항값 (아날로그 넷에서)', hys: '히스테리시스 (V)'
  };
  const FLAG_KEYS = ['on', 'inv', 'run', 'ca', 'dp', 'oc', 'en', 'al', 'hex', 'nand', 'neg', 'pre', 'clr', 'ld', 'ud', 'par', 'q0'];

  /** 디지털 부품의 속성 목록 */
  function digitalSchema(el) {
    const t = el.type;
    const def = CS.TYPES[t].def || {};
    const isGate = D.GATE_TYPES.indexOf(t) >= 0 || t === 'TBUF';
    const out = [];
    Object.keys(def).forEach((k) => {
      let label = DP[k] || k;
      if (k === 'n' && isGate) label = '입력 수';
      if (k === 'd' && (t === 'ROM' || t === 'RAM')) label = '데이터 비트 수';
      if (k === 'clr' && ['DFF', 'JKFF', 'TFF'].indexOf(t) >= 0) label = '~CLR 단자 (비동기, 0 에서 Q=0)';
      if (k === 'clr' && (t === 'CNT' || t === 'REG' || t === 'SHR')) label = 'CLR 단자 (비동기, 1 에서 0)';
      if (k === 'ld' && t === 'REG') label = 'LD 단자 (끄면 매 클럭 저장)';
      if (k === 'ld' && t === 'CNT') label = 'LD 단자 (동기 로드)';
      if (k === 'oc' && t === 'CMPR') label = '오픈 컬렉터 출력 (풀업 필요)';
      const dv = def[k];
      if (k === 'color') { out.push({ k, kind: 'select', def: dv, opts: SELECTS.color, label }); return; }
      if (FLAG_KEYS.indexOf(k) >= 0) { out.push({ k, kind: 'flag', def: dv, label }); return; }
      let range = null;
      if (k === 'n') range = isGate ? [2, 8] : t === 'LEDS' ? [1, 16] : [1, 8];
      else if (k === 'sel') range = [1, 3];
      else if (k === 'bits') range = t === 'DEC' ? [1, 4] : [1, 3];
      else if (k === 'a') range = [1, 6];
      else if (k === 'd' && (t === 'ROM' || t === 'RAM')) range = [1, 8];
      if (range) out.push({ k, kind: 'num', def: dv, min: range[0], max: range[1], label });
      else out.push({ k, kind: 'text', def: dv, label });
    });
    if (isGate) out.push({ k: 'lbl', kind: 'flag', def: 0, label: '게이트 이름 표시' });
    out.push({ k: 'rot', kind: 'select', def: '0', opts: SELECTS.rot, label: '회전' });
    if (t !== 'CLK') out.push({ k: 'f', kind: 'flag', def: 0, label: '위아래 뒤집기' });
    return out;
  }

  // ================================================================= 편집기
  class Editor {
    constructor(view, ui) {
      this.view = view;
      this.ui = ui || {};
      this.tool = 'select';
      this.sel = new Set();
      this.undoStack = [];
      this.redoStack = [];
      this.clip = null;
      this.ghost = null;
      this.lastRot = 0;
      view.opts.editable = true;
      view.opts.keepView = true;
      view.onEditPointerDown = (e) => this.onDown(e);
      view.on('render', () => this.drawEdit());
      this.bind();
      this.snapshot(true);
    }

    get circ() { return this.view.circ; }

    // ---------------------------------------------------------------- 상태
    text() { return CS.serialize(this.circ); }
    snapshot(initial) {
      const t = this.text();
      if (!initial && this.undoStack.length && this.undoStack[this.undoStack.length - 1] === t) return;
      this.undoStack.push(t);
      if (this.undoStack.length > 150) this.undoStack.shift();
      if (!initial) this.redoStack = [];
      if (this.ui.onChange) this.ui.onChange(t);
    }
    commit(keepSel) {
      CS.autoName(this.circ.elements);
      this.view.rebuild(false);
      if (!keepSel) this.sel.clear();
      this.snapshot();
      this.drawEdit();
      this.showProps();
    }
    loadText(t, fit) {
      const circ = CS.parse(t);
      this.view.circ = circ;
      this.view.errors = circ.errors;
      this.sel.clear();
      this.view.rebuild(false);
      if (fit) this.fit();
      this.drawEdit();
      this.showProps();
    }
    undo() {
      if (this.undoStack.length < 2) return;
      this.redoStack.push(this.undoStack.pop());
      this.loadText(this.undoStack[this.undoStack.length - 1]);
      if (this.ui.onChange) this.ui.onChange(this.text());
    }
    redo() {
      const t = this.redoStack.pop();
      if (t == null) return;
      this.undoStack.push(t);
      this.loadText(t);
      if (this.ui.onChange) this.ui.onChange(this.text());
    }

    // ---------------------------------------------------------------- 보기
    setVB(vb) {
      this.view.vb = vb;
      this.view.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      if (this.ui.onZoom) this.ui.onZoom(vb);
    }
    fit() {
      const b = this.view.bounds();
      const r = this.view.svg.getBoundingClientRect();
      const asp = r.width && r.height ? r.width / r.height : 1.6;
      let w = Math.max(b.w, 400), h = Math.max(b.h, 260);
      if (w / h < asp) w = h * asp; else h = w / asp;
      this.setVB({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h });
    }
    zoom(f, cx, cy) {
      const vb = this.view.vb;
      if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
      const w = Math.max(120, Math.min(12000, vb.w * f)), h = vb.h * (w / vb.w);
      this.setVB({ x: cx - (cx - vb.x) * (w / vb.w), y: cy - (cy - vb.y) * (h / vb.h), w, h });
    }

    // ---------------------------------------------------------------- 도구
    setTool(t) {
      this.tool = t;
      this.ghost = null;
      this.drag = null;
      this.view.opts.tips = t === 'select';
      this.view.el.classList.toggle('placing', t !== 'select');
      if (this.ui.onTool) this.ui.onTool(t);
      this.drawEdit();
    }
    gridPt(e) {
      const p = this.view.toSvg(e);
      return { x: Math.round(p.x / G), y: Math.round(p.y / G), px: p.x, py: p.y };
    }

    hitElement(e) {
      const p = this.view.toSvg(e);
      const tol = 8 / Math.max(0.2, this.view.pxPerUnit());
      for (const i of this.sel) {
        const el = this.circ.elements[i];
        if (!el || CS.TYPES[el.type].kind !== '2') continue;
        for (const [k, x, y] of [[1, el.x1, el.y1], [2, el.x2, el.y2]]) {
          if (Math.hypot(x * G - p.x, y * G - p.y) < tol + 2) return { idx: i, handle: k };
        }
      }
      const h = this.view.hitTest(e);
      if (h && h.kind === 'el') return { idx: this.circ.elements.indexOf(h.el) };
      let best = -1, bd = tol + 6;
      this.circ.elements.forEach((el, i) => {
        if (el.type === 'TXT') {
          const w = String(el.params.text || '').length * 9 + 10;
          if (p.x > el.x * G - 4 && p.x < el.x * G + w && p.y > el.y * G - 18 && p.y < el.y * G + 6) { best = i; bd = 0; }
        }
      });
      if (best >= 0) return { idx: best };
      this.circ.elements.forEach((el, i) => {
        if (el.type !== 'W') return;
        const d = segDist(p.x, p.y, el.x1 * G, el.y1 * G, el.x2 * G, el.y2 * G);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) return { idx: best };
      this.circ.elements.forEach((el, i) => {
        if (!['G', 'P', 'N', 'HI', 'LO'].includes(el.type)) return;
        const d = Math.hypot(el.x * G - p.x, (el.y * G + (el.type === 'G' ? 10 : 0)) - p.y);
        if (d < bd + 6) { bd = d; best = i; }
      });
      return best >= 0 ? { idx: best } : null;
    }

    // ---------------------------------------------------------------- 마우스
    onDown(e) {
      if (this.view.pick) return false;
      if (e.button !== 0) return false;
      const g = this.gridPt(e);
      e.preventDefault();
      this.view.svg.setPointerCapture(e.pointerId);
      if (this.tool === 'pan' || this.spaceDown) { this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vb: Object.assign({}, this.view.vb) }; return true; }
      if (this.tool === 'W') { this.drag = { kind: 'wire', a: g, b: g }; return true; }
      if (this.tool !== 'select') {
        const x = PAL[this.tool];
        const def = CS.TYPES[x.type];
        if (def.kind === '2') { this.drag = { kind: 'place2', a: g, b: g, it: x }; return true; }
        this.placeOne(x, g);
        return true;
      }
      const hit = this.hitElement(e);
      if (!hit) {
        if (!e.shiftKey) this.sel.clear();
        this.drag = { kind: 'box', a: g, b: g, pa: this.view.toSvg(e) };
        this.drawEdit(); this.showProps();
        return true;
      }
      const el = this.circ.elements[hit.idx];
      if (hit.handle) { this.drag = { kind: 'stretch', idx: hit.idx, handle: hit.handle, a: g, moved: false }; return true; }
      if (e.shiftKey) { if (this.sel.has(hit.idx)) this.sel.delete(hit.idx); else this.sel.add(hit.idx); }
      else if (!this.sel.has(hit.idx)) { this.sel.clear(); this.sel.add(hit.idx); }
      // 버튼은 누르는 동안 눌림
      if ((el.type === 'PB' || el.type === 'BTN') && this.view.sim) { this.view.sim.press(el, true); this.view.partChanged(el, true); }
      this.drag = { kind: 'move', a: g, last: g, moved: false, idx: hit.idx, ev: e, orig: [...this.sel].map((i) => [i, JSON.parse(JSON.stringify(this.circ.elements[i], (k, v) => (k[0] === '_' || k === 'st' || k === 'lim' || k === 'op' ? undefined : v)))]) };
      this.drawEdit(); this.showProps();
      return true;
    }

    onMove(e) {
      const d = this.drag;
      const g = this.gridPt(e);
      this.cursor = g;
      if (this.ui.onCursor) this.ui.onCursor(g);
      if (!d) {
        if (this.tool !== 'select' && this.tool !== 'W' && this.tool !== 'pan') { this.ghost = { it: PAL[this.tool], g }; this.drawEdit(); }
        else if (this.tool === 'W') { this.ghost = { wire: g }; this.drawEdit(); }
        return;
      }
      if (d.kind === 'pan') {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
        const s = this.view.vb.w / this.view.svg.getBoundingClientRect().width;
        this.setVB({ x: d.vb.x - (e.clientX - d.sx) * s, y: d.vb.y - (e.clientY - d.sy) * s, w: d.vb.w, h: d.vb.h });
        return;
      }
      if (d.kind === 'wire' || d.kind === 'place2') { d.b = g; this.drawEdit(); return; }
      if (d.kind === 'box') { d.b = g; d.pb = this.view.toSvg(e); this.drawEdit(); return; }
      if (d.kind === 'stretch') {
        const el = this.circ.elements[d.idx];
        if (d.handle === 1) { el.x1 = g.x; el.y1 = g.y; } else { el.x2 = g.x; el.y2 = g.y; }
        d.moved = true;
        this.view.render(false);
        return;
      }
      if (d.kind === 'move') {
        const dx = g.x - d.a.x, dy = g.y - d.a.y;
        if (!dx && !dy && !d.moved) return;
        d.moved = true;
        this.view.drag = true;
        d.orig.forEach(([i, o]) => {
          const el = this.circ.elements[i];
          if ('x1' in o) { el.x1 = o.x1 + dx; el.y1 = o.y1 + dy; el.x2 = o.x2 + dx; el.y2 = o.y2 + dy; }
          else { el.x = o.x + dx; el.y = o.y + dy; }
        });
        this.view.render(false);
      }
    }

    onUp(e) {
      const d = this.drag;
      this.drag = null;
      this.view.drag = false;
      if (!d) return;
      try { this.view.svg.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      if (d.kind === 'pan') {
        if (d.btn === 2 && !d.moved && this.ui.onContext) { const h = this.view.hitTest(e); if (h) this.ui.onContext(e, h, this.view); }
        return;
      }
      if (d.kind === 'wire') {
        const a = d.a, b = d.b;
        if (a.x === b.x && a.y === b.y) return;
        if (a.x !== b.x && a.y !== b.y) {
          this.circ.elements.push({ type: 'W', x1: a.x, y1: a.y, x2: b.x, y2: a.y, params: {} });
          this.circ.elements.push({ type: 'W', x1: b.x, y1: a.y, x2: b.x, y2: b.y, params: {} });
        } else this.circ.elements.push({ type: 'W', x1: a.x, y1: a.y, x2: b.x, y2: b.y, params: {} });
        this.commit();
        return;
      }
      if (d.kind === 'place2') {
        let { a, b } = d;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (!dx && !dy) {
          const dirs = [[4, 0], [0, 4], [-4, 0], [0, -4]];
          const [ex, ey] = dirs[this.lastRot % 4];
          b = { x: a.x + ex, y: a.y + ey };
        } else if (Math.abs(dx) >= Math.abs(dy)) b = { x: b.x, y: a.y }; else b = { x: a.x, y: b.y };
        const el = sample(d.it, a.x, a.y);
        el.x2 = b.x; el.y2 = b.y;
        if (el.type === 'POT' && ((Math.abs(el.x2 - el.x1) + Math.abs(el.y2 - el.y1)) % 2)) { if (el.x2 !== el.x1) el.x2 += Math.sign(el.x2 - el.x1); else el.y2 += Math.sign(el.y2 - el.y1); }
        this.circ.elements.push(el);
        this.commit();
        this.sel.add(this.circ.elements.length - 1);
        this.drawEdit(); this.showProps();
        return;
      }
      if (d.kind === 'box') {
        if (d.pa && d.pb) {
          const x0 = Math.min(d.pa.x, d.pb.x), x1 = Math.max(d.pa.x, d.pb.x), y0 = Math.min(d.pa.y, d.pb.y), y1 = Math.max(d.pa.y, d.pb.y);
          this.circ.elements.forEach((el, i) => {
            let ps;
            if (CS.TYPES[el.type].kind === '2') ps = [[el.x1, el.y1], [el.x2, el.y2]];
            else if (isDig(el.type)) { const b = D.bodyOf(el); ps = [[b.x0, b.y0], [b.x1, b.y1]]; }
            else ps = [[el.x, el.y]];
            if (ps.every(([x, y]) => x * G >= x0 && x * G <= x1 && y * G >= y0 && y * G <= y1)) this.sel.add(i);
          });
        }
        this.drawEdit(); this.showProps();
        return;
      }
      if (d.kind === 'stretch') {
        const el = this.circ.elements[d.idx];
        if (el.x1 === el.x2 && el.y1 === el.y2) { this.circ.elements.splice(d.idx, 1); this.commit(); return; }
        if (d.moved) this.commit(true); else this.drawEdit();
        return;
      }
      if (d.kind === 'move') {
        const el = this.circ.elements[d.idx];
        if (el && (el.type === 'PB' || el.type === 'BTN') && this.view.sim) { this.view.sim.press(el, false); this.view.partChanged(el, true); }
        if (d.moved) { this.commit(true); return; }
        // 움직이지 않은 클릭: 스위치 · 클럭 · DIP 조작
        if (el && this.sel.size === 1 && ['S', 'SPDT', 'SW', 'CLK', 'DIP'].includes(el.type)) {
          this.view.operate(el, d.ev);
          this.snapshot();
          this.showProps();
        }
        this.drawEdit();
      }
    }

    placeOne(x, g) {
      const el = sample(x, g.x, g.y);
      if (el.type === 'P') {
        const used = new Set(this.circ.elements.filter((q) => q.type === 'P').map((q) => String(q.params.label)));
        let lab = 'A';
        for (let k = 0; k < 26 && used.has(lab); k++) lab = String.fromCharCode(65 + k + 1);
        el.params.label = lab;
      }
      if (el.type === 'TXT') {
        const t = prompt('표시할 글자', '설명');
        if (!t) return;
        el.params.text = t;
      }
      if (el.type === 'N') {
        const t = prompt('이름표 이름 (같은 이름끼리 연결됩니다)', 'NET');
        if (!t) return;
        el.params.label = t.replace(/\s+/g, '_');
      }
      if (isP(el.type) && this.lastRot) el.params.rot = this.lastRot % 4;
      this.circ.elements.push(el);
      this.commit();
      this.sel.add(this.circ.elements.length - 1);
      this.drawEdit(); this.showProps();
    }

    // ---------------------------------------------------------------- 편집 명령
    deleteSel() {
      if (!this.sel.size) return;
      this.circ.elements = this.circ.elements.filter((_, i) => !this.sel.has(i));
      this.commit();
    }
    rotateSel() {
      if (!this.sel.size) {
        this.lastRot = (this.lastRot + 1) % 4;
        this.drawEdit();
        if (this.ui.toast) this.ui.toast('놓을 방향: ' + ['→', '↓', '←', '↑'][this.lastRot]);
        return;
      }
      this.sel.forEach((i) => {
        const el = this.circ.elements[i];
        if (CS.TYPES[el.type].kind === '2') {
          const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
          el.x2 = el.x1 - dy; el.y2 = el.y1 + dx;
        } else if (isP(el.type)) el.params.rot = ((+el.params.rot || 0) + 1) % 4;
      });
      this.commit(true);
    }
    flipSel() {
      this.sel.forEach((i) => {
        const el = this.circ.elements[i];
        if (CS.TYPES[el.type].kind === '2') { [el.x1, el.x2] = [el.x2, el.x1]; [el.y1, el.y2] = [el.y2, el.y1]; }
        else if (isP(el.type) && el.type !== 'CLK') el.params.f = +el.params.f ? 0 : 1;
      });
      this.commit(true);
    }
    nudge(dx, dy) {
      if (!this.sel.size) return;
      this.sel.forEach((i) => {
        const el = this.circ.elements[i];
        if ('x1' in el) { el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy; } else { el.x += dx; el.y += dy; }
      });
      this.commit(true);
    }
    copySel() {
      if (!this.sel.size) return false;
      this.clip = [...this.sel].map((i) => cleanCopy(this.circ.elements[i]));
      return true;
    }
    paste() {
      if (!this.clip) return;
      const n0 = this.circ.elements.length;
      this.clip.forEach((o) => {
        const el = cleanCopy(o);
        if ('x1' in el) { el.x1 += 2; el.y1 += 2; el.x2 += 2; el.y2 += 2; } else { el.x += 2; el.y += 2; }
        delete el.name; delete el.autoName;
        this.circ.elements.push(el);
      });
      this.clip = this.clip.map((o) => { const c = cleanCopy(o); if ('x1' in c) { c.x1 += 2; c.y1 += 2; c.x2 += 2; c.y2 += 2; } else { c.x += 2; c.y += 2; } return c; });
      this.commit();
      for (let i = n0; i < this.circ.elements.length; i++) this.sel.add(i);
      this.drawEdit(); this.showProps();
    }
    selectAll() { this.circ.elements.forEach((_, i) => this.sel.add(i)); this.drawEdit(); this.showProps(); }

    // ---------------------------------------------------------------- 편집 표시
    drawEdit() {
      const svg = this.view.svg;
      let g = svg.querySelector('.l-edit');
      if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'l-edit'); svg.appendChild(g); }
      let s = '';
      this.sel.forEach((i) => {
        const el = this.circ.elements[i];
        if (!el) return;
        if (CS.TYPES[el.type].kind === '2') {
          const x1 = el.x1 * G, y1 = el.y1 * G, x2 = el.x2 * G, y2 = el.y2 * G;
          s += `<line class="sel-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><circle class="sel-handle" cx="${x1}" cy="${y1}" r="5"/><circle class="sel-handle" cx="${x2}" cy="${y2}" r="5"/>`;
        } else {
          let x0, y0, x1, y1;
          if (isDig(el.type)) { const b = D.boundsOf(el); x0 = b.x0 * G; y0 = b.y0 * G; x1 = b.x1 * G; y1 = b.y1 * G; }
          else {
            x0 = x1 = el.x * G; y0 = y1 = el.y * G;
            CS.pins(el).forEach(([x, y]) => { x0 = Math.min(x0, x * G); y0 = Math.min(y0, y * G); x1 = Math.max(x1, x * G); y1 = Math.max(y1, y * G); });
            if (el.type === 'G') { y1 += 22; x0 -= 14; x1 += 14; }
            if (el.type === 'P') { x1 += 20; y0 -= 20; }
            if (el.type === 'N') { x1 += String(el.params.label).length * 8 + 16; y0 -= 10; y1 += 10; }
            if (el.type === 'TXT') { x1 += String(el.params.text || '').length * 9; y0 -= 16; }
          }
          s += `<rect class="sel-box" x="${x0 - 8}" y="${y0 - 8}" width="${x1 - x0 + 16}" height="${y1 - y0 + 16}" rx="6"/>`;
        }
      });
      const d = this.drag;
      if (d && d.kind === 'wire') {
        const a = d.a, b = d.b;
        s += a.x !== b.x && a.y !== b.y
          ? `<path class="ghost-wire" d="M${a.x * G} ${a.y * G} L${b.x * G} ${a.y * G} L${b.x * G} ${b.y * G}"/>`
          : `<line class="ghost-wire" x1="${a.x * G}" y1="${a.y * G}" x2="${b.x * G}" y2="${b.y * G}"/>`;
      }
      if (d && d.kind === 'place2') {
        let { a, b } = d;
        if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) b = { x: b.x, y: a.y }; else b = { x: a.x, y: b.y };
        if (a.x === b.x && a.y === b.y) { const dirs = [[4, 0], [0, 4], [-4, 0], [0, -4]]; b = { x: a.x + dirs[this.lastRot][0], y: a.y + dirs[this.lastRot][1] }; }
        const el = sample(d.it, a.x, a.y); el.x2 = b.x; el.y2 = b.y;
        s += ghostEl(el);
      }
      if (d && d.kind === 'box' && d.pa && d.pb) s += `<rect class="sel-rect" x="${Math.min(d.pa.x, d.pb.x)}" y="${Math.min(d.pa.y, d.pb.y)}" width="${Math.abs(d.pb.x - d.pa.x)}" height="${Math.abs(d.pb.y - d.pa.y)}"/>`;
      if (!d && this.ghost) {
        if (this.ghost.wire) s += `<circle class="ghost-pt" cx="${this.ghost.wire.x * G}" cy="${this.ghost.wire.y * G}" r="5"/>`;
        else if (this.ghost.it) {
          const x = this.ghost.it;
          const el = sample(x, this.ghost.g.x, this.ghost.g.y);
          if (CS.TYPES[x.type].kind === '2') {
            const dirs = [[4, 0], [0, 4], [-4, 0], [0, -4]];
            el.x2 = el.x1 + dirs[this.lastRot][0]; el.y2 = el.y1 + dirs[this.lastRot][1];
          } else if (isP(x.type)) el.params.rot = this.lastRot;
          s += ghostEl(el);
        }
      }
      g.innerHTML = s;
    }

    // ---------------------------------------------------------------- 속성 창
    showProps() {
      const box = this.ui.propsEl;
      if (!box) return;
      const idx = [...this.sel];
      if (idx.length !== 1) {
        box.innerHTML = idx.length > 1
          ? `<div class="pp-head"><b>${idx.length}개 선택됨</b></div><div class="pp-actions"><button class="btn small" data-pp="rot">⟳ 회전 (R)</button><button class="btn small" data-pp="dup">⧉ 복제</button><button class="btn small danger" data-pp="del">🗑 삭제</button></div>`
          : '<div class="pp-empty">부품을 누르면 여기에서 값을 바꿀 수 있습니다.<br><span class="muted">값은 4.7k, 100u, 10m 처럼 입력 · 화살표 키로 한 칸씩 이동</span></div>';
        this.bindProps(box, null);
        return;
      }
      const el = this.circ.elements[idx[0]];
      if (!el) return;
      const def = CS.TYPES[el.type];
      const rows = [];
      if (!['W', 'G', 'P', 'N', 'TXT'].includes(el.type)) rows.push(`<label class="pp-row"><span>이름</span><input type="text" data-k="__name" value="${esc(el.autoName ? '' : el.name || '')}" placeholder="${esc(el.name || '')} (자동)"></label>`);
      if (isDig(el.type)) {
        digitalSchema(el).forEach((f) => {
          const raw = el.params[f.k];
          const val = raw == null ? '' : String(raw);
          const lab = esc(f.label);
          if (f.kind === 'flag') { rows.push(`<label class="pp-row chk"><input type="checkbox" data-k="${f.k}" data-kind="flag" data-def="${esc(f.def)}"${(raw == null ? on(f.def) : on(raw)) ? ' checked' : ''}><span>${lab}</span></label>`); return; }
          if (f.kind === 'select') {
            const cur = val || String(f.def);
            rows.push(`<label class="pp-row"><span>${lab}</span><select data-k="${f.k}" data-kind="select" data-def="${esc(f.def)}">${f.opts.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`);
            return;
          }
          const type = f.kind === 'num' ? `type="number" min="${f.min}" max="${f.max}" step="1"` : 'type="text"';
          rows.push(`<label class="pp-row wide"><span>${lab}</span><input ${type} data-k="${f.k}" data-kind="${f.kind}" data-def="${esc(f.def)}" value="${esc(val)}" placeholder="${esc(f.def)}" spellcheck="false"></label>`);
        });
      } else {
        (PROPS[el.type] || []).forEach((k) => {
          const p = el.params;
          if (k === 'pos01') { rows.push(`<label class="pp-row"><span>접점</span><select data-k="pos"><option value="0"${+p.pos ? '' : ' selected'}>0 (가로 끝)</option><option value="1"${+p.pos ? ' selected' : ''}>1 (아래/옆)</option></select></label>`); return; }
          if (k === 'vpj') { rows.push(`<label class="pp-row"><span>핀치오프 Vp</span><input type="text" data-k="vp" value="${esc(CS.siText(+p.vp, 4))}"><i>V</i></label>`); return; }
          if (SELECTS[k]) {
            rows.push(`<label class="pp-row"><span>${{ wave: '파형', model: '모델', color: '색', lp: '이름 위치', rot: '회전' }[k]}</span><select data-k="${k}">${SELECTS[k].map(([v, t]) => `<option value="${v}"${String(p[k] == null ? (k === 'rot' ? 0 : '') : p[k]) === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`);
            return;
          }
          if (CHECKS[k]) { rows.push(`<label class="pp-row chk"><input type="checkbox" data-k="${k}"${+p[k] ? ' checked' : ''}><span>${CHECKS[k]}</span></label>`); return; }
          if (k === 'label' || k === 'text') { rows.push(`<label class="pp-row"><span>${k === 'label' ? '이름' : '글자'}</span><input type="text" data-k="${k}" value="${esc(p[k] || '')}"></label>`); return; }
          if (k === 'pos') { rows.push(`<label class="pp-row"><span>와이퍼 위치</span><input type="range" min="0" max="1" step="0.01" data-k="pos" value="${+p.pos}"><i>${Math.round(+p.pos * 100)}%</i></label>`); return; }
          const [lab, unit] = F[k] || [k, ''];
          rows.push(`<label class="pp-row"><span>${lab}</span><input type="text" data-k="${k}" value="${esc(p[k] == null ? '' : typeof p[k] === 'number' ? CS.siText(p[k], 4) : p[k])}"><i>${unit}</i></label>`);
        });
        if (!['W', 'G', 'TXT', 'P', 'N'].includes(el.type)) {
          const lblMode = el.params.lbl === 0 || el.params.lbl === '0' ? 'hide' : el.params.lbl && el.params.lbl !== 1 ? 'custom' : 'auto';
          rows.push(`<label class="pp-row"><span>표시 글자</span><select data-k="__lblmode"><option value="auto"${lblMode === 'auto' ? ' selected' : ''}>자동 (이름 + 값)</option><option value="custom"${lblMode === 'custom' ? ' selected' : ''}>직접 입력</option><option value="hide"${lblMode === 'hide' ? ' selected' : ''}>숨김</option></select></label>`);
          if (lblMode === 'custom') rows.push(`<label class="pp-row"><span>글자</span><input type="text" data-k="lbl" value="${esc(el.params.lbl)}"></label>`);
        }
      }
      const pl = CS.pinList(el).filter((q) => q.n);
      const pinInfo = pl.length && !['W', 'P', 'N', 'G'].includes(el.type) ? `<div class="pp-pins">${pl.map((q) => `<span class="${q.dom === 'a' ? 'pa' : 'pd'}" title="${q.dom === 'a' ? '아날로그 단자' : '디지털 단자'}">${esc(q.n)} (${q.x},${q.y})</span>`).join('')}</div>` : '';
      const where = def.kind === '2' ? `(${el.x1},${el.y1})→(${el.x2},${el.y2})` : `(${el.x},${el.y})`;
      const dom = def.dom === 'd' ? '<span class="dom-tag d">디지털</span>' : def.dom === 'a' ? '<span class="dom-tag a">아날로그</span>' : '';
      box.innerHTML = `<div class="pp-head"><b>${esc(el.name || def.name)}</b><span class="muted">${esc(def.name)} · ${where}</span>${dom}</div>
        ${def.desc ? `<div class="pp-desc">${esc(def.desc)}</div>` : ''}
        <div class="pp-rows">${rows.join('') || '<span class="muted">바꿀 값이 없습니다</span>'}</div>${pinInfo}
        <div class="pp-actions"><button class="btn small" data-pp="rot" title="R">⟳ 회전</button><button class="btn small" data-pp="flip" title="F">⇅ 뒤집기</button>
          <button class="btn small" data-pp="dup" title="Ctrl+D">⧉ 복제</button><button class="btn small danger" data-pp="del" title="Delete">🗑 삭제</button></div>`;
      this.bindProps(box, el);
    }

    bindProps(box, el) {
      box.querySelectorAll('[data-pp]').forEach((b) => b.onclick = () => {
        const a = b.dataset.pp;
        if (a === 'rot') this.rotateSel();
        if (a === 'flip') this.flipSel();
        if (a === 'del') this.deleteSel();
        if (a === 'dup') { if (this.copySel()) this.paste(); }
      });
      if (!el) return;
      box.querySelectorAll('[data-k]').forEach((inp) => {
        const k = inp.dataset.k;
        const apply = () => {
          if (k === '__name') {
            const v = inp.value.trim().replace(/\s+/g, '_');
            if (v && this.circ.elements.some((q) => q !== el && q.name === v)) { if (this.ui.toast) this.ui.toast(`⚠ 이름 '${v}' 은(는) 이미 있습니다`); this.showProps(); return; }
            if (v) { el.name = v; el.autoName = false; } else { delete el.name; delete el.autoName; }
            this.commit(true);
            return;
          }
          if (k === '__lblmode') { if (inp.value === 'auto') delete el.params.lbl; else if (inp.value === 'hide') el.params.lbl = 0; else el.params.lbl = el.name || '글자'; this.commit(true); return; }
          if (isDig(el.type) && inp.dataset.kind) {
            const kind = inp.dataset.kind, dv = inp.dataset.def;
            let v = kind === 'flag' ? (inp.checked ? '1' : '0') : String(inp.value).trim();
            if (kind === 'num' && v !== '') { let n = parseInt(v, 10); if (!isFinite(n)) n = +dv; v = String(Math.max(+inp.min, Math.min(+inp.max, n))); }
            if (v === '' || (kind === 'flag' ? on(v) === on(dv) : v === String(dv))) delete el.params[k]; else el.params[k] = kind === 'select' && k === 'rot' ? +v : v;
            if (k === 'freq' && this.view.sim && CS.parseNum(v, 0) > 0) { this.view.sim.partChanged(el); }
            this.commit(true);
            return;
          }
          let v;
          if (inp.type === 'checkbox') v = inp.checked ? 1 : 0;
          else if (inp.tagName === 'SELECT') v = /^\d+$/.test(inp.value) ? +inp.value : inp.value;
          else if (inp.type === 'range') v = +inp.value;
          else if (['label', 'text', 'lbl'].includes(k)) v = inp.value;
          else { v = CS.parseNum(inp.value); if (v == null || isNaN(v)) { inp.classList.add('bad'); return; } }
          inp.classList.remove('bad');
          if (k === 'label' && ['P', 'N'].includes(el.type)) v = String(v).replace(/\s+/g, '_') || (el.type === 'P' ? 'A' : 'NET');
          el.params[k] = v;
          if (inp.type === 'range') { const i = inp.nextElementSibling; if (i) i.textContent = Math.round(v * 100) + '%'; this.view.partChanged(el); return; }
          this.commit(true);
        };
        if (inp.type === 'range') { inp.oninput = apply; inp.onchange = () => this.snapshot(); }
        else inp.onchange = apply;
        if (inp.type === 'text' || inp.type === 'number') inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
      });
    }

    // ---------------------------------------------------------------- 이벤트
    bind() {
      const svg = this.view.svg;
      svg.addEventListener('pointermove', (e) => this.onMove(e));
      svg.addEventListener('pointerup', (e) => this.onUp(e));
      svg.addEventListener('pointerleave', () => { if (!this.drag) { this.ghost = null; this.drawEdit(); } });
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const p = this.view.toSvg(e);
        this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
      }, { passive: false });
      svg.addEventListener('pointerdown', (e) => {
        if (e.button === 1 || e.button === 2) {
          e.preventDefault();
          this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vb: Object.assign({}, this.view.vb), btn: e.button };
          svg.setPointerCapture(e.pointerId);
        }
      });
      svg.addEventListener('contextmenu', (e) => e.preventDefault());
      svg.addEventListener('dblclick', (e) => {
        const h = this.hitElement(e);
        if (h && this.ui.focusProps) this.ui.focusProps();
      });
      document.addEventListener('keydown', (e) => {
        const t = e.target;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        const modal = document.getElementById('modal');
        if (modal && !modal.classList.contains('hidden')) return;
        const k = e.key;
        const ctrl = e.ctrlKey || e.metaKey;
        if (k === ' ') { e.preventDefault(); this.spaceDown = true; return; }
        if (ctrl && (k === 'z' || k === 'Z') && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
        if (ctrl && (k === 'y' || k === 'Y' || ((k === 'z' || k === 'Z') && e.shiftKey))) { e.preventDefault(); this.redo(); return; }
        if (ctrl && (k === 'c' || k === 'C')) { if (this.copySel() && this.ui.toast) this.ui.toast('복사했습니다'); return; }
        if (ctrl && (k === 'x' || k === 'X')) { if (this.copySel()) this.deleteSel(); return; }
        if (ctrl && (k === 'v' || k === 'V')) { e.preventDefault(); this.paste(); return; }
        if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); if (this.copySel()) this.paste(); return; }
        if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); this.selectAll(); return; }
        if (ctrl) return;
        if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.deleteSel(); return; }
        if (k === 'Escape') { if (this.drag) { this.drag = null; this.drawEdit(); } else if (this.tool !== 'select') this.setTool('select'); else { this.sel.clear(); this.drawEdit(); this.showProps(); } return; }
        if (k.startsWith('Arrow') && this.sel.size) { e.preventDefault(); this.nudge(k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0); return; }
        if (k === 'r' || k === 'R') { this.rotateSel(); return; }
        if (k === 'f' || k === 'F') { this.flipSel(); return; }
        if (k === 'v' || k === 'V') { this.setTool('select'); return; }
        if (k === '+' || k === '=') { this.zoom(1 / 1.2); return; }
        if (k === '-') { this.zoom(1.2); return; }
        if (k === '0') { this.fit(); return; }
        const x = PALETTE.flatMap(([, , items]) => items).find((q) => q.hot && q.hot.toLowerCase() === k.toLowerCase());
        if (x) this.setTool(x.key);
      });
      document.addEventListener('keyup', (e) => { if (e.key === ' ') this.spaceDown = false; });
    }
  }

  function cleanCopy(el) { return JSON.parse(JSON.stringify(el, (k, v) => (k[0] === '_' || k === 'st' || k === 'lim' || k === 'op' || k === 'line' ? undefined : v))); }
  function ghostEl(el) {
    const d = CircuitView.drawEl(el, { names: false, iec: CircuitView.iec });
    const leads = d.leads.map((l) => `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" class="ghost-lead"/>`).join('');
    return `<g class="ghost${d.digital ? ' still' : ''}">${leads}${d.body}</g>`;
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  }

  window.CircuitEditor = { Editor, PALETTE, PAL, iconSvg };
})();
