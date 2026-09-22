/* 계측기 (오른쪽 창)
 *  - 멀티미터 (V⎓ V~ A⎓ A~ Ω) · 2채널 오실로스코프 (아날로그 전압 · 소자 전류 · 디지털 넷도 전압으로)
 *  - 8채널 로직 분석기 (디지털 넷 + 아날로그 넷의 문턱값 논리) · 로직 프로브
 *  - 입력 · 출력 조작판 (스위치 · DIP · 버튼 · 클럭 · ADC), 진리표, 내부 상태, 측정점
 */
(function () {
  'use strict';
  const CS = window.CircuitSim;
  const { L0, L1, LX, LZ } = CS;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = (v, u) => CS.fmt(v, u);
  const SEQ = [];
  [1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10].forEach((d) => [1, 2, 5].forEach((m) => SEQ.push(+(d * m).toPrecision(3))));
  const TB_LIST = SEQ.filter((v) => v >= 1e-7 && v <= 5);
  const VD_LIST = SEQ.filter((v) => v >= 1e-3 && v <= 50);
  const AD_LIST = SEQ.filter((v) => v >= 1e-6 && v <= 5);
  const LA_TB = SEQ.filter((v) => v >= 1e-9 && v <= 10);
  const CH_COLOR = ['#f5c400', '#22d3ee'];
  const LA_COLORS = ['#facc15', '#38bdf8', '#f472b6', '#4ade80', '#fb923c', '#a78bfa', '#2dd4bf', '#f87171'];
  const nearest = (list, v) => list.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a), list[0]);
  const stepList = (list, v, d) => { const i = list.indexOf(nearest(list, v)); return list[Math.max(0, Math.min(list.length - 1, i + d))]; };
  const bin = (v, n) => (v == null ? 'X'.repeat(n) : v.toString(2).padStart(n, '0'));
  const hex = (v) => (v == null ? 'X' : v.toString(16).toUpperCase());

  // ================================================================= 소스 해석
  function netOfRef(sim, p) {
    if (p == null) return sim.gndNet;
    if (typeof p === 'string') return sim.netByName(p);
    return sim.netOfPoint(p.x, p.y);
  }
  function resolveSource(sim, src) {
    if (!sim || !src) return null;
    if (src.el) {
      const el = sim.findEl(src.el);
      if (!el) return null;
      const k = src.pin || 0;
      return { unit: 'A', get: () => { const ic = sim.pinCurrents(el); return el.type === 'V' || el.type === 'AC' ? -(ic[1] || 0) : (ic[k] || 0); } };
    }
    const a = netOfRef(sim, src.a), b = netOfRef(sim, src.b);
    if (a == null || b == null || a === -2 || b === -2) return null;
    return { unit: 'V', get: () => sim.netV(a) - sim.netV(b), a, b };
  }
  function parseSource(s) {
    if (!s) return null;
    s = String(s).trim();
    let m = /^I\(([^)]+)\)$/i.exec(s);
    if (m) return { el: m[1].trim() };
    m = /^V\(([^,)]+)(?:,([^)]+))?\)$/i.exec(s);
    if (m) return { a: m[1].trim(), b: m[2] ? m[2].trim() : null };
    return { a: s, b: null };
  }
  function srcLabel(src) {
    if (!src) return '연결 안 됨';
    if (src.el) return `I(${src.el})`;
    const n = (p) => (p == null ? 'GND' : typeof p === 'string' ? p : `(${p.x},${p.y})`);
    return src.b != null ? `V(${n(src.a)}, ${n(src.b)})` : `V(${n(src.a)})`;
  }

  // ================================================================= 오실로스코프
  class Scope {
    constructor(host, opts = {}) {
      this.opts = opts;
      this.ch = [0, 1].map((i) => ({ on: i === 0, src: null, vdiv: 1, pos: 0, ac: false, color: CH_COLOR[i], fn: null }));
      this.tb = 1e-3;
      this.trig = { src: 0, level: 0, edge: 'rise', mode: 'auto' };
      this.xy = false;
      this.runState = 'run';
      this.hpos = 0;
      this.el = document.createElement('div');
      this.el.className = 'scope';
      host.appendChild(this.el);
      this.build();
      this.resetBuffer();
    }
    build() {
      const chCtl = (i) => `<div class="sc-ch" data-ch="${i}" style="--cc:${CH_COLOR[i]}">
          <button class="sc-chbtn" data-a="on" title="채널 켜기/끄기">CH${i + 1}</button>
          <button class="sc-src" data-a="pick" title="회로에서 측정할 점을 눌러 연결 (부품을 누르면 전류)">🔌 <span class="sc-srct">연결 안 됨</span></button>
          <button class="sc-small sc-x" data-a="unpick" title="이 채널의 프로브 빼기">✕</button>
          <span class="sc-knob"><button data-a="v-" title="V/div 크게">−</button><span class="sc-vd">1 V</span><button data-a="v+" title="V/div 작게">+</button></span>
          <span class="sc-knob"><button data-a="p-" title="위치 아래로">▼</button><button data-a="p+" title="위치 위로">▲</button></span>
          <button class="sc-cpl" data-a="ac" title="결합: DC / AC">DC</button>
        </div>`;
      this.el.innerHTML = `
        <div class="sc-screen"><canvas></canvas><div class="sc-over"><span class="sc-tbv"></span><span class="sc-st"></span></div></div>
        <div class="sc-ctl">
          ${chCtl(0)}${chCtl(1)}
          <div class="sc-row">
            <span class="sc-lab">시간축</span>
            <span class="sc-knob"><button data-a="t-" title="Time/div 작게">−</button><span class="sc-tb">1 ms</span><button data-a="t+" title="Time/div 크게">+</button></span>
            <span class="sc-lab">트리거</span>
            <button class="sc-small" data-a="tsrc" title="트리거 소스">CH1</button>
            <button class="sc-small" data-a="tedge" title="상승/하강 에지">↑</button>
            <span class="sc-knob"><button data-a="l-">−</button><span class="sc-lvl">0 V</span><button data-a="l+">+</button></span>
          </div>
          <div class="sc-row">
            <button class="sc-small" data-a="mode" title="AUTO / NORMAL / SINGLE">AUTO</button>
            <button class="sc-small" data-a="run" title="실행 / 정지">■ 정지</button>
            <button class="sc-small" data-a="xy" title="XY 모드">XY</button>
            <button class="sc-small" data-a="auto" title="V/div · 시간축 자동 설정">⚙ 자동 설정</button>
            <button class="sc-small" data-a="clear" title="파형 지우기">⌫</button>
          </div>
        </div>
        <div class="sc-meas"></div>`;
      this.cv = this.el.querySelector('canvas');
      this.el.addEventListener('click', (e) => this.onClick(e));
      this.syncUi();
    }
    onClick(e) {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      const chEl = b.closest('[data-ch]');
      const c = chEl ? this.ch[+chEl.dataset.ch] : null;
      switch (a) {
        case 'on': c.on = !c.on; break;
        case 'pick': if (this.opts.onPick) this.opts.onPick(+chEl.dataset.ch); return;
        case 'unpick': this.clearSource(+chEl.dataset.ch); return;
        case 'v-': c.vdiv = stepList(c.fn && c.fn.unit === 'A' ? AD_LIST : VD_LIST, c.vdiv, 1); break;
        case 'v+': c.vdiv = stepList(c.fn && c.fn.unit === 'A' ? AD_LIST : VD_LIST, c.vdiv, -1); break;
        case 'p-': c.pos = Math.max(-4, c.pos - 0.5); break;
        case 'p+': c.pos = Math.min(4, c.pos + 0.5); break;
        case 'ac': c.ac = !c.ac; break;
        case 't-': this.setTb(stepList(TB_LIST, this.tb, -1)); break;
        case 't+': this.setTb(stepList(TB_LIST, this.tb, 1)); break;
        case 'tsrc': this.trig.src = this.trig.src ? 0 : 1; break;
        case 'tedge': this.trig.edge = this.trig.edge === 'rise' ? 'fall' : 'rise'; break;
        case 'l-': this.trig.level -= this.ch[this.trig.src].vdiv * 0.25; break;
        case 'l+': this.trig.level += this.ch[this.trig.src].vdiv * 0.25; break;
        case 'mode': this.trig.mode = { auto: 'normal', normal: 'single', single: 'auto' }[this.trig.mode]; this.runState = this.trig.mode === 'single' ? 'arm' : 'run'; break;
        case 'run': this.runState = this.runState === 'stop' ? (this.trig.mode === 'single' ? 'arm' : 'run') : 'stop'; break;
        case 'xy': this.xy = !this.xy; break;
        case 'auto': this.autoSet(); break;
        case 'clear': this.resetBuffer(); break;
      }
      this.syncUi();
      this.draw();
    }
    syncUi() {
      const q = (s) => this.el.querySelector(s);
      this.ch.forEach((c, i) => {
        const box = this.el.querySelector(`[data-ch="${i}"]`);
        box.classList.toggle('off', !c.on);
        box.querySelector('.sc-srct').textContent = srcLabel(c.src);
        box.querySelector('.sc-x').style.visibility = c.src ? 'visible' : 'hidden';
        box.querySelector('.sc-vd').textContent = CS.siText(c.vdiv) + (c.fn && c.fn.unit === 'A' ? 'A' : 'V');
        box.querySelector('.sc-cpl').textContent = c.ac ? 'AC' : 'DC';
      });
      q('.sc-tb').textContent = CS.siText(this.tb) + 's';
      q('[data-a="tsrc"]').textContent = 'CH' + (this.trig.src + 1);
      q('[data-a="tedge"]').textContent = this.trig.edge === 'rise' ? '↑ 상승' : '↓ 하강';
      q('.sc-lvl').textContent = CS.fmt(this.trig.level, this.ch[this.trig.src].fn && this.ch[this.trig.src].fn.unit === 'A' ? 'A' : 'V');
      q('[data-a="mode"]').textContent = { auto: 'AUTO', normal: 'NORMAL', single: 'SINGLE' }[this.trig.mode];
      q('[data-a="run"]').textContent = this.runState === 'stop' ? '▶ 실행' : '■ 정지';
      q('[data-a="xy"]').classList.toggle('on', this.xy);
    }
    setTb(tb) { this.tb = tb; this.resetBuffer(); if (this.opts.onTimebase) this.opts.onTimebase(tb); }
    configure(cfg) {
      if (!cfg) return;
      [cfg.ch1, cfg.ch2].forEach((s, i) => { if (s == null) return; this.ch[i].src = parseSource(s); this.ch[i].on = true; });
      if (cfg.v1) this.ch[0].vdiv = CS.parseNum(cfg.v1);
      if (cfg.v2) this.ch[1].vdiv = CS.parseNum(cfg.v2);
      if (cfg.o1 != null) this.ch[0].pos = +cfg.o1;
      if (cfg.o2 != null) this.ch[1].pos = +cfg.o2;
      if (cfg.c1 === 'ac') this.ch[0].ac = true;
      if (cfg.c2 === 'ac') this.ch[1].ac = true;
      if (cfg.tb) this.tb = CS.parseNum(cfg.tb);
      if (cfg.trig) this.trig.src = +cfg.trig === 2 ? 1 : 0;
      if (cfg.lvl != null) this.trig.level = CS.parseNum(cfg.lvl);
      if (cfg.edge) this.trig.edge = cfg.edge === 'fall' ? 'fall' : 'rise';
      if (cfg.mode) this.trig.mode = cfg.mode;
      if (cfg.xy) this.xy = !!+cfg.xy;
      this.resetBuffer();
      this.syncUi();
    }
    attach(view) {
      this.view = view;
      this.bindSources();
      this.hookSim();
    }
    detach() { if (this.unsub) this.unsub(); this.unsub = null; this.view = null; this.ch.forEach((c) => { c.fn = null; }); }
    hookSim() {
      if (this.unsub) this.unsub();
      this.unsub = null;
      const sim = this.view && this.view.sim;
      if (!sim) return;
      this.resetBuffer();
      this.unsub = sim.onStep((s) => this.sample(s));
    }
    bindSources() {
      const sim = this.view && this.view.sim;
      this.ch.forEach((c) => { c.fn = resolveSource(sim, c.src); });
      this.updateMarks();
      this.syncUi();
    }
    updateMarks() {
      const v = this.view;
      if (!v) return;
      this.ch.forEach((c, i) => {
        const key = 'ch' + i;
        const s = c.src;
        if (!s || !c.on) { v.setMark(key, null); return; }
        if (s.el) { v.setMark(key, { el: s.el, color: c.color, text: 'CH' + (i + 1) }); return; }
        let pt = s.a;
        if (typeof pt === 'string') {
          const pe = v.circ.elements.find((e) => (e.type === 'P' || e.type === 'N') && String(e.params.label) === pt);
          pt = pe ? { x: pe.x, y: pe.y } : null;
        }
        v.setMark(key, pt ? { x: pt.x, y: pt.y, color: c.color, text: 'CH' + (i + 1) } : null);
      });
    }
    clearSource(i) { this.ch[i].src = null; this.ch[i].fn = null; this.bindSources(); this.resetBuffer(); this.draw(); }
    setSource(i, src) {
      this.ch[i].src = src;
      this.ch[i].on = true;
      this.bindSources();
      const c = this.ch[i];
      if (c.fn && c.fn.unit === 'A' && c.vdiv > 0.5) c.vdiv = 1e-3;
      this.resetBuffer();
      this.syncUi();
    }
    resetBuffer() {
      this.bucketT = this.tb * 10 / 800;
      this.cap = 3200;
      this.buf = { t: new Float64Array(this.cap), mn: [new Float64Array(this.cap), new Float64Array(this.cap)], mx: [new Float64Array(this.cap), new Float64Array(this.cap)], n: 0, head: 0 };
      this.cur = null;
      this.frozen = null;
      if (this.trig.mode === 'single' && this.runState !== 'stop') this.runState = 'arm';
    }
    sample(sim) {
      if (this.runState === 'stop') return;
      const v0 = this.ch[0].fn ? this.ch[0].fn.get() : NaN;
      const v1 = this.ch[1].fn ? this.ch[1].fn.get() : NaN;
      const t = sim.t;
      let c = this.cur;
      if (!c || t >= c.t0 + this.bucketT || t < c.t0) {
        if (c) this.push(c);
        c = this.cur = { t0: t - (t % this.bucketT), mn0: v0, mx0: v0, mn1: v1, mx1: v1 };
      }
      if (v0 < c.mn0) c.mn0 = v0; if (v0 > c.mx0) c.mx0 = v0;
      if (v1 < c.mn1) c.mn1 = v1; if (v1 > c.mx1) c.mx1 = v1;
    }
    push(c) {
      const b = this.buf, i = b.head;
      b.t[i] = c.t0; b.mn[0][i] = c.mn0; b.mx[0][i] = c.mx0; b.mn[1][i] = c.mn1; b.mx[1][i] = c.mx1;
      b.head = (i + 1) % this.cap;
      b.n = Math.min(this.cap, b.n + 1);
    }
    idx(k) { const b = this.buf; return (b.head - b.n + k + this.cap * 2) % this.cap; }
    autoSet() {
      const b = this.buf;
      if (!b || !b.n) return;
      [0, 1].forEach((ci) => {
        const c = this.ch[ci];
        if (!c.fn) return;
        let mn = Infinity, mx = -Infinity;
        for (let k = 0; k < b.n; k++) { const i = this.idx(k); if (isFinite(b.mn[ci][i])) { mn = Math.min(mn, b.mn[ci][i]); mx = Math.max(mx, b.mx[ci][i]); } }
        if (!isFinite(mn)) return;
        const span = c.ac ? (mx - mn) : Math.max(Math.abs(mx), Math.abs(mn)) * 2;
        const list = c.fn.unit === 'A' ? AD_LIST : VD_LIST;
        c.vdiv = list.find((v) => v * 6 >= span) || list[list.length - 1];
        c.pos = 0;
        if (!c.ac && mn >= -1e-9 && mx > 0) { c.pos = -3; c.vdiv = list.find((v) => v * 6.5 >= mx) || c.vdiv; }
        if (ci === this.trig.src) this.trig.level = c.ac ? 0 : (mx + mn) / 2;
      });
      const m = this.measure(this.trig.src, true);
      if (m && m.freq > 0) this.setTb(nearest(TB_LIST, 2.5 / m.freq / 10));
      this.syncUi();
    }
    window() {
      const b = this.buf;
      if (!b || b.n < 2) return null;
      const screen = this.tb * 10;
      const tLast = b.t[this.idx(b.n - 1)];
      const tFirst = b.t[this.idx(0)];
      if (this.runState === 'stop' && this.frozen) return this.frozen;
      if (this.tb >= 0.05) { const t1 = Math.max(tLast, screen); return { t0: t1 - screen, t1, roll: true }; }
      const tr = this.trig;
      const ci = tr.src;
      const c = this.ch[ci];
      let found = null;
      if (c.fn) {
        const pre = screen * this.hpos;
        const lvl = tr.level + (c.ac ? this.mean(ci) : 0);
        for (let k = b.n - 2; k >= 1; k--) {
          const i = this.idx(k), j = this.idx(k - 1);
          const t = b.t[i];
          if (t + screen - pre > tLast) continue;
          if (t - pre < tFirst) break;
          const a = (b.mn[ci][j] + b.mx[ci][j]) / 2, v = (b.mn[ci][i] + b.mx[ci][i]) / 2;
          if (tr.edge === 'rise' ? a < lvl && v >= lvl : a > lvl && v <= lvl) { found = t - pre; break; }
        }
      }
      if (found != null) {
        const w = { t0: found, t1: found + screen, trig: true };
        if (tr.mode === 'single' && this.runState === 'arm') { this.runState = 'stop'; this.frozen = w; this.syncUi(); }
        this.lastTrig = w;
        return w;
      }
      if (tr.mode === 'normal' || tr.mode === 'single') return this.lastTrig && this.lastTrig.t0 >= tFirst ? this.lastTrig : null;
      return { t0: Math.max(tFirst, tLast - screen), t1: Math.max(tFirst, tLast - screen) + screen, trig: false };
    }
    mean(ci) {
      const b = this.buf;
      let s = 0, n = 0;
      for (let k = Math.max(0, b.n - 800); k < b.n; k++) { const i = this.idx(k); const v = (b.mn[ci][i] + b.mx[ci][i]) / 2; if (isFinite(v)) { s += v; n++; } }
      return n ? s / n : 0;
    }
    measure(ci, recent) {
      const b = this.buf;
      if (!b || b.n < 4 || !this.ch[ci].fn) return null;
      let k0 = 0, k1 = b.n;
      const w = recent ? null : this.window();
      if (w) {
        while (k0 < b.n && b.t[this.idx(k0)] < w.t0) k0++;
        k1 = k0;
        while (k1 < b.n && b.t[this.idx(k1)] <= w.t1) k1++;
      } else k0 = Math.max(0, b.n - 800);
      let mn = Infinity, mx = -Infinity, s = 0, sq = 0, n = 0;
      for (let k = k0; k < k1; k++) {
        const i = this.idx(k);
        const lo = b.mn[ci][i], hi = b.mx[ci][i];
        if (!isFinite(lo)) continue;
        mn = Math.min(mn, lo); mx = Math.max(mx, hi);
        const v = (lo + hi) / 2;
        s += v; sq += v * v; n++;
      }
      if (!n) return null;
      const avg = s / n, rms = Math.sqrt(sq / n);
      let freq = 0;
      const pp = mx - mn;
      if (pp > 1e-9) {
        const hi = avg + pp * 0.1, lo = avg - pp * 0.1;
        let state = 0, first = null, last = null, cnt = 0;
        for (let k = k0; k < k1; k++) {
          const i = this.idx(k);
          const v = (b.mn[ci][i] + b.mx[ci][i]) / 2;
          if (state <= 0 && v > hi) { if (state === -1) { const t = b.t[i]; if (first == null) first = t; else { last = t; cnt++; } } state = 1; }
          else if (state >= 0 && v < lo) state = -1;
        }
        if (cnt >= 1 && last > first) freq = cnt / (last - first);
      }
      return { min: mn, max: mx, pp, avg, rms, freq };
    }
    draw() {
      const cv = this.cv;
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(50, cv.clientWidth), H = Math.max(40, cv.clientHeight);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#071410';
      g.fillRect(0, 0, W, H);
      const DX = 10, DY = 8, dw = W / DX, dh = H / DY;
      g.strokeStyle = 'rgba(120,200,170,.16)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 1; i < DX; i++) { g.moveTo(Math.round(i * dw) + 0.5, 0); g.lineTo(Math.round(i * dw) + 0.5, H); }
      for (let i = 1; i < DY; i++) { g.moveTo(0, Math.round(i * dh) + 0.5); g.lineTo(W, Math.round(i * dh) + 0.5); }
      g.stroke();
      g.strokeStyle = 'rgba(120,200,170,.34)';
      g.beginPath();
      g.moveTo(W / 2 + 0.5, 0); g.lineTo(W / 2 + 0.5, H); g.moveTo(0, H / 2 + 0.5); g.lineTo(W, H / 2 + 0.5);
      for (let i = 0; i <= DX * 5; i++) { const x = Math.round(i * dw / 5) + 0.5; g.moveTo(x, H / 2 - 3); g.lineTo(x, H / 2 + 4); }
      for (let i = 0; i <= DY * 5; i++) { const y = Math.round(i * dh / 5) + 0.5; g.moveTo(W / 2 - 3, y); g.lineTo(W / 2 + 4, y); }
      g.stroke();
      const b = this.buf;
      const st = this.el.querySelector('.sc-st');
      const tbv = this.el.querySelector('.sc-tbv');
      tbv.textContent = this.xy ? `XY  CH1 ${CS.siText(this.ch[0].vdiv)}/div  CH2 ${CS.siText(this.ch[1].vdiv)}/div` : `${CS.siText(this.tb)}s/div`;
      if (!b || b.n < 2 || !this.view) {
        g.fillStyle = 'rgba(160,220,200,.6)';
        g.font = '13px Pretendard Variable, sans-serif';
        g.textAlign = 'center';
        g.fillText(this.view ? (this.ch.some((c) => c.fn) ? '신호를 기다리는 중…' : '🔌 로 채널을 회로의 점에 연결하세요') : '회로를 선택하면 파형이 표시됩니다', W / 2, H / 2 - 10);
        st.textContent = '';
        this.drawMeas();
        return;
      }
      if (this.xy) { this.drawXY(g, W, H, dw, dh); st.textContent = this.runState === 'stop' ? 'STOP' : 'XY'; this.drawMeas(); return; }
      const w = this.window();
      st.textContent = this.runState === 'stop' ? 'STOP' : !w ? 'WAIT' : w.roll ? 'ROLL' : w.trig ? 'TRIG’D' : 'AUTO';
      if (!w) { this.drawMeas(); return; }
      if (this.runState !== 'stop') this.frozen = w;
      const span = w.t1 - w.t0;
      const X = (t) => (t - w.t0) / span * W;
      [0, 1].forEach((ci) => {
        const c = this.ch[ci];
        if (!c.on || !c.fn) return;
        const off = c.ac ? this.mean(ci) : 0;
        const Y = (v) => H / 2 - ((v - off) / c.vdiv + c.pos) * dh;
        g.strokeStyle = c.color;
        g.lineWidth = 1.8;
        g.shadowColor = c.color;
        g.shadowBlur = 4;
        g.beginPath();
        let started = false;
        for (let k = 0; k < b.n; k++) {
          const i = this.idx(k);
          const t = b.t[i];
          if (t < w.t0 - this.bucketT || t > w.t1 + this.bucketT) continue;
          const x = X(t);
          const lo = b.mn[ci][i], hi = b.mx[ci][i];
          if (!isFinite(lo)) { started = false; continue; }
          const y1 = Y(lo), y2 = Y(hi);
          if (!started) { g.moveTo(x, y1); started = true; } else g.lineTo(x, y1);
          if (Math.abs(y2 - y1) > 0.8) g.lineTo(x, y2);
        }
        g.stroke();
        g.shadowBlur = 0;
        const y0 = H / 2 - c.pos * dh;
        g.fillStyle = c.color;
        g.beginPath(); g.moveTo(0, y0 - 5); g.lineTo(7, y0); g.lineTo(0, y0 + 5); g.fill();
        g.font = 'bold 10px monospace';
        g.textAlign = 'left';
        g.fillText(String(ci + 1), 8, y0 + 3.5);
      });
      const tc = this.ch[this.trig.src];
      if (tc.on && tc.fn && !w.roll) {
        const yl = H / 2 - (this.trig.level / tc.vdiv + tc.pos) * dh;
        g.strokeStyle = 'rgba(255,160,60,.55)';
        g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(0, yl); g.lineTo(W, yl); g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#ffa03c';
        g.beginPath(); g.moveTo(W, yl - 5); g.lineTo(W - 7, yl); g.lineTo(W, yl + 5); g.fill();
      }
      this.drawMeas();
    }
    drawXY(g, W, H, dw, dh) {
      const b = this.buf;
      const cx = this.ch[0], cy = this.ch[1];
      if (!cx.fn || !cy.fn) return;
      const ox = cx.ac ? this.mean(0) : 0, oy = cy.ac ? this.mean(1) : 0;
      g.strokeStyle = '#7CFFB2';
      g.lineWidth = 1.6;
      g.beginPath();
      const n = Math.min(b.n, 1600);
      for (let k = b.n - n; k < b.n; k++) {
        const i = this.idx(k);
        const x = W / 2 + ((b.mn[0][i] + b.mx[0][i]) / 2 - ox) / cx.vdiv * dw;
        const y = H / 2 - (((b.mn[1][i] + b.mx[1][i]) / 2 - oy) / cy.vdiv + cy.pos) * dh;
        if (k === b.n - n) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    drawMeas() {
      const box = this.el.querySelector('.sc-meas');
      const now = performance.now();
      if (this._mt && now - this._mt < 300) return;
      this._mt = now;
      const rows = [0, 1].map((ci) => {
        const c = this.ch[ci];
        if (!c.on || !c.fn) return '';
        const m = this.measure(ci);
        const u = c.fn.unit;
        if (!m) return '';
        return `<div class="sc-mrow" style="--cc:${c.color}"><b>CH${ci + 1}</b>
          <span>최대 <i>${F(m.max, u)}</i></span><span>최소 <i>${F(m.min, u)}</i></span><span>p-p <i>${F(m.pp, u)}</i></span>
          <span>평균 <i>${F(m.avg, u)}</i></span><span>실효 <i>${F(m.rms, u)}</i></span><span>주파수 <i>${m.freq ? F(m.freq, 'Hz') : '—'}</i></span></div>`;
      }).join('');
      box.innerHTML = rows || '<div class="sc-mrow muted">채널을 회로에 연결하면 측정값이 표시됩니다</div>';
    }
  }

  // ================================================================= 멀티미터
  class Meter {
    constructor(host, opts = {}) {
      this.opts = opts;
      this.mode = 'dcv';
      this.red = null; this.black = null; this.elName = null;
      this.el = document.createElement('div');
      this.el.className = 'dmm';
      this.el.innerHTML = `
        <div class="dmm-lcd"><span class="dmm-mode">DC V</span><span class="dmm-val">— — —</span><span class="dmm-unit">V</span></div>
        <div class="dmm-modes">
          <button data-m="dcv" title="직류 전압 (평균)">V⎓</button><button data-m="acv" title="교류 전압 (실효값)">V~</button>
          <button data-m="dca" title="직류 전류 (평균)">A⎓</button><button data-m="aca" title="교류 전류 (실효값)">A~</button>
          <button data-m="ohm" title="저항 (전원을 끈 상태로 측정)">Ω</button>
        </div>
        <div class="dmm-probes">
          <button class="dmm-p red" data-p="red" title="빨간 리드(+)를 댈 점">🔴 <span>+ 리드</span></button>
          <button class="dmm-p black" data-p="black" title="검은 리드(COM)를 댈 점 (기본: 접지)">⚫ <span>COM: 접지</span></button>
          <button class="dmm-p el hidden" data-p="el" title="전류를 잴 소자">🔌 <span>소자 고르기</span></button>
          <button class="dmm-x" data-p="clear" title="리드를 모두 빼기">✕ 빼기</button>
        </div>`;
      host.appendChild(this.el);
      this.el.addEventListener('click', (e) => {
        const m = e.target.closest('[data-m]');
        if (m) { this.mode = m.dataset.m; this.bind(); this.sync(); return; }
        const p = e.target.closest('[data-p]');
        if (p && p.dataset.p === 'clear') { this.clearLeads(); return; }
        if (p && this.opts.onPick) this.opts.onPick(p.dataset.p);
      });
      this.resetAvg();
      this.sync();
    }
    clearLeads() { this.red = null; this.black = null; this.elName = null; this.ohmCache = null; this.bind(); this.sync(); }
    configure(cfg) {
      if (!cfg) return;
      if (cfg.mode) this.mode = { v: 'dcv', vdc: 'dcv', vac: 'acv', a: 'dca', adc: 'dca', aac: 'aca', ohm: 'ohm', r: 'ohm' }[cfg.mode] || cfg.mode;
      if (cfg.red) this.red = cfg.red;
      if (cfg.black) this.black = cfg.black === 'GND' ? null : cfg.black;
      if (cfg.el) this.elName = cfg.el;
      this.resetAvg();
      this.sync();
    }
    sync() {
      this.el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('active', b.dataset.m === this.mode));
      const cur = this.mode === 'dca' || this.mode === 'aca';
      this.el.querySelector('[data-p="red"]').classList.toggle('hidden', cur);
      this.el.querySelector('[data-p="black"]').classList.toggle('hidden', cur);
      this.el.querySelector('[data-p="el"]').classList.toggle('hidden', !cur);
      this.el.querySelector('[data-p="clear"]').classList.toggle('hidden', !(this.red || this.black || this.elName));
      const n = (p) => (p == null ? '접지' : typeof p === 'string' ? p : `(${p.x},${p.y})`);
      this.el.querySelector('[data-p="red"] span').textContent = this.red ? '+ ' + n(this.red) : '+ 리드';
      this.el.querySelector('[data-p="black"] span').textContent = 'COM: ' + n(this.black);
      this.el.querySelector('[data-p="el"] span').textContent = this.elName ? this.elName + ' 의 전류' : '소자 고르기';
      this.el.querySelector('.dmm-mode').textContent = { dcv: 'DC V', acv: 'AC V (rms)', dca: 'DC A', aca: 'AC A (rms)', ohm: 'Ω' }[this.mode];
      this.updateMarks();
    }
    attach(view) {
      this.view = view;
      this.bind();
      this.hookSim();
    }
    hookSim() {
      if (this.unsub) this.unsub();
      this.unsub = null;
      const sim = this.view && this.view.sim;
      if (sim) this.unsub = sim.onStep(() => this.sample());
      this.ohmCache = null;
    }
    detach() { if (this.unsub) this.unsub(); this.unsub = null; this.view = null; }
    bind() {
      const sim = this.view && this.view.sim;
      if (this.mode === 'dca' || this.mode === 'aca') this.fn = this.elName ? resolveSource(sim, { el: this.elName }) : null;
      else this.fn = this.red ? resolveSource(sim, { a: this.red, b: this.black }) : null;
      this.ohmCache = null;
      this.resetAvg();
      this.updateMarks();
    }
    updateMarks() {
      const v = this.view;
      if (!v) return;
      const pt = (p) => {
        if (p == null) return null;
        if (typeof p === 'string') { const e = v.circ.elements.find((x) => (x.type === 'P' || x.type === 'N') && String(x.params.label) === p); return e ? { x: e.x, y: e.y } : null; }
        return p;
      };
      const cur = this.mode === 'dca' || this.mode === 'aca';
      const r = cur ? null : pt(this.red), bl = cur ? null : pt(this.black);
      v.setMark('m+', r ? { x: r.x, y: r.y, color: '#ef4444', text: '+' } : null);
      v.setMark('m-', bl ? { x: bl.x, y: bl.y, color: '#94a3b8', text: 'COM' } : null);
      v.setMark('mA', cur && this.elName ? { el: this.elName, color: '#ef4444', text: 'A' } : null);
    }
    resetAvg() { this.acc = { s: 0, sq: 0, n: 0 }; this.shown = null; }
    sample() {
      if (!this.fn || this.mode === 'ohm') return;
      const v = this.fn.get();
      if (!isFinite(v)) return;
      const a = this.acc;
      a.s += v; a.sq += v * v; a.n++;
    }
    tick() {
      const val = this.el.querySelector('.dmm-val'), unit = this.el.querySelector('.dmm-unit');
      const now = performance.now();
      if (this._t && now - this._t < 250) return;
      this._t = now;
      if (this.mode === 'ohm') {
        const sim = this.view && this.view.sim;
        if (!sim || !this.red) { val.textContent = '— — —'; unit.textContent = 'Ω'; return; }
        if (this.ohmCache == null) {
          try { this.ohmCache = sim.measureResistance(netOfRef(sim, this.red), netOfRef(sim, this.black)); } catch (e) { this.ohmCache = NaN; }
        }
        const r = this.ohmCache;
        if (!isFinite(r)) { val.textContent = isNaN(r) ? '— — —' : 'O.L'; unit.textContent = 'Ω'; return; }
        const s = CS.fmt(r, 'Ω').split(' ');
        val.textContent = s[0]; unit.textContent = s[1] || 'Ω';
        return;
      }
      const a = this.acc;
      if (!this.fn) { val.textContent = '— — —'; unit.textContent = this.mode.slice(-1) === 'v' ? 'V' : 'A'; return; }
      let shown = this.shown;
      if (a.n) {
        const mean = a.s / a.n;
        const rms = Math.sqrt(Math.max(0, a.sq / a.n - mean * mean));
        shown = this.mode === 'dcv' || this.mode === 'dca' ? mean : rms;
        this.shown = shown;
        this.acc = { s: 0, sq: 0, n: 0 };
      }
      if (shown == null) { const v = this.fn.get(); shown = this.mode[0] === 'd' ? v : 0; }
      const s = CS.fmt(shown, this.fn.unit).split(' ');
      val.textContent = s[0];
      unit.textContent = s[1] || this.fn.unit;
    }
  }

  // ================================================================= 로직 분석기
  function valueAt(hist, t) {
    let lo = 0, hi = hist.length - 1, v = hist.length ? hist[0][1] : LZ;
    if (!hist.length || t < hist[0][0]) return hist.length ? hist[0][1] : LZ;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (hist[m][0] <= t) { v = hist[m][1]; lo = m + 1; } else hi = m - 1; }
    return v;
  }
  function drawTiming(cv, sim, chans, t1, tb, opts) {
    opts = opts || {};
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return null;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#060b10';
    ctx.fillRect(0, 0, W, H);
    const labW = 64, top = 6, bottom = 16;
    const n = Math.max(1, chans.length);
    const rowH = (H - top - bottom) / n;
    const plotW = W - labW - 6;
    const span = tb * 10;
    const t0 = t1 - span;
    const X = (t) => labW + (t - t0) / span * plotW;
    ctx.strokeStyle = '#16212c';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const x = Math.round(labW + plotW * i / 10) + 0.5; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, H - bottom); ctx.stroke(); }
    ctx.font = '600 11px JetBrains Mono, Consolas, monospace';
    if (!chans.length) {
      ctx.fillStyle = '#5b6b7e'; ctx.textAlign = 'center';
      ctx.fillText('＋ 채널 로 회로의 넷을 연결하세요', W / 2, H / 2);
      ctx.textAlign = 'left';
    }
    chans.forEach((ch, i) => {
      const col = LA_COLORS[i % LA_COLORS.length];
      const yTop = top + i * rowH + rowH * 0.22, yBot = top + (i + 1) * rowH - rowH * 0.2, yMid = (yTop + yBot) / 2;
      ctx.strokeStyle = '#111c26';
      ctx.beginPath(); ctx.moveTo(labW, top + (i + 1) * rowH + 0.5); ctx.lineTo(W, top + (i + 1) * rowH + 0.5); ctx.stroke();
      ctx.fillStyle = col;
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ch.name).slice(0, 9), 4, yMid);
      if (ch.net == null || ch.net < 0 || !sim.nets[ch.net]) return;
      const hist = sim.nets[ch.net].hist;
      let v = valueAt(hist, t0);
      let x = labW;
      let idx = hist.findIndex((h) => h[0] > t0);
      if (idx < 0) idx = hist.length;
      const segs = [];
      for (let k = idx; k <= hist.length; k++) {
        const tt = k < hist.length ? Math.min(hist[k][0], t1) : t1;
        if (k < hist.length && hist[k][0] > t1) { segs.push([x, X(t1), v]); break; }
        const x2 = X(tt);
        segs.push([x, x2, v]);
        x = x2;
        if (k < hist.length) v = hist[k][1];
      }
      ctx.lineWidth = 2;
      let prevY = null;
      segs.forEach(([a, b, val]) => {
        if (b < a) return;
        if (val === LX) {
          ctx.fillStyle = 'rgba(239,68,68,.35)'; ctx.fillRect(a, yTop, Math.max(1, b - a), yBot - yTop);
          ctx.strokeStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(a, yTop); ctx.lineTo(b, yTop); ctx.moveTo(a, yBot); ctx.lineTo(b, yBot); ctx.stroke();
          prevY = null; return;
        }
        const y = val === L1 ? yTop : val === L0 ? yBot : yMid;
        ctx.strokeStyle = val === LZ ? '#60a5fa' : col;
        ctx.setLineDash(val === LZ ? [4, 3] : []);
        ctx.beginPath();
        if (prevY != null && prevY !== y) { ctx.moveTo(a, prevY); ctx.lineTo(a, y); } else ctx.moveTo(a, y);
        ctx.lineTo(b, y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (val === L1) { ctx.fillStyle = col + '22'; ctx.fillRect(a, yTop, b - a, yBot - yTop); }
        prevY = y;
      });
    });
    ctx.fillStyle = '#5b6b7e';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 10px JetBrains Mono, Consolas, monospace';
    ctx.fillText(`${CS.siText(tb)}s/div`, labW + 2, H - 4);
    const tt = `t = ${CS.siText(t1)}s`;
    ctx.fillText(tt, W - ctx.measureText(tt).width - 6, H - 4);
    if (opts.cursor != null && opts.cursor >= labW && opts.cursor <= W) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(opts.cursor + 0.5, top); ctx.lineTo(opts.cursor + 0.5, H - bottom); ctx.stroke();
      ctx.setLineDash([]);
    }
    return { labW, plotW, t0, t1, span };
  }

  // ================================================================= 계측기 패널
  class InstrumentPanel {
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = opts;
      const fold = (k) => (opts.store && opts.store.get('jc.ip.fold.' + k, '0') === '1' ? ' folded' : '');
      const card = (k, title, body, extra) => `<section class="ip-card${fold(k)}" data-card="${k}"><div class="ip-card-h"><span class="caret">▾</span>${title}<span class="spacer"></span>${extra || ''}</div><div class="ip-card-b">${body}</div></section>`;
      host.innerHTML = `
        <div class="ip-head"><span class="ip-title">🔬 계측기 <span class="ip-name muted"></span></span><span class="spacer"></span><span class="ip-time" title="시뮬레이션 시간"></span></div>
        <div class="ip-sim">
          <button class="btn small" data-a="run" title="시뮬레이션 실행/일시정지">⏸ 일시정지</button>
          <button class="btn small ghost" data-a="reset" title="처음부터 다시 (전원 켠 순간부터)">↺ 다시</button>
          <button class="btn small ghost" data-a="step" title="다음 클럭 상승 에지까지 진행">⏭ 클럭</button>
          <label class="ip-speed" title="시뮬레이션 속도 배율">속도 <input type="range" min="-4" max="4" step="1" value="0" data-a="speed"><span>×1</span></label>
          <button class="btn small ghost" data-a="dots" title="전류 흐름(점) 보이기">⋯ 전류</button>
          <button class="btn small ghost" data-a="volt" title="전압 · 논리 색 보이기">🎨 색</button>
          <span class="ip-mode" title="시뮬레이션 방식"></span>
        </div>
        <div class="ip-body">
          ${card('meter', '📟 멀티미터', '<div class="ip-meter"></div>')}
          ${card('scope', '📈 오실로스코프', '<div class="ip-scope"></div>')}
          ${card('la', '📊 로직 분석기', `<div class="la-screen"><canvas class="la-canvas"></canvas><div class="la-read"></div></div><div class="la-chans"></div>`,
    '<button class="sc-small" data-ip="hold" title="화면 멈춤 / 계속">⏸ 멈춤</button><span class="sc-knob"><button data-ip="tb-" title="Time/div 줄이기">−</button><span class="la-tb">1 s</span><button data-ip="tb+" title="Time/div 늘리기">+</button></span>')}
          ${card('io', '🎛️ 디지털 입력 · 출력', '<div class="io-body"></div>')}
          ${card('probe', '🔴 로직 프로브', `<div class="lp"><button class="sc-src lp-src" data-ip="probe">🔌 측정할 점 고르기</button>
              <span class="lp-led hi" title="HIGH">HI</span><span class="lp-led lo" title="LOW">LO</span><span class="lp-led pu" title="변화(펄스) 감지">PULSE</span><span class="lp-val">–</span></div>`)}
          ${card('points', '📍 측정점', '<div class="ip-probes"></div>')}
          ${card('tt', '📋 진리표', '<div class="tt-body"><div class="ip-help">논리 입력 스위치(SW · DIP)의 <b>모든 조합</b>을 넣어 보고 출력(로직 LED · 측정점 · 표시기)을 표로 만듭니다.</div></div>', '<button class="sc-small" data-ip="tt">만들기</button>')}
          ${card('state', '🗂️ 내부 상태', '<div class="st-body"></div>')}
          <div class="ip-help">회로 위에 마우스를 올리면 <b>전압 · 논리값 · 전류 · 전력</b>이 표시됩니다. 점 · 부품 위에서 <b>오른쪽 버튼을 짧게</b> 누르면 계측기를 바로 연결할 수 있습니다.
            아날로그 넷은 <span style="color:#f87171">전압 색</span>, 디지털 넷은 <span style="color:#4ade80">논리 색</span>으로 보입니다.</div>
        </div>`;
      this.$ = (s) => host.querySelector(s);
      this.scope = new Scope(this.$('.ip-scope'), { onPick: (i) => this.pickFor('ch' + i), onTimebase: (tb) => { if (this.view) this.view.scopeTb = tb; } });
      this.meter = new Meter(this.$('.ip-meter'), { onPick: (p) => this.pickFor(p) });
      this.chans = [];
      this.laTb = 1;
      host.addEventListener('click', (e) => this.onClick(e));
      host.addEventListener('input', (e) => {
        if (e.target.dataset.a === 'speed') {
          const mul = [0.01, 0.05, 0.2, 0.5, 1, 2, 5, 20, 100][+e.target.value + 4];
          e.target.nextElementSibling.textContent = '×' + mul;
          if (this.view) this.view.speedMul = mul;
        }
      });
      this.bindIO();
      const cv = this.$('.la-canvas');
      cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); this.cursor = e.clientX - r.left; });
      cv.addEventListener('pointerleave', () => { this.cursor = null; this.$('.la-read').textContent = ''; });
      this.loop();
    }

    onClick(e) {
      const h = e.target.closest('.ip-card-h');
      if (h && !e.target.closest('button')) {
        const card = h.parentElement;
        card.classList.toggle('folded');
        if (this.opts.store) this.opts.store.set('jc.ip.fold.' + card.dataset.card, card.classList.contains('folded') ? '1' : '0');
        return;
      }
      const b = e.target.closest('[data-a], [data-ip]');
      if (!b) return;
      const v = this.view;
      if (!v) { if (this.opts.toast) this.opts.toast('먼저 회로를 눌러 선택하세요'); return; }
      const a = b.dataset.a || b.dataset.ip;
      const sim = v.sim;
      switch (a) {
        case 'run': v.running = !v.running; break;
        case 'reset': v.resetSim(); this.scope.resetBuffer(); this.renderIO(); break;
        case 'step': if (sim && sim.stepClock()) { v.running = false; v.updateVisuals(0); this.refreshIO(); } else if (this.opts.toast) this.opts.toast('클럭(CLK)이 없는 회로입니다'); break;
        case 'dots': v.showDots = !v.showDots; v.updateVisuals(0); break;
        case 'volt': v.showVolt = !v.showVolt; v.updateVisuals(0, true); break;
        case 'hold': this.hold = !this.hold; this.holdT = sim ? sim.t : 0; b.textContent = this.hold ? '▶ 계속' : '⏸ 멈춤'; b.classList.toggle('on', this.hold); break;
        case 'tb-': case 'tb+': this.laTb = stepList(LA_TB, this.laTb, a === 'tb+' ? 1 : -1); this.$('.la-tb').textContent = CS.siText(this.laTb) + 's'; break;
        case 'probe': v.startPick('node', '로직 프로브를 댈 점을 누르세요 (Esc 취소)', (r) => { this.probe = this.refOf(r); this.probeToggles = null; this.$('.lp-src').textContent = '🔌 ' + this.probe.name; }); break;
        case 'tt': this.buildTT(); break;
        case 'ch-add': v.startPick('node', '로직 분석기 채널에 연결할 점을 누르세요 (Esc 취소)', (r) => { if (this.chans.length < 8) this.chans.push(this.refOf(r)); this.renderChans(); }); break;
        case 'ch-pick': { const i = +b.dataset.i; v.startPick('node', `LA CH${i + 1} 을(를) 연결할 점을 누르세요`, (r) => { this.chans[i] = this.refOf(r); this.renderChans(); }); break; }
        case 'ch-del': this.chans.splice(+b.dataset.i, 1); this.renderChans(); break;
        case 'ch-auto': this.chans = this.autoChannels(); this.renderChans(); break;
      }
      this.sync();
    }
    /** 고른 점 → {name, pt, net} */
    refOf(h) {
      const v = this.view, sim = v.sim;
      const net = sim.netOfPoint(h.x, h.y);
      const probe = v.circ.elements.find((e) => e.type === 'P' && e.x === h.x && e.y === h.y);
      return { name: probe ? String(probe.params.label) : v.netName(net), pt: { x: h.x, y: h.y }, net };
    }

    sync() {
      const v = this.view;
      const q = (s) => this.host.querySelector(s);
      q('[data-a="run"]').textContent = v && !v.running ? '▶ 실행' : '⏸ 일시정지';
      q('[data-a="dots"]').classList.toggle('on', !!(v && v.showDots));
      q('[data-a="volt"]').classList.toggle('on', !!(v && v.showVolt));
      q('.ip-name').textContent = v ? '· ' + (v.opts.label || '회로') : '· 회로를 선택하세요';
      const sim = v && v.sim;
      q('[data-a="step"]').classList.toggle('hidden', !(sim && sim.hasClock));
      const mode = sim ? { lock: '⏱ 혼합 · 시간 간격 ' + CS.siText(sim.dt) + 's', event: '⚡ 혼합 · 사건 구동', digital: '🔢 디지털 · 사건 구동' }[sim.mode] : '';
      q('.ip-mode').textContent = mode;
      q('.ip-mode').title = sim ? (sim.mode === 'lock' ? '콘덴서 · 코일 · 교류가 있어 아날로그와 디지털을 같은 시간 간격으로 함께 진행합니다' : sim.mode === 'event' ? '상태가 있는 아날로그 소자가 없어, 디지털 사건이 생길 때마다 아날로그를 다시 풉니다' : '아날로그 부품이 없습니다') : '';
    }

    pickFor(which) {
      const v = this.view;
      if (!v) { if (this.opts.toast) this.opts.toast('먼저 회로를 눌러 선택하세요'); return; }
      if (which === 'el') {
        v.startPick('el', '전류를 잴 소자를 누르세요 (Esc 취소)', (h) => { this.meter.elName = h.el.name; this.meter.bind(); this.meter.sync(); });
        return;
      }
      const msg = which === 'red' ? '멀티미터 빨간 리드(+)를 댈 점을 누르세요' : which === 'black' ? '멀티미터 검은 리드(COM)를 댈 점을 누르세요' : `오실로스코프 ${which.toUpperCase()} 프로브를 댈 점을 누르세요 (부품을 누르면 전류)`;
      const cb = (h) => {
        const pt = { x: h.x, y: h.y };
        const probe = v.circ.elements.find((e) => e.type === 'P' && e.x === h.x && e.y === h.y);
        const ref = probe ? String(probe.params.label) : pt;
        const isGnd = v.sim.netOfPoint(h.x, h.y) === v.sim.gndNet;
        if (which === 'red') { this.meter.red = ref; this.meter.bind(); this.meter.sync(); }
        else if (which === 'black') { this.meter.black = isGnd ? null : ref; this.meter.bind(); this.meter.sync(); }
        else this.scope.setSource(+which.slice(2), { a: ref, b: null });
      };
      v.startPick('node', msg + ' (Esc 취소)', cb);
      if (which.startsWith('ch')) {
        const onDown = (e) => {
          if (!v.pick) { v.svg.removeEventListener('pointerdown', onDown, true); return; }
          const h = v.hitTest(e);
          if (h && h.kind === 'el' && h.el.type !== 'P' && h.el.type !== 'N') {
            e.stopPropagation(); e.preventDefault();
            v.endPick();
            this.scope.setSource(+which.slice(2), { el: h.el.name });
            v.svg.removeEventListener('pointerdown', onDown, true);
          }
        };
        v.svg.addEventListener('pointerdown', onDown, true);
      }
    }

    /** 회로에서 오른쪽 버튼: 그 점 / 소자에 계측기 바로 연결 */
    contextMenu(e, h, view) {
      if (!h) return false;
      if (this.view !== view) view.activate();
      const old = document.querySelector('.cv-menu');
      if (old) old.remove();
      const menu = document.createElement('div');
      menu.className = 'cv-menu';
      const probe = h.kind === 'node' ? view.circ.elements.find((x) => x.type === 'P' && x.x === h.x && x.y === h.y) : null;
      const ref = h.kind === 'node' ? (probe ? String(probe.params.label) : { x: h.x, y: h.y }) : null;
      const items = h.kind === 'node'
        ? [['ch0', '📈 CH1 을 이 점에'], ['ch1', '📈 CH2 를 이 점에'], ['red', '🔴 멀티미터 + 리드'], ['black', '⚫ 멀티미터 COM 리드'], ['la', '📊 로직 분석기 채널 추가'], ['lp', '🔴 로직 프로브']]
        : [['ich0', `📈 CH1 = ${h.el.name} 전류`], ['ich1', `📈 CH2 = ${h.el.name} 전류`], ['amp', `📟 멀티미터로 ${h.el.name} 전류`]];
      const off = [];
      this.scope.ch.forEach((c, i) => { if (c.src) off.push([`x${i}`, `✕ CH${i + 1} 빼기 — ${srcLabel(c.src)}`]); });
      const cur = this.meter.mode === 'dca' || this.meter.mode === 'aca';
      if ((cur && this.meter.elName) || (!cur && (this.meter.red || this.meter.black))) off.push(['xm', '✕ 멀티미터 리드 빼기']);
      menu.innerHTML = `<div class="cv-menu-h">${h.kind === 'node' ? '이 점에 연결' : esc(h.el.name || '')}</div>` + items.map(([k, t]) => `<button data-k="${k}">${esc(t)}</button>`).join('')
        + (off.length ? '<div class="cv-menu-h sep">연결 해제</div>' + off.map(([k, t]) => `<button data-k="${k}" class="off">${esc(t)}</button>`).join('') : '');
      (document.fullscreenElement || document.body).appendChild(menu);
      const W = window.innerWidth, H = window.innerHeight;
      menu.style.left = Math.min(e.clientX, W - 230) + 'px';
      menu.style.top = Math.min(e.clientY, H - 34 * (items.length + off.length) - 50) + 'px';
      menu.onclick = (ev) => {
        const b = ev.target.closest('[data-k]');
        if (!b) return;
        const k = b.dataset.k;
        if (k === 'ch0' || k === 'ch1') this.scope.setSource(+k[2], { a: ref, b: null });
        if (k === 'ich0' || k === 'ich1') this.scope.setSource(+k[3], { el: h.el.name });
        if (k === 'red') { this.meter.red = ref; if (!/v$/.test(this.meter.mode) && this.meter.mode !== 'ohm') this.meter.mode = 'dcv'; }
        if (k === 'black') { this.meter.black = view.sim.netOfPoint(h.x, h.y) === view.sim.gndNet ? null : ref; if (!/v$/.test(this.meter.mode) && this.meter.mode !== 'ohm') this.meter.mode = 'dcv'; }
        if (k === 'amp') { this.meter.elName = h.el.name; if (!/a$/.test(this.meter.mode)) this.meter.mode = 'dca'; }
        if (k === 'la' && this.chans.length < 8) { this.chans.push(this.refOf(h)); this.renderChans(); }
        if (k === 'lp') { this.probe = this.refOf(h); this.probeToggles = null; this.$('.lp-src').textContent = '🔌 ' + this.probe.name; }
        if (k === 'x0' || k === 'x1') this.scope.clearSource(+k[1]);
        if (k === 'xm') this.meter.clearLeads();
        if (k === 'red' || k === 'black' || k === 'amp') { this.meter.bind(); this.meter.sync(); }
        menu.remove();
      };
      const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('pointerdown', close, true); } };
      setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
      return true;
    }

    /** 활성 회로에 연결 (회로 텍스트의 scope / meter / la 설정 적용) */
    attach(view) {
      if (this.view === view) return;
      if (this.view) { this.view.markers = {}; this.view.renderMarks(); if (this._rb) this.view.off('rebuild', this._rb); }
      this.view = view;
      if (!view) { this.scope.detach(); this.meter.detach(); this.sync(); return; }
      this._rb = () => this.onRebuild();
      view.on('rebuild', this._rb);
      this.configureFromCircuit();
      this.onRebuild();
    }
    /** 회로 텍스트의 계측기 설정 (새 회로를 열 때) */
    configureFromCircuit() {
      const view = this.view;
      const c = view.circ;
      const sim = view.sim;
      const probes = c.elements.filter((e) => e.type === 'P').map((e) => String(e.params.label));
      const scope = this.scope;
      scope.ch.forEach((ch, i) => { ch.src = null; ch.on = i === 0; ch.ac = false; ch.pos = 0; });
      scope.xy = false;
      scope.trig = { src: 0, level: 0, edge: 'rise', mode: 'auto' };
      scope.runState = 'run';
      if (c.scope) scope.configure(c.scope);
      else {
        if (probes[0]) scope.ch[0].src = { a: probes[0] };
        if (probes[1]) { scope.ch[1].src = { a: probes[1] }; scope.ch[1].on = true; }
        scope.tb = sim && sim.fmax > 0 ? nearest(TB_LIST, 2.5 / sim.fmax / 10) : sim && sim.fclk > 0 ? nearest(TB_LIST, 0.4 / sim.fclk) : 0.5;
        const vmax = Math.max(1, sim ? sim.vdd : 5, ...c.elements.filter((e) => e.type === 'V').map((e) => Math.abs(+e.params.v)), ...c.elements.filter((e) => e.type === 'AC').map((e) => Math.abs(+e.params.amp) + Math.abs(+e.params.dc || 0)));
        const vd = VD_LIST.find((v) => v * 3.5 >= vmax) || 5;
        scope.ch.forEach((ch) => { ch.vdiv = vd; ch.pos = -2; });
      }
      scope.syncUi();
      view.scopeTb = scope.tb;
      this.meter.mode = 'dcv'; this.meter.red = probes[0] || null; this.meter.black = null; this.meter.elName = null;
      if (c.meter) this.meter.configure(c.meter);
      this.meter.sync();
      this.chanCfg = true;
      this.hold = false;
      this.probe = null;
      this.$('.lp-src').textContent = '🔌 측정할 점 고르기';
      this.$('.tt-body').innerHTML = '<div class="ip-help">논리 입력 스위치(SW · DIP)의 <b>모든 조합</b>을 넣어 보고 출력(로직 LED · 측정점 · 표시기)을 표로 만듭니다.</div>';
      this.tt = null;
      this.chans = null;
    }
    /** 회로가 다시 만들어진 뒤 (편집): 넷 번호를 다시 찾는다 */
    onRebuild() {
      const v = this.view;
      if (!v || !v.sim) { this.sync(); return; }
      this.scope.attach(v);
      this.meter.attach(v);
      if (!this.chans) { this.chans = this.autoChannels(); this.laTb = this.autoTb(); }
      else this.chans = this.chans.map((c) => Object.assign({}, c, { net: c.pt ? v.sim.netOfPoint(c.pt.x, c.pt.y) : c.name ? v.sim.netByName(c.name) : null }));
      if (this.probe) this.probe.net = this.probe.pt ? v.sim.netOfPoint(this.probe.pt.x, this.probe.pt.y) : null;
      this.$('.la-tb').textContent = CS.siText(this.laTb) + 's';
      this.renderChans();
      this.renderIO();
      this.renderProbes(true);
      const sim = v.sim;
      const hasDig = sim.comps.length > 0;
      this.host.querySelector('[data-card="la"]').classList.toggle('hidden', !hasDig && !(v.circ.la));
      this.host.querySelector('[data-card="probe"]').classList.toggle('hidden', !hasDig);
      this.host.querySelector('[data-card="io"]').classList.toggle('hidden', !sim.inputsList().length && !sim.outputsList().length);
      this.host.querySelector('[data-card="tt"]').classList.toggle('hidden', !sim.comps.some((c) => c.type === 'SW' || c.type === 'DIP'));
      this.host.querySelector('[data-card="state"]').classList.toggle('hidden', !sim.comps.some((c) => CS.D.isSeq(c.type) || c.type === 'ROM' || c.type === 'T555'));
      this.sync();
    }

    // ---------------------------------------------------------------- 로직 분석기
    autoChannels() {
      const v = this.view, sim = v.sim;
      const cfg = v.circ.la;
      if (cfg && cfg.ch) return String(cfg.ch).split(',').map((nm) => ({ name: nm.trim(), net: sim.netByName(nm.trim()) })).filter((c) => c.net != null && c.net >= 0).slice(0, 8);
      const out = [];
      const add = (name, net) => { if (net == null || net < 0 || out.some((c) => c.net === net) || out.length >= 8) return; out.push({ name, net }); };
      sim.comps.filter((c) => c.type === 'CLK').forEach((c) => add(c.name, c.outs[0]));
      sim.comps.filter((c) => c.type === 'SW' || c.type === 'BTN').slice(0, 4).forEach((c) => add(c.name, c.outs[0]));
      sim.probes.forEach((p) => { if (!sim.nets[p.net].analog || sim.nets[p.net].rd.length || sim.nets[p.net].drv.length) add(p.label, p.net); });
      sim.comps.filter((c) => c.type === 'DLED').forEach((c) => add(c.name, c.ins[0]));
      if (out.length < 3) sim.comps.filter((c) => ['DFF', 'JKFF', 'TFF', 'SRFF', 'DL', 'SRL'].indexOf(c.type) >= 0).forEach((c) => add('Q(' + c.name + ')', c.outs[0]));
      return out;
    }
    autoTb() {
      const v = this.view;
      const cfg = v.circ.la;
      if (cfg && cfg.tb) return CS.parseNum(cfg.tb);
      const sim = v.sim;
      if (sim.fclk > 0) return nearest(LA_TB, 1 / sim.fclk);
      return nearest(LA_TB, sim.autoSpeed() * 0.5);
    }
    renderChans() {
      const box = this.$('.la-chans');
      box.innerHTML = (this.chans || []).map((c, i) => `<span class="la-ch" style="--cc:${LA_COLORS[i % 8]}"><b>CH${i + 1}</b>
          <button class="sc-src" data-ip="ch-pick" data-i="${i}" title="다른 점으로 옮기기">${esc(c.name)}</button><button class="la-x" data-ip="ch-del" data-i="${i}" title="채널 빼기">✕</button></span>`).join('')
        + `${(this.chans || []).length < 8 ? '<button class="sc-small" data-ip="ch-add">＋ 채널</button>' : ''}<button class="sc-small" data-ip="ch-auto" title="처음 채널 구성으로">자동</button>`;
      this.$('.la-screen').style.height = Math.max(90, 26 + (this.chans || []).length * 28) + 'px';
    }

    // ---------------------------------------------------------------- 입력 · 출력
    bindIO() {
      const body = this.$('.io-body');
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-io]');
        const v = this.view;
        if (!b || !v || !v.sim) return;
        const sim = v.sim;
        const c = sim.comps[+b.dataset.c];
        if (!c) return;
        const a = b.dataset.io;
        v.activate();
        const d = sim.dig;
        if (a === 'sw') sim.toggle(c.el);
        if (a === 'bit') sim.setDip(c.el, c.s.val ^ (1 << +b.dataset.b));
        if (a === 'inc') sim.setDip(c.el, c.s.val + 1);
        if (a === 'dec') sim.setDip(c.el, c.s.val - 1);
        if (a === 'clkrun') d.setClockRun(c, !c.running);
        if (a === 'clkf') { c.el.params.freq = b.dataset.f; d.setClockFreq(c, +b.dataset.f); }
        if (a === 'clkman') { if (c.running) d.setClockRun(c, false); d.toggle(c); }
        v.updateVisuals(0);
        this.refreshIO();
      });
      body.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-io="pb"]');
        if (!b || !this.view) return;
        const sim = this.view.sim;
        const c = sim.comps[+b.dataset.c];
        this.view.activate();
        sim.press(c.el, true);
        const up = () => { sim.press(c.el, false); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointerup', up);
      });
      body.addEventListener('input', (e) => {
        const r = e.target.closest('[data-io="adc"]');
        if (!r || !this.view) return;
        const c = this.view.sim.comps[+r.dataset.c];
        c.el.params.vin = String(+r.value);
        this.view.sim.dig.setAdc(c, +r.value);
        r.nextElementSibling.textContent = (+r.value).toFixed(2) + ' V';
      });
    }
    renderIO() {
      const v = this.view, sim = v && v.sim;
      const body = this.$('.io-body');
      if (!sim) { body.innerHTML = ''; return; }
      const ins = sim.inputsList(), outs = sim.outputsList();
      const idx = (c) => sim.comps.indexOf(c);
      let h = '';
      if (ins.length) h += '<div class="io-h">입력</div>' + ins.map((c) => {
        const nm = `<b class="io-n">${esc(c.name)}</b>`;
        if (c.type === 'SW') return `<div class="io-row">${nm}<button class="io-tog" data-io="sw" data-c="${idx(c)}" data-k="sw"></button></div>`;
        if (c.type === 'BTN') return `<div class="io-row">${nm}<button class="io-pb" data-io="pb" data-c="${idx(c)}">누르고 있기</button><span class="io-v" data-k="pb" data-c="${idx(c)}"></span></div>`;
        if (c.type === 'DIP') return `<div class="io-row">${nm}<span class="io-bits">${Array.from({ length: c.n }, (_, i) => `<button class="io-bit" data-io="bit" data-c="${idx(c)}" data-b="${c.n - 1 - i}"></button>`).join('')}</span>
          <button class="sc-small" data-io="dec" data-c="${idx(c)}">−</button><button class="sc-small" data-io="inc" data-c="${idx(c)}">+</button><span class="io-v" data-k="dip" data-c="${idx(c)}"></span></div>`;
        if (c.type === 'ADC') return c.aconn('VIN') ? `<div class="io-row">${nm}<span class="io-v" data-k="adc" data-c="${idx(c)}"></span></div>`
          : `<div class="io-row">${nm}<input type="range" min="0" max="${c.vref}" step="${c.vref / 200}" value="${c.s.vin}" data-io="adc" data-c="${idx(c)}"><span class="io-v">${(+c.s.vin).toFixed(2)} V</span></div>`;
        const fs = [0.5, 1, 2, 5, 10, 100, 1000];
        return `<div class="io-row io-clk">${nm}<button class="sc-small" data-io="clkrun" data-c="${idx(c)}" data-k="clkrun"></button>
          <button class="sc-small" data-io="clkman" data-c="${idx(c)}" title="클럭을 멈추고 0 ↔ 1 직접 바꾸기">수동 ↕</button>
          <span class="io-fs">${fs.map((f) => `<button class="sc-small" data-io="clkf" data-c="${idx(c)}" data-f="${f}" data-k="clkf">${CS.siText(f)}Hz</button>`).join('')}</span><span class="io-v" data-k="clk" data-c="${idx(c)}"></span></div>`;
      }).join('');
      if (outs.length) h += '<div class="io-h">출력</div><div class="io-outs">' + outs.map((c) => `<div class="io-out"><b>${esc(c.name)}</b><span data-k="out" data-c="${idx(c)}"></span></div>`).join('') + '</div>';
      if (!h) h = '<div class="ip-help">이 회로에는 디지털 입력 · 출력이 없습니다.</div>';
      body.innerHTML = h;
      this.refreshIO();
    }
    refreshIO() {
      const v = this.view;
      if (!v || !v.sim) return;
      const sim = v.sim, d = sim.dig;
      this.$('.io-body').querySelectorAll('[data-k]').forEach((node) => {
        const k = node.dataset.k;
        const c = sim.comps[+node.dataset.c];
        if (!c) return;
        if (k === 'sw') { node.textContent = c.s.on ? '1' : '0'; node.classList.toggle('on', !!c.s.on); }
        else if (k === 'pb') node.textContent = CS.VCH[d.netValue(c.outs[0])];
        else if (k === 'dip') {
          node.textContent = `= ${c.s.val} (0x${hex(c.s.val)})`;
          node.parentElement.querySelectorAll('.io-bit').forEach((b) => { const o = (c.s.val >> +b.dataset.b) & 1; b.textContent = o; b.classList.toggle('on', !!o); });
        } else if (k === 'adc') node.textContent = `VIN ${(+(c.s.vnow || 0)).toFixed(2)} V → ${c.s.code}`;
        else if (k === 'clkrun') { node.textContent = c.running ? '⏸ 멈춤' : '▶ 동작'; node.classList.toggle('on', !c.running); }
        else if (k === 'clkf') node.classList.toggle('on', Math.abs(+node.dataset.f - c.f) < 1e-9);
        else if (k === 'clk') { node.textContent = `${CS.VCH[c.s.v]} · ${CS.siText(c.f)}Hz`; node.className = 'io-v lv' + c.s.v; }
        else if (k === 'out') {
          const val = d.compValue(c);
          let t;
          if (c.type === 'DLED') t = CS.VCH[val];
          else if (c.type === 'SEG') t = String(val);
          else if (c.type === 'DAC') t = val == null ? 'X' : `${val} → ${(c.aoutV ? c.aoutV[0] : 0).toFixed(3)} V`;
          else t = val == null ? 'X' : `${val} · ${bin(val, c.ins.length)}${c.type === 'HEX' ? '' : ' · 0x' + hex(val)}`;
          node.textContent = t;
          node.className = c.type === 'DLED' ? 'lv lv' + val : 'io-num';
        }
      });
    }

    // ---------------------------------------------------------------- 측정점
    renderProbes(force) {
      const box = this.$('.ip-probes');
      const v = this.view;
      if (!v || !v.sim) { box.innerHTML = '<span class="muted">—</span>'; this._probeKey = ''; return; }
      const sim = v.sim;
      const ps = sim.probes;
      const key = ps.map((p) => p.label).join('|');
      if (force || key !== this._probeKey) {
        this._probeKey = key;
        box.innerHTML = ps.length ? ps.map((p, i) => `<div class="ip-pr"><b>${esc(p.label)}</b><span data-pv="${i}">—</span></div>`).join('')
          : '<span class="muted">이 회로에는 측정점(P)이 없습니다. 회로 위에 마우스를 올려 보세요.</span>';
      }
      ps.forEach((p, i) => {
        const s = box.querySelector(`[data-pv="${i}"]`);
        if (!s) return;
        const n = sim.nets[p.net];
        const t = n.analog ? F(sim.netV(p.net), 'V') + (n.rd.length || n.drv.length ? ` · ${CS.VCH[n.v]}` : '') : `논리 ${CS.VCH[n.v]}`;
        if (s.textContent !== t) s.textContent = t;
      });
    }

    // ---------------------------------------------------------------- 진리표 · 내부 상태
    buildTT() {
      const v = this.view;
      let r;
      try { r = CS.truthTable(CS.parse(CS.serialize(v.circ)), v.circ.tt || {}); } catch (e) { r = { error: e.message }; }
      const body = this.$('.tt-body');
      if (r.error) { body.innerHTML = `<div class="ip-help">⚠ ${esc(r.error)}</div>`; this.tt = null; return; }
      this.tt = r;
      const outW = r.outNames.map((n) => { const c = v.sim.byName[n]; return c && ['LEDS', 'HEX', 'DAC'].indexOf(c.type) >= 0 ? c.ins.length : 1; });
      const cell = (val, w) => (val == null ? 'X' : typeof val === 'number' && w > 1 ? `${val}` : CS.VCH[val] != null && w === 1 ? CS.VCH[val] : String(val));
      body.innerHTML = `${r.seq ? '<div class="ip-help">⚠ 플립플롭 · 카운터가 있는 회로는 이전 상태에 따라 결과가 달라질 수 있습니다.</div>' : ''}
        <div class="tt-wrap"><table class="tt"><thead><tr>${r.inNames.map((n) => `<th class="ti">${esc(n)}</th>`).join('')}${r.outNames.map((n) => `<th class="to">${esc(n)}</th>`).join('')}</tr></thead>
        <tbody>${r.rows.map((row, i) => `<tr data-r="${i}">${row.ins.map((x) => `<td class="ti">${x}</td>`).join('')}${row.outs.map((x, j) => `<td class="to v${typeof x === 'number' && outW[j] === 1 ? x : ''}">${cell(x, outW[j])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="ip-help">지금 스위치 상태에 해당하는 줄이 강조됩니다 · ${r.rows.length}행</div>`;
      this.ttCur = null;
    }
    ttRow() {
      const v = this.view, r = this.tt;
      if (!r) return -1;
      let code = 0;
      for (let i = 0; i < r.inNames.length; i++) {
        const c = v.sim.byName[r.inNames[i]];
        if (!c) return -1;
        const x = c.type === 'DIP' ? c.s.val : c.type === 'SW' ? (c.s.on ? 1 : 0) : 0;
        code = code * Math.pow(2, r.width[i]) + x;
      }
      return code;
    }
    renderState() {
      const v = this.view, sim = v.sim, d = sim.dig;
      const list = sim.comps.filter((c) => CS.D.isSeq(c.type) || c.type === 'ROM' || c.type === 'T555');
      const h = list.map((c) => {
        const meta = CS.TYPES[c.type];
        let val;
        if (c.type === 'ROM' || c.type === 'RAM') {
          const words = 1 << c.a;
          const addr = CS.D.toNum(c.ins.slice(0, c.a).map((n) => d.netValue(n)));
          val = `<span class="mem-grid">${Array.from({ length: words }, (_, i) => `<i class="${i === addr ? 'cur' : ''}" title="주소 ${i}">${hex(c.s.mem[i] || 0)}</i>`).join('')}</span>`;
        } else if (['REG', 'CNT', 'SHR'].indexOf(c.type) >= 0) {
          const x = d.compValue(c);
          val = `<span class="io-num">${x == null ? 'X' : `${x} · ${bin(x, c.n)}`}</span>`;
        } else if (c.type === 'T555') val = `래치 <span class="lv lv${c.s.q || 0}">${CS.VCH[c.s.q || 0]}</span>`;
        else { const q = d.netValue(c.outs[0]); val = `Q=<span class="lv lv${q}">${CS.VCH[q]}</span>`; }
        return `<div class="st-row"><b>${esc(c.name)}</b><span class="muted">${esc(meta ? meta.name : c.type)}</span><span class="spacer"></span>${val}</div>`;
      }).join('');
      const body = this.$('.st-body');
      if (body._h !== h) { body.innerHTML = h; body._h = h; }
    }

    // ---------------------------------------------------------------- 매 프레임
    loop() {
      let fc = 0;
      const tick = () => {
        requestAnimationFrame(tick);
        if (!this.host.offsetParent) return;
        const v = this.view;
        this.scope.draw();
        this.meter.tick();
        if (!v || !v.sim) return;
        const sim = v.sim;
        const t = this.$('.ip-time');
        const rs = v.realSpeed;
        const sp = rs >= 0.01 && rs < 1000 ? String(+rs.toPrecision(2)) : rs.toExponential(1);
        const txt = `t = ${F(sim.t, 's')}${!v.running ? ' ⏸' : rs ? ` · ${Math.abs(rs - 1) < 0.02 ? '실시간' : '×' + sp}` : ''}`;
        if (t.textContent !== txt) t.textContent = txt;
        fc++;
        const la = this.$('[data-card="la"]');
        if (!la.classList.contains('folded') && !la.classList.contains('hidden')) {
          const t1 = this.hold ? this.holdT : sim.t;
          const g = drawTiming(this.$('.la-canvas'), sim, this.chans || [], Math.max(t1, this.laTb * 10 * 0.02), this.laTb, { cursor: this.cursor });
          if (g && this.cursor != null && this.cursor >= g.labW) {
            const tc = g.t0 + (this.cursor - g.labW) / g.plotW * g.span;
            this.$('.la-read').innerHTML = `<b>t=${CS.siText(Math.max(0, tc))}s</b> ` + (this.chans || []).map((c, i) => `<span style="color:${LA_COLORS[i % 8]}">${esc(c.name)}=${c.net != null && sim.nets[c.net] ? CS.VCH[valueAt(sim.nets[c.net].hist, tc)] : '?'}</span>`).join(' ');
          }
        }
        if (this.probe && this.probe.net != null && sim.nets[this.probe.net]) {
          const n = sim.nets[this.probe.net];
          const tg = n.toggles;
          if (this.probeToggles != null && tg !== this.probeToggles) this.pulseUntil = performance.now() + 150;
          this.probeToggles = tg;
          this.host.querySelector('.lp-led.hi').classList.toggle('on', n.v === L1);
          this.host.querySelector('.lp-led.lo').classList.toggle('on', n.v === L0);
          this.host.querySelector('.lp-led.pu').classList.toggle('on', performance.now() < (this.pulseUntil || 0));
          const tx = { 0: 'LOW', 1: 'HIGH', 2: 'X', 3: 'Z' }[n.v] + (n.analog ? ` · ${F(sim.netV(n.id), 'V')}` : '');
          if (this.$('.lp-val').textContent !== tx) this.$('.lp-val').textContent = tx;
        }
        if (fc % 3 === 0) {
          this.renderProbes();
          this.refreshIO();
          if (!this.$('[data-card="state"]').classList.contains('hidden')) this.renderState();
          if (this.tt) {
            const r = this.ttRow();
            if (r !== this.ttCur) { this.ttCur = r; this.$('.tt-body').querySelectorAll('tr[data-r]').forEach((tr) => tr.classList.toggle('cur', +tr.dataset.r === r)); }
          }
          this.sync();
        }
      };
      requestAnimationFrame(tick);
    }
  }

  window.Instruments = { Scope, Meter, InstrumentPanel, parseSource, resolveSource, drawTiming };
})();
