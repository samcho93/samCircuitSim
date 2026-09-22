/* 회로도 화면 (SVG) — 아날로그 · 디지털 부품을 한 화면에
 *  - 아날로그 넷: 전압 색(0 V 회색 → + 빨강 / − 파랑) + 전류 흐름(노란 점)
 *  - 디지털 넷: 논리 색 (1 초록 · 0 어두운 초록 · X 빨강 · Z 파랑 점선)
 *  - 마우스를 올리면 전압 · 논리값 · 소자 전압 · 전류 · 전력 · 부품 내부 상태
 *  - 스위치 · 버튼 · DIP · 클럭 조작, 계측기 연결을 위한 '점/소자 고르기'
 */
(function () {
  'use strict';
  const CS = window.CircuitSim;
  const D = CS.D;
  const { L0, L1, LX, LZ } = CS;
  const GRID = 20, S = 20;
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const on = (v) => v === 1 || v === '1' || v === true || v === 'true';
  const f1 = (v) => Math.round(v * 10) / 10;
  const VCLS = ['v0', 'v1', 'vx', 'vz'];
  const LOGIC_NAME = { 0: 'LOW (0)', 1: 'HIGH (1)', 2: '불확정 X', 3: '연결 안 됨 Z' };
  const LED_COLORS = { red: '#ff3b30', green: '#22e05a', yellow: '#ffd60a', blue: '#3b82f6', orange: '#ff9500', white: '#f5f5f5' };
  const isDig = (t) => CS.isDigital(t);
  const PWR_BOX = { VREG: 20, DCDC: 20, BUCK: 60, BOOST: 60, ACDC: 60 };

  // ================================================================= 라벨
  function valueLabel(el) {
    const p = el.params;
    if (p.lbl === 0 || p.lbl === '0') return '';
    if (p.lbl && p.lbl !== 1 && p.lbl !== '1') return String(p.lbl);
    const si = CS.siText;
    switch (el.type) {
      case 'R': return si(+p.r) + 'Ω';
      case 'POT': return si(+p.r) + 'Ω';
      case 'C': return si(+p.c) + 'F';
      case 'L': return si(+p.l) + 'H';
      case 'V': return si(+p.v) + 'V';
      case 'I': return si(+p.i) + 'A';
      case 'AC': {
        const w = { sine: '', square: '□ ', tri: '△ ', saw: '⟋ ', pulse: '⎍ ' }[p.wave || 'sine'] || '';
        return `${w}${si(+p.amp)}V${+p.dc ? (+p.dc > 0 ? '+' : '') + si(+p.dc) + 'V' : ''} ${si(+p.freq)}Hz`;
      }
      case 'Z': return si(+p.vz) + 'V';
      case 'FUSE': return si(+p.a) + 'A' + (el.st && el.st.blown ? ' ✖끊어짐' : '');
      case 'LAMP': return `${si(+p.v)}V ${si(+p.w)}W`;
      case 'LED': return { red: '빨강', orange: '주황', yellow: '노랑', green: '초록', blue: '파랑', white: '흰색' }[p.color] || '';
      case 'D': return String(p.model || '').toUpperCase() === '1N4148' ? '' : String(p.model || '').toUpperCase();
      case 'Q': return +p.pnp ? 'PNP' : 'NPN';
      case 'M': return +p.p ? 'P-MOS' : 'N-MOS';
      case 'J': return +p.p ? 'P-JFET' : 'N-JFET';
      case 'X': return fmtRatio(+p.n);
      case 'RLY': return `${si(+p.r)}Ω`;
      default: return '';
    }
  }
  function fmtRatio(n) { if (!n) return ''; return n >= 1 ? `1:${+n.toFixed(2)}` : `${+(1 / n).toFixed(2)}:1`; }

  // ================================================================= 변환
  function mat(el) {
    const r = ((+(el.params.rot || 0)) % 4 + 4) % 4, f = +(el.params.f || 0);
    const c = [1, 0, -1, 0][r], s = [0, 1, 0, -1][r];
    const fy = f ? -1 : 1;
    return { a: c, b: s, c: -s * fy, d: c * fy, e: el.x * GRID, f: el.y * GRID };
  }
  const apply = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

  // ================================================================= 아날로그 기호
  const BODY = { FUSE: 30, R: 40, POT: 40, C: 12, L: 40, V: 14, AC: 34, I: 34, S: 34, PB: 34, D: 20, Z: 20, LED: 20, LAMP: 28, AM: 30, VM: 30, SPDT: 0, W: 0 };

  function geom2(el) {
    const x1 = el.x1 * GRID, y1 = el.y1 * GRID, x2 = el.x2 * GRID, y2 = el.y2 * GRID;
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    let B = BODY[el.type] || 0;
    if (B > L - 8) B = Math.max(4, L - 8);
    const c = L / 2;
    const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    return { x1, y1, x2, y2, L, ang, B, c, ux, uy, px: -uy, py: ux, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  }
  function zig(a, b, h) {
    const n = 6, w = (b - a) / n;
    let d = '';
    for (let k = 0; k < n; k++) d += ` L${(a + w * (k + 0.5)).toFixed(2)} ${k % 2 ? h : -h}`;
    return d + ` L${b} 0`;
  }

  /**
   * 소자 하나를 SVG 로. 반환: { body, leads: [[x1,y1,x2,y2,pinIndex,sign]], label, center, digital }
   */
  function drawEl(el, opts) {
    opts = opts || {};
    if (isDig(el.type)) return drawDigital(el, opts);
    const p = el.params;
    const iec = opts.iec;
    let body = '';
    const leads = [];
    let label = null;
    const def = CS.TYPES[el.type];
    if (def.kind === '2') {
      const g = geom2(el);
      const { L, c, B } = g;
      const T = `translate(${g.x1},${g.y1}) rotate(${g.ang})`;
      const a = c - B / 2, b = c + B / 2;
      const P = (lx, ly) => [g.x1 + g.ux * lx + g.px * ly, g.y1 + g.uy * lx + g.py * ly];
      const lead = (lx1, lx2, pin, sign, ly) => { const s = P(lx1, ly || 0), e = P(lx2, ly || 0); leads.push([s[0], s[1], e[0], e[1], pin, sign]); };
      let inner = '';
      let spdtTxt = null;
      switch (el.type) {
        case 'W': break;
        case 'R':
          inner = iec ? `<rect x="${a}" y="-7" width="${B}" height="14" class="sb" fill="var(--sch-bg)"/>` : `<path class="sb" d="M${a} 0 ${zig(a, b, 7)}"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        case 'POT': {
          inner = iec ? `<rect x="${a}" y="-7" width="${B}" height="14" class="sb" fill="var(--sch-bg)"/>` : `<path class="sb" d="M${a} 0 ${zig(a, b, 7)}"/>`;
          const pos = Math.min(1, Math.max(0, +p.pos));
          const wx = a + 3 + (B - 6) * pos;
          inner += `<path class="sb" d="M${c} ${2 * GRID} L${c} 24 L${wx} 24 L${wx} 12"/><path class="sf" d="M${wx - 5} 19 L${wx} 9 L${wx + 5} 19 Z"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          { const s = P(c, 2 * GRID), e = P(c, 12); leads.push([s[0], s[1], e[0], e[1], 2, 1]); }
          break;
        }
        case 'C':
          if (+p.pol) inner = `<path class="sb thick" d="M${a} -13 L${a} 13"/><path class="sb thick" d="M${b + 4} -13 Q${b - 2} 0 ${b + 4} 13"/><text x="${a - 9}" y="-7" class="pm" text-anchor="middle">+</text>`;
          else inner = `<path class="sb thick" d="M${a} -13 L${a} 13 M${b} -13 L${b} 13"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        case 'L': {
          let d = `M${a} 0`;
          for (let k = 0; k < 4; k++) d += ' a5 5 0 0 1 10 0';
          inner = iec ? `<rect x="${a}" y="-7" width="${B}" height="14" class="sf-dark"/>` : `<path class="sb" d="${d}"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        }
        case 'V':
          inner = `<path class="sb" d="M${b} -15 L${b} 15"/><path class="sb thick" d="M${a} -7 L${a} 7"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        case 'AC': case 'I':
          inner = `<circle cx="${c}" cy="0" r="${B / 2}" class="sb" fill="var(--sch-bg)"/>`;
          if (el.type === 'I') inner += `<path class="sb" d="M${c - 9} 0 L${c + 8} 0"/><path class="sf" d="M${c + 10} 0 L${c + 2} -5 L${c + 2} 5 Z"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        case 'S': {
          const o = +p.on;
          inner = `<circle cx="${a + 3}" cy="0" r="3" class="sb" fill="var(--sch-bg)"/><circle cx="${b - 3}" cy="0" r="3" class="sb" fill="var(--sch-bg)"/>
            <path class="sb thick lever" d="M${a + 3} 0 L${o ? b - 3 : b - 5} ${o ? 0 : -16}"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        }
        case 'FUSE': {
          const blown = el.st && el.st.blown;
          inner = `<rect x="${a}" y="-6" width="${B}" height="12" rx="3" class="sb" fill="var(--sch-bg)"/>`;
          inner += blown ? `<path class="sb" d="M${a} 0 L${c - 5} 0 L${c - 2} -4 M${c + 2} 4 L${c + 5} 0 L${b} 0" stroke="#ef4444"/><path d="M${c - 6} -9 L${c + 6} 9 M${c + 6} -9 L${c - 6} 9" stroke="#ef4444" stroke-width="2.4"/>`
            : `<path class="sb thin" d="M${a} 0 L${b} 0"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        }
        case 'PB': {
          const yb = +p.on ? -4 : -11;
          inner = `<circle cx="${a + 3}" cy="0" r="3" class="sb" fill="var(--sch-bg)"/><circle cx="${b - 3}" cy="0" r="3" class="sb" fill="var(--sch-bg)"/>
            <path class="sb thick lever" d="M${a} ${yb} L${b} ${yb} M${c} ${yb} L${c} ${yb - 10} M${c - 6} ${yb - 10} L${c + 6} ${yb - 10}"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        }
        case 'D': case 'Z': case 'LED': {
          inner = `<path class="sf-soft" d="M${a} -10 L${a} 10 L${b} 0 Z"/>`;
          if (el.type === 'Z') inner += `<path class="sb" d="M${b - 5} -13 L${b} -10 L${b} 10 L${b + 5} 13"/>`;
          else inner += `<path class="sb" d="M${b} -11 L${b} 11"/>`;
          if (el.type === 'LED') inner += `<path class="sb thin" d="M${c - 2} -13 L${c + 5} -21 M${c + 5} -13 L${c + 12} -21"/><path class="sf" d="M${c + 7} -23 L${c + 2} -21 L${c + 5} -18 Z M${c + 14} -23 L${c + 9} -21 L${c + 12} -18 Z"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        }
        case 'LAMP':
          inner = `<circle cx="${c}" cy="0" r="${B / 2}" class="sb" fill="var(--sch-bg)"/><path class="sb thin" d="M${c - 9} -9 L${c + 9} 9 M${c - 9} 9 L${c + 9} -9"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        case 'AM': case 'VM':
          inner = `<circle cx="${c}" cy="0" r="${B / 2}" class="sb meter-ring" fill="var(--sch-bg)"/>`;
          lead(0, a, 0, 1); lead(b, L, 1, 1);
          break;
        case 'SPDT': {
          const pv = 16, k0 = L - 16;
          const pos = +p.pos;
          inner = `<circle cx="${pv}" cy="0" r="3" class="sb" fill="var(--sch-bg)"/>
            <circle cx="${k0}" cy="0" r="3" class="sb" fill="var(--sch-bg)"/><circle cx="${k0}" cy="${2 * GRID}" r="3" class="sb" fill="var(--sch-bg)"/>
            <path class="sb thick lever" d="M${pv} 0 L${k0 - 3} ${pos ? 2 * GRID - 6 : 0}"/>`;
          spdtTxt = [P(k0 + 4, -9), P(k0 + 4, 2 * GRID - 9)];
          lead(0, pv, 0, 1); lead(k0, L, 1, 1);
          { const s = P(k0, 2 * GRID), e = P(L, 2 * GRID); leads.push([e[0], e[1], s[0], s[1], 2, -1]); }
          break;
        }
      }
      body = `<g transform="${T}">${inner}</g>`;
      if (spdtTxt) body += spdtTxt.map((q, k) => `<text x="${q[0]}" y="${q[1] + 3}" class="pin-t" text-anchor="middle">${k}</text>`).join('');
      const C = P(c, 0);
      if (el.type === 'AC') {
        const w = p.wave || 'sine';
        const gl = { sine: 'M-9 0 C-6 -13 -2 -13 0 0 S6 13 9 0', square: 'M-9 6 L-9 -6 L0 -6 L0 6 L9 6 L9 -6', tri: 'M-10 5 L-5 -6 L5 6 L10 -5', saw: 'M-9 6 L0 -6 L0 6 L9 -6', pulse: 'M-10 6 L-4 6 L-4 -6 L4 -6 L4 6 L10 6', dc: 'M-8 -3 L8 -3 M-8 3 L8 3' }[w];
        body += `<path class="sb" transform="translate(${C[0]},${C[1]})" d="${gl || ''}"/>`;
        const pp = P(b + 8, -9);
        body += `<text x="${pp[0]}" y="${pp[1] + 4}" class="pm" text-anchor="middle">+</text>`;
      }
      if (el.type === 'V') { const pp = P(b + 7, -13); body += `<text x="${pp[0]}" y="${pp[1] + 4}" class="pm" text-anchor="middle">+</text>`; }
      if (el.type === 'AM' || el.type === 'VM') {
        body += `<text x="${C[0]}" y="${C[1] + 5.5}" class="meter-t" text-anchor="middle">${el.type === 'AM' ? 'A' : 'V'}</text>`;
        const pp = P(a - 3, -10);
        body += `<text x="${pp[0]}" y="${pp[1] + 4}" class="pm small" text-anchor="middle">+</text>`;
      }
      if (el.type === 'LED' || el.type === 'LAMP') body = `<circle class="glow" cx="${C[0]}" cy="${C[1]}" r="${el.type === 'LED' ? 16 : 20}" fill="${el.type === 'LED' ? (CS.LED_RGB[p.color] || '#ff3b30') : '#ffd60a'}" opacity="0"/>` + body;
      const txt = [opts.names === false ? '' : (el.name || ''), valueLabel(el)].filter(Boolean);
      if (el.type !== 'W' && txt.length) {
        const vertical = Math.abs(g.uy) > Math.abs(g.ux);
        const off = el.type === 'SPDT' || el.type === 'POT' ? -(B / 2 + 14) : (BODY[el.type] > 25 ? 22 : 18);
        let lx, ly, anchor;
        if (vertical) {
          const side = p.lp === 'l' ? -1 : 1;
          if (el.type === 'POT' || el.type === 'SPDT') {
            const s2 = g.px > 0 ? -1 : 1;
            lx = g.mx + s2 * 16; anchor = s2 > 0 ? 'start' : 'end';
          } else { lx = g.mx + side * off; anchor = side > 0 ? 'start' : 'end'; }
          ly = g.my - (txt.length - 1) * 7;
        } else {
          const side = p.lp === 'b' ? 1 : -1;
          lx = g.mx; anchor = 'middle';
          if (el.type === 'POT' || el.type === 'SPDT') ly = g.my + (g.py > 0 ? -1 : 1) * 18 - (txt.length - 1) * 14 * (g.py > 0 ? 1 : 0);
          else ly = g.my + side * off - (side < 0 ? (txt.length - 1) * 14 : -8);
          if (side < 0 && !(el.type === 'POT' || el.type === 'SPDT')) ly += 4;
        }
        label = { x: lx, y: ly, lines: txt, anchor };
      }
      return { body, leads, label, center: C };
    }

    // ---------------------------------------------------------------- 한 점 소자
    const x = el.x * GRID, y = el.y * GRID;
    switch (el.type) {
      case 'G':
        body = `<path class="sb" d="M${x} ${y} L${x} ${y + 10} M${x - 12} ${y + 10} L${x + 12} ${y + 10} M${x - 7} ${y + 15} L${x + 7} ${y + 15} M${x - 3} ${y + 20} L${x + 3} ${y + 20}"/>`;
        leads.push([x, y, x, y + 10, 0, 0]);
        return { body, leads, label: null, center: [x, y + 10] };
      case 'P': {
        const lab = String(p.label);
        const side = p.lp || 'tr';
        const dx = /l/.test(side) ? -8 : 8, dy = /b/.test(side) ? 16 : -8;
        body = `<circle cx="${x}" cy="${y}" r="4.2" class="probe-dot"/>`;
        return { body, leads, label: { x: x + dx, y: y + dy, lines: [lab], anchor: dx < 0 ? 'end' : 'start', probe: true }, center: [x, y] };
      }
      case 'N': {
        const w = Math.max(24, String(p.label).length * 8 + 14);
        const k = el._left ? -1 : 1;
        body = `<path class="tunnel" d="M${x},${y} L${x + 8 * k},${y - 9} L${x + w * k},${y - 9} L${x + w * k},${y + 9} L${x + 8 * k},${y + 9} Z"/>
          <text class="tunnel-t" x="${x + (el._left ? -11 : 11)}" y="${y + 4.5}"${el._left ? ' text-anchor="end"' : ''}>${esc(p.label)}</text>`;
        return { body, leads, label: null, center: [x + k * w / 2, y] };
      }
      case 'TXT': {
        const size = +p.size || 14;
        return { body: `<text x="${x}" y="${y}" class="sch-text" style="font-size:${size}px" text-anchor="${p.align || 'start'}">${esc(p.text)}</text>`, leads, label: null, center: [x, y] };
      }
    }
    const m = mat(el);
    const T = `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
    const Pg = (lx, ly) => apply(m, lx, ly);
    const polyLead = (ptsL, pin) => {
      for (let k = 0; k + 1 < ptsL.length; k++) {
        const s = Pg(ptsL[k][0], ptsL[k][1]), e = Pg(ptsL[k + 1][0], ptsL[k + 1][1]);
        leads.push([s[0], s[1], e[0], e[1], pin, 1]);
      }
    };
    const sideLabel = (cxL, dist, lines) => {
      const [cx0, cy0] = Pg(cxL, 0), [tx] = Pg(cxL + 30, 0);
      const right = tx >= cx0;
      return { x: cx0 + (right ? dist : -dist), y: cy0 - 4, lines: lines.filter(Boolean), anchor: right ? 'start' : 'end' };
    };
    let inner = '';
    let extra = '';
    const name = opts.names === false ? '' : (el.name || '');
    switch (el.type) {
      case 'Q': {
        const pnp = +p.pnp;
        inner = `<circle cx="28" cy="0" r="25" class="sb thin" fill="var(--sch-bg)"/><path class="sb thick" d="M18 -14 L18 14"/>`;
        const ex1 = 18, ey1 = 6, ex2 = 40, ey2 = 22;
        const ang = Math.atan2(ey2 - ey1, ex2 - ex1);
        const ax = pnp ? ex1 + (ex2 - ex1) * 0.35 : ex1 + (ex2 - ex1) * 0.8, ay = pnp ? ey1 + (ey2 - ey1) * 0.35 : ey1 + (ey2 - ey1) * 0.8;
        const dir = pnp ? ang + Math.PI : ang;
        const tip = [ax + Math.cos(dir) * 5, ay + Math.sin(dir) * 5];
        const l1 = [tip[0] - Math.cos(dir - 0.45) * 10, tip[1] - Math.sin(dir - 0.45) * 10];
        const l2 = [tip[0] - Math.cos(dir + 0.45) * 10, tip[1] - Math.sin(dir + 0.45) * 10];
        inner += `<path class="sf" d="M${tip[0]} ${tip[1]} L${l1[0]} ${l1[1]} L${l2[0]} ${l2[1]} Z"/>`;
        polyLead([[0, 0], [18, 0]], 0);
        polyLead([[40, -40], [40, -22], [18, -6]], 1);
        polyLead([[40, 40], [40, 22], [18, 6]], 2);
        label = sideLabel(28, 30, [name, valueLabel(el)]);
        break;
      }
      case 'M': {
        const pch = +p.p;
        inner = `<path class="sb thick" d="M14 -16 L14 16"/><path class="sb thick" d="M20 -18 L20 -8 M20 -5 L20 5 M20 8 L20 18"/><path class="sb" d="M20 0 L40 0 L40 13"/>`;
        inner += pch ? '<path class="sf" d="M36 0 L27 -5 L27 5 Z"/>' : '<path class="sf" d="M21 0 L30 -5 L30 5 Z"/>';
        polyLead([[0, 0], [14, 0]], 0);
        polyLead([[40, -40], [40, -13], [20, -13]], 1);
        polyLead([[40, 40], [40, 13], [20, 13]], 2);
        label = sideLabel(24, 26, [name, valueLabel(el)]);
        break;
      }
      case 'J': {
        const pch = +p.p;
        inner = '<path class="sb thick" d="M20 -18 L20 18"/>';
        inner += pch ? '<path class="sf" d="M6 0 L15 -5 L15 5 Z"/>' : '<path class="sf" d="M19 0 L10 -5 L10 5 Z"/>';
        polyLead([[0, 0], [20, 0]], 0);
        polyLead([[40, -40], [40, -12], [20, -12]], 1);
        polyLead([[40, 40], [40, 12], [20, 12]], 2);
        label = sideLabel(24, 26, [name, valueLabel(el)]);
        break;
      }
      case 'OA': {
        inner = '<path class="sb" d="M10 -36 L10 36 L72 0 Z" fill="var(--sch-bg)"/>';
        polyLead([[0, -20], [10, -20]], 0);
        polyLead([[0, 20], [10, 20]], 1);
        polyLead([[80, 0], [72, 0]], 2);
        const m1 = Pg(19, -20), p1 = Pg(19, 20);
        extra += `<text x="${m1[0]}" y="${m1[1] + 5.5}" class="pm" text-anchor="middle">−</text><text x="${p1[0]}" y="${p1[1] + 5.5}" class="pm" text-anchor="middle">+</text>`;
        const cc = Pg(34, 0);
        const rails = `${CS.siText(+(p.vp != null ? p.vp : 15))}/${CS.siText(+(p.vn != null ? p.vn : -15))}V`;
        label = { x: cc[0], y: cc[1] - 44, lines: [name + (p.showrails === 0 ? '' : ' ' + rails)].filter(Boolean), anchor: 'middle' };
        const top = Pg(34, -36), bot = Pg(34, 36);
        if (Math.abs(top[1] - bot[1]) < 10) label = { x: cc[0], y: Math.min(top[1], bot[1], cc[1]) - 44, lines: label.lines, anchor: 'middle' };
        break;
      }
      case 'X': {
        let d1 = 'M12 16', d2 = 'M68 16';
        for (let k = 0; k < 4; k++) { d1 += ' a6 6 0 0 1 0 12'; d2 += ' a6 6 0 0 0 0 12'; }
        inner = `<path class="sb" d="${d1}"/><path class="sb" d="${d2}"/><path class="sb thin" d="M36 10 L36 70 M44 10 L44 70"/>
          <circle cx="22" cy="12" r="2.6" class="sf"/><circle cx="58" cy="12" r="2.6" class="sf"/>`;
        polyLead([[0, 0], [12, 0], [12, 16]], 0);
        polyLead([[0, 80], [12, 80], [12, 64]], 1);
        polyLead([[80, 0], [68, 0], [68, 16]], 2);
        polyLead([[80, 80], [68, 80], [68, 64]], 3);
        const cc = Pg(40, -8);
        label = { x: cc[0], y: cc[1] - 4, lines: [[name, valueLabel(el)].filter(Boolean).join(' ')], anchor: 'middle' };
        break;
      }
      case 'ASW': {
        inner = `<circle cx="22" cy="0" r="3" class="sb" fill="var(--sch-bg)"/><circle cx="58" cy="0" r="3" class="sb" fill="var(--sch-bg)"/>
          <path class="sb thick lever sw-off" d="M22 0 L55 -15"/><path class="sb thick lever sw-on" d="M22 0 L55 0"/>
          <path class="sb thin" d="M40 -22 L40 -10" stroke-dasharray="3 3"/><rect x="33" y="-30" width="14" height="8" rx="2" class="sb thin" fill="var(--sch-bg)"/>`;
        polyLead([[0, 0], [19, 0]], 0);
        polyLead([[80, 0], [61, 0]], 1);
        polyLead([[40, -40], [40, -30]], 2);
        label = { x: Pg(40, 12)[0], y: Pg(40, 12)[1] + 12, lines: [name].filter(Boolean), anchor: 'middle' };
        break;
      }
      case 'VREG': case 'DCDC': case 'BUCK': case 'BOOST': case 'ACDC': {
        const t = el.type;
        const tall = t === 'VREG' || t === 'DCDC' ? 20 : 60;
        inner = `<rect x="20" y="-20" width="80" height="${tall + 20}" rx="4" class="sb box-body pwr-body"/>`;
        if (t === 'ACDC') inner += '<path class="sb thin" d="M60 -16 L60 56" stroke-dasharray="4 3"/>';
        const lbls = [];
        const pl = (pts, pin, txt, tx, ty) => { polyLead(pts, pin); lbls.push([txt, tx, ty]); };
        if (t === 'VREG' || t === 'DCDC') {
          pl([[0, 0], [20, 0]], 0, 'IN', 32, 0);
          pl([[120, 0], [100, 0]], 1, 'OUT', 86, 0);
          pl([[60, 40], [60, 20]], 2, t === 'VREG' && /317/.test(String(p.part)) ? 'ADJ' : 'GND', 60, 12);
        } else if (t === 'ACDC') {
          pl([[0, 0], [20, 0]], 0, 'L', 30, 0);
          pl([[0, 40], [20, 40]], 1, 'N', 30, 40);
          pl([[120, 0], [100, 0]], 2, '+V', 88, 0);
          pl([[120, 40], [100, 40]], 3, '−V', 88, 40);
        } else {
          pl([[0, 0], [20, 0]], 0, 'VIN', 34, 0);
          pl([[120, 0], [100, 0]], 1, 'SW', 88, 0);
          pl([[120, 40], [100, 40]], 2, 'FB', 88, 40);
          pl([[60, 80], [60, 60]], 3, 'GND', 60, 52);
        }
        lbls.forEach(([txt, tx, ty]) => { const q = Pg(tx, ty); extra += `<text x="${q[0]}" y="${q[1] + 3.5}" class="pin-t" text-anchor="middle">${esc(txt)}</text>`; });
        const title = String(p.part || CS.TYPES[t].name);
        const tq = Pg(60, t === 'VREG' || t === 'DCDC' ? -9 : 12);
        extra += `<text x="${tq[0]}" y="${tq[1] + 4}" class="box-title" text-anchor="middle">${esc(title.length > 11 ? title.slice(0, 11) : title)}</text>`;
        if (t !== 'VREG' && t !== 'DCDC') {
          const sub = { BUCK: '강압 DC-DC', BOOST: '승압 DC-DC', ACDC: 'AC → DC' }[t];
          const sq = Pg(60, 26);
          extra += `<text x="${sq[0]}" y="${sq[1] + 4}" class="pin-t" text-anchor="middle">${sub}</text>`;
        }
        const top = [Pg(20, -20), Pg(100, -20), Pg(20, tall), Pg(100, tall)];
        const ty0 = Math.min(...top.map((q) => q[1]));
        const cxx = top.reduce((s, q) => s + q[0], 0) / 4;
        label = { x: cxx, y: ty0 - 8, lines: [[name, valueLabel(el)].filter(Boolean).join(' ')].filter(Boolean), anchor: 'middle' };
        break;
      }
      case 'TL431': {
        inner = '<path class="sf-soft" d="M-12 52 L12 52 L0 32 Z"/><path class="sb" d="M-14 36 L-12 32 L12 32 L14 28"/><path class="sb" d="M-40 40 L-7 40"/>';
        polyLead([[0, 0], [0, 32]], 0);
        polyLead([[0, 80], [0, 52]], 1);
        polyLead([[-40, 40], [-30, 40]], 2);
        const lq = Pg(-24, 54);
        extra += `<text x="${lq[0]}" y="${lq[1]}" class="pin-t" text-anchor="middle">REF</text>`;
        const c0 = Pg(0, 40), c1 = Pg(1, 40);
        label = { x: c0[0] + (c1[0] >= c0[0] ? 20 : -20), y: c0[1] - 2, lines: [name, 'TL431'].filter(Boolean), anchor: c1[0] >= c0[0] ? 'start' : 'end' };
        break;
      }
      case 'RLY': {
        inner = `<rect x="-11" y="20" width="22" height="40" rx="2" class="sb" fill="var(--sch-bg)"/><path class="sb thin" d="M-11 20 L11 60"/>
          <circle cx="60" cy="24" r="3" class="sb" fill="var(--sch-bg)"/><circle cx="100" cy="24" r="3" class="sb" fill="var(--sch-bg)"/><circle cx="80" cy="56" r="3" class="sb" fill="var(--sch-bg)"/>
          <path class="sb thick lever sw-off" d="M80 56 L62 27"/><path class="sb thick lever sw-on" d="M80 56 L98 27"/>
          <path class="sb thin" d="M11 40 L74 40" stroke-dasharray="4 4"/>`;
        const tNC = Pg(52, 14), tNO = Pg(110, 14), tCOM = Pg(92, 66);
        extra += `<text x="${tNC[0]}" y="${tNC[1] + 3}" class="pin-t" text-anchor="middle">NC</text><text x="${tNO[0]}" y="${tNO[1] + 3}" class="pin-t" text-anchor="middle">NO</text><text x="${tCOM[0]}" y="${tCOM[1] + 3}" class="pin-t" text-anchor="middle">COM</text>`;
        polyLead([[0, 0], [0, 20]], 0);
        polyLead([[0, 80], [0, 60]], 1);
        polyLead([[80, 80], [80, 59]], 2);
        polyLead([[100, 0], [100, 21]], 3);
        polyLead([[60, 0], [60, 21]], 4);
        label = sideLabel(-6, 22, [name, valueLabel(el)]);
        const cc = Pg(-14, 40);
        label = { x: cc[0], y: cc[1] - 4, lines: [name, valueLabel(el)].filter(Boolean), anchor: Pg(10, 0)[0] >= Pg(0, 0)[0] ? 'end' : 'start' };
        break;
      }
    }
    body = `<g transform="${T}">${inner}</g>${extra}`;
    const PWR = { VREG: [60, 0], DCDC: [60, 0], BUCK: [60, 20], BOOST: [60, 20], ACDC: [60, 20], TL431: [0, 42] };
    const ctr = el.type === 'OA' ? Pg(34, 0) : el.type === 'X' ? Pg(40, 40) : el.type === 'ASW' ? Pg(40, -6) : el.type === 'RLY' ? Pg(50, 40) : PWR[el.type] ? Pg(...PWR[el.type]) : Pg(26, 0);
    return { body, leads, label, center: ctr };
  }

  // ================================================================= 디지털 기호 (지역 좌표 px)
  const ln = (x1, y1, x2, y2, cls, p) => `<line class="${cls || 'sb'}"${p != null ? ` data-p="${p}"` : ''} x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`;
  const dlead = (p, x1, y1, x2, y2) => ln(x1, y1, x2, y2, 'lead', p);
  const bubble = (cx, cy, r) => `<circle class="sb bub" cx="${f1(cx)}" cy="${f1(cy)}" r="${r || 4.2}"/>`;

  function gateBody(type, h, iec) {
    const x0 = 0.6 * S, x1 = 3.2 * S, w = x1 - x0, H = h * S;
    const neg = type === 'NAND' || type === 'NOR' || type === 'XNOR' || type === 'NOT';
    let body = '', backX = () => x0;
    if (iec) {
      const sym = { AND: '&amp;', NAND: '&amp;', OR: '≥1', NOR: '≥1', XOR: '=1', XNOR: '=1', NOT: '1', BUF: '1' }[type];
      const hh = type === 'NOT' || type === 'BUF' ? 0.9 * S : H;
      body = `<rect class="sb gate-body" x="${x0}" y="${-hh}" width="${w}" height="${2 * hh}" rx="2"/><text class="iec-t" x="${f1(x0 + w / 2)}" y="${f1(-hh + 17)}" text-anchor="middle">${sym}</text>`;
    } else if (type === 'AND' || type === 'NAND') {
      const xa = x0 + w * 0.42;
      body = `<path class="sb gate-body" d="M${x0},${-H} L${f1(xa)},${-H} A${f1(x1 - xa)},${H} 0 0 1 ${f1(xa)},${H} L${x0},${H} Z"/>`;
    } else if (type === 'OR' || type === 'NOR' || type === 'XOR' || type === 'XNOR') {
      const xs = type === 'XOR' || type === 'XNOR' ? x0 + 6 : x0;
      const ww = x1 - xs;
      body = `<path class="sb gate-body" d="M${xs},${-H} Q${f1(xs + ww * 0.58)},${-H} ${x1},0 Q${f1(xs + ww * 0.58)},${H} ${xs},${H} Q${f1(xs + ww * 0.28)},0 ${xs},${-H} Z"/>`;
      if (xs !== x0) body += `<path class="sb" d="M${x0},${-H} Q${f1(x0 + ww * 0.28)},0 ${x0},${H}" fill="none"/>`;
      backX = (yy) => { const t = (yy + H) / (2 * H); return xs + 2 * t * (1 - t) * ww * 0.28; };
    } else {
      body = `<path class="sb gate-body" d="M${x0},${-0.9 * S} L${x1},0 L${x0},${0.9 * S} Z"/>`;
    }
    return { body, backX, neg, x1 };
  }

  const SYM = {};
  function drawGate(el, lay, iec) {
    const { body, backX, neg, x1 } = gateBody(el.type, lay.body.y1, iec);
    let s = body;
    lay.pins.forEach((p, k) => { if (p.dir === 'in') s += dlead(k, 0, p.y * S, iec ? 0.6 * S : backX(p.y * S), p.y * S); });
    const outK = lay.pins.length - 1;
    if (neg) { s += bubble(x1 + 4.4, 0); s += dlead(outK, x1 + 8.6, 0, 4 * S, 0); } else s += dlead(outK, x1, 0, 4 * S, 0);
    return s;
  }
  D.GATE_TYPES.forEach((t) => { SYM[t] = drawGate; });
  SYM.TBUF = (el, lay, iec) => {
    const x0 = 0.6 * S, x1 = 3.0 * S, h = 0.9 * S;
    let s = iec ? `<rect class="sb gate-body" x="${x0}" y="${-h}" width="${x1 - x0}" height="${2 * h}" rx="2"/><text class="iec-t" x="${f1((x0 + x1) / 2)}" y="${f1(-h + 17)}" text-anchor="middle">▽</text>`
      : `<path class="sb gate-body" d="M${x0},${-h} L${x1},0 L${x0},${h} Z"/>`;
    const ey = iec ? -h : -h + h * (2 * S - x0) / (x1 - x0);
    s += dlead(0, 0, 0, x0, 0);
    if (on(el.params.inv)) { s += bubble(2 * S, ey - 4.4); s += dlead(1, 2 * S, -2 * S, 2 * S, ey - 8.6); } else s += dlead(1, 2 * S, -2 * S, 2 * S, ey);
    s += dlead(2, x1, 0, 4 * S, 0);
    return s;
  };
  function drawBox(el, lay) {
    const b = lay.body;
    const X0 = b.x0 * S, Y0 = b.y0 * S, X1 = b.x1 * S, Y1 = b.y1 * S;
    let s = `<rect class="sb box-body" x="${X0}" y="${f1(Y0)}" width="${X1 - X0}" height="${f1(Y1 - Y0)}" rx="3"/>`;
    const texts = [];
    lay.pins.forEach((p, k) => {
      const px = p.x * S, py = p.y * S;
      let ax = px, ay = py;
      if (p.side === 'l') ax = X0; else if (p.side === 'r') ax = X1; else if (p.side === 't') ay = Y0; else if (p.side === 'b') ay = Y1;
      if (p.neg) {
        const dx = Math.sign(px - ax) * 4.4, dy = Math.sign(py - ay) * 4.4;
        s += bubble(ax + dx, ay + dy);
        s += dlead(k, px, py, ax + dx * 2, ay + dy * 2);
      } else s += dlead(k, px, py, ax, ay);
      if (p.clk && p.side === 'l') s += `<path class="sb thin" d="M${X0},${py - 6} L${X0 + 9},${py} L${X0},${py + 6}" fill="none"/>`;
      const lbl = p.lbl;
      if (!lbl) return;
      const pad = p.clk ? 12 : 4;
      if (p.side === 'l') texts.push({ x: (X0 + pad) / S, y: py / S, t: lbl, a: 'start', c: 'pin-t', ov: p.bar });
      else if (p.side === 'r') texts.push({ x: (X1 - 4) / S, y: py / S, t: lbl, a: 'end', c: 'pin-t', ov: p.bar });
      else if (p.side === 't') texts.push({ x: px / S, y: (Y0 + 9) / S, t: lbl, a: 'middle', c: 'pin-t', ov: p.bar });
      else texts.push({ x: px / S, y: (Y1 - 8) / S, t: lbl, a: 'middle', c: 'pin-t', ov: p.bar });
    });
    return { s, texts };
  }
  SYM.SW = () => `<rect class="sw-pill" x="-56" y="-11" width="40" height="22" rx="11"/><circle class="sw-knob" cx="-45" cy="0" r="8"/>${dlead(0, -16, 0, 0, 0)}`;
  SYM.BTN = () => `<rect class="pb-frame" x="-52" y="-14" width="32" height="28" rx="6"/><circle class="pb-cap" cx="-36" cy="0" r="9.5"/>${dlead(0, -20, 0, 0, 0)}`;
  SYM.CLK = () => `<rect class="clk-box" x="-70" y="-15" width="58" height="30" rx="5"/><path class="clk-wave" d="M-64,6 L-58,6 L-58,-6 L-47,-6 L-47,6 L-36,6 L-36,-6 L-25,-6 L-25,6 L-18,6" fill="none"/>${dlead(0, -12, 0, 0, 0)}`;
  SYM.HI = () => `${dlead(0, 0, 0, 0, -18)}<line class="sb" x1="-12" y1="-18" x2="12" y2="-18"/>`;
  SYM.LO = () => `${dlead(0, 0, 0, 0, 14)}<line class="sb" x1="-12" y1="14" x2="12" y2="14"/><line class="sb" x1="-7" y1="19" x2="7" y2="19"/><line class="sb" x1="-2.5" y1="24" x2="2.5" y2="24"/>`;
  const vzig = (y0, y1) => { const n = 6, dy = (y1 - y0) / n; let d = `M0,${y0}`; for (let i = 0; i < n; i++) d += ` L${i % 2 ? -6 : 6},${f1(y0 + dy * (i + 0.5))}`; return d + ` L0,${y1}`; };
  SYM.PU = () => `${dlead(0, 0, 0, 0, -12)}<path class="sb thin" d="${vzig(-12, -48)}" fill="none"/><line class="sb" x1="0" y1="-48" x2="0" y2="-56"/><line class="sb" x1="-10" y1="-56" x2="10" y2="-56"/>`;
  SYM.PD = () => `${dlead(0, 0, 0, 0, 12)}<path class="sb thin" d="${vzig(12, 48)}" fill="none"/><line class="sb" x1="0" y1="48" x2="0" y2="54"/><line class="sb" x1="-10" y1="54" x2="10" y2="54"/><line class="sb" x1="-6" y1="58" x2="6" y2="58"/><line class="sb" x1="-2" y1="62" x2="2" y2="62"/>`;
  SYM.DIP = (el, lay) => {
    const n = lay.n;
    let s = `<rect class="dip-body" x="-68" y="-12" width="60" height="${n * S + 4}" rx="4"/>`;
    for (let i = 0; i < n; i++) s += `<rect class="dip-sw" x="-60" y="${i * S - 7}" width="30" height="14" rx="3"/><rect class="dip-knob" data-bitk="${i}" x="-59" y="${i * S - 6}" width="13" height="12" rx="2"/>${dlead(i, -8, i * S, 0, i * S)}`;
    return s;
  };
  SYM.ADC = (el, lay) => {
    const n = lay.n, h = Math.max(n - 1, 2);
    let s = `<rect class="sb box-body" x="${-5 * S}" y="-16" width="${4 * S}" height="${h * S + 32}" rx="4"/><text class="box-title" x="${-3 * S}" y="26" text-anchor="middle">A/D</text><text class="adc-v" x="${-3 * S}" y="46" text-anchor="middle">V</text>`;
    for (let i = 0; i < n; i++) s += dlead(i, -S, i * S, 0, i * S);
    s += dlead(n, -6 * S, 0, -5 * S, 0);
    return { s, texts: [{ x: -4.8, y: 0, t: 'VIN', a: 'start', c: 'pin-t' }].concat(lay.pins.slice(0, n).map((p) => ({ x: -1.2, y: p.y, t: p.lbl, a: 'end', c: 'pin-t' }))) };
  };
  SYM.DLED = (el) => {
    const col = LED_COLORS[el.params.color] || LED_COLORS.red;
    return `${dlead(0, 0, 0, 13, 0)}<circle class="led-glow" cx="24" cy="0" r="17" style="--lc:${col}"/><circle class="led" cx="24" cy="0" r="11" style="--lc:${col}"/>`;
  };
  SYM.LEDS = (el, lay) => {
    let s = `<rect class="ledbar-body" x="8" y="-11" width="32" height="${lay.n * S + 2}" rx="3"/>`;
    for (let i = 0; i < lay.n; i++) s += `${dlead(i, 0, i * S, 12, i * S)}<rect class="led seg-led" data-li="${i}" x="15" y="${i * S - 6}" width="20" height="12" rx="2" style="--lc:${LED_COLORS[el.params.color] || LED_COLORS.red}"/>`;
    return s;
  };
  SYM.HEX = () => {
    let s = '<rect class="disp-body" x="20" y="-16" width="72" height="92" rx="5"/><text class="hex-digit" x="56" y="52" text-anchor="middle">0</text>';
    for (let i = 0; i < 4; i++) s += dlead(i, 0, i * S, 20, i * S);
    return s;
  };
  const SEGP = {
    a: 'M4,0 L32,0 L28,5 L8,5 Z', b: 'M33,1 L37,5 L37,29 L33,32 L29,28 L29,6 Z', c: 'M33,34 L37,37 L37,61 L33,65 L29,60 L29,38 Z',
    d: 'M4,66 L8,61 L28,61 L32,66 Z', e: 'M3,34 L7,38 L7,60 L3,65 L-1,61 L-1,37 Z', f: 'M3,1 L7,6 L7,28 L3,32 L-1,29 L-1,5 Z', g: 'M5,33 L9,30 L27,30 L31,33 L27,36 L9,36 Z'
  };
  SYM.SEG = (el, lay) => {
    const n = lay.pins.length;
    const H = Math.max(n * S, 7 * S);
    let s = `<rect class="disp-body" x="20" y="-16" width="88" height="${H + 12}" rx="5"/>`;
    const ox = 58, oy = (H - 4 - 66) / 2 - 10;
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((k) => { s += `<path class="seg" data-seg="${k}" transform="translate(${ox},${f1(oy)})" d="${SEGP[k]}"/>`; });
    if (n > 7) s += `<circle class="seg" data-seg="dp" cx="${ox + 45}" cy="${f1(oy + 64)}" r="3.6"/>`;
    for (let i = 0; i < n; i++) s += dlead(i, 0, i * S, 20, i * S);
    return s;
  };
  SYM.DAC = (el, lay) => {
    const r = drawBox(el, lay);
    const b = lay.body;
    const X0 = b.x0 * S, X1 = b.x1 * S, Y0 = b.y0 * S, Y1 = b.y1 * S;
    r.s += `<rect class="dac-track" x="${X1 - 44}" y="${f1(Y0 + 6)}" width="12" height="${f1(Y1 - Y0 - 12)}" rx="2"/><rect class="dac-bar" x="${X1 - 44}" y="${f1(Y1 - 6)}" width="12" height="0" rx="2" data-top="${f1(Y0 + 6)}" data-bot="${f1(Y1 - 6)}"/>`
      + `<text class="dac-v" x="${f1((X0 + X1 - 44) / 2 + 8)}" y="${f1((Y0 + Y1) / 2 + 5)}" text-anchor="middle">0 V</text>`;
    return r;
  };
  SYM.CMPR = () => '<path class="sb gate-body" d="M10 -34 L10 34 L70 0 Z"/><path class="sb thin" d="M28 6 L34 6 L34 -6 L44 -6 M30 6 L40 6 L40 -6 L46 -6" fill="none"/>'
    + dlead(0, 0, -20, 10, -20) + dlead(1, 0, 20, 10, 20) + dlead(2, 70, 0, 80, 0);

  /** 부품 지역 좌표의 글자 → 세계 좌표 <text> (회전해도 글자는 바로 선다) */
  function worldTextOf(el, t) {
    const [x, y] = D.xf(el, t.x, t.y);
    const [ax, ay] = D.xf(el, 1, 0);
    const dx = ax - el.x, dy = ay - el.y;
    let a = t.a;
    if (dx < 0 && a !== 'middle') a = a === 'start' ? 'end' : 'start';
    if (dy !== 0) a = 'middle';
    const txt = t.ov ? `<tspan class="ovl">${esc(t.t)}</tspan>` : esc(t.t);
    return `<text class="${t.c}" x="${f1(x * S)}" y="${f1(y * S + 4)}" text-anchor="${a}">${txt}</text>`;
  }

  /** 디지털 부품 이름 표시 (게이트는 lbl=1 일 때만, 자동 이름 IC 는 숨김) */
  function nameText(el) {
    const lb = el.params.lbl;
    if (lb === '0' || lb === 0) return '';
    if (lb != null && lb !== '1' && lb !== 1) return String(lb);
    const t = el.type;
    if (['HI', 'LO', 'PU', 'PD'].indexOf(t) >= 0) return '';
    if ((D.GATE_TYPES.indexOf(t) >= 0 || t === 'TBUF') && !(lb === '1' || lb === 1)) return '';
    if (el.autoName && ['SW', 'BTN', 'DLED', 'CLK', 'CMPR', 'T555'].indexOf(t) < 0 && !(lb === '1' || lb === 1)) return '';
    return el.name || '';
  }

  function drawDigital(el, opts) {
    const lay = D.localLayout(el);
    if (!lay) return { body: '', leads: [], label: null, center: [el.x * S, el.y * S], digital: true };
    let out = SYM[el.type] ? SYM[el.type](el, lay, opts.iec) : drawBox(el, lay);
    let tx = [];
    if (typeof out === 'object') { tx = out.texts || []; out = out.s; }
    const r = (parseInt(el.params.rot, 10) || 0) % 4;
    const f = on(el.params.f);
    let s = `<g transform="translate(${el.x * S},${el.y * S})${r ? ` rotate(${r * 90})` : ''}${f ? ' scale(1,-1)' : ''}">${out}</g>`;
    s += tx.map((t) => worldTextOf(el, t)).join('');
    if (el.type === 'CMPR') { s += worldTextOf(el, { x: 0.95, y: -1, t: '−', a: 'middle', c: 'pm' }) + worldTextOf(el, { x: 0.95, y: 1, t: '+', a: 'middle', c: 'pm' }); }
    const nm = opts.names === false ? '' : nameText(el);
    const w = D.boundsOf(el);
    const bb = D.bodyOf(el);
    if (lay.box && opts.title !== false) {
      const title = lay.title && ['SRL', 'DL', 'DFF', 'JKFF', 'TFF', 'SRFF'].indexOf(el.type) < 0 ? lay.title : '';
      if (title || nm) s += `<text class="lbl box-lbl" x="${f1((bb.x0 + bb.x1) / 2 * S)}" y="${f1(w.y0 * S - 6)}" text-anchor="middle"><tspan>${esc(title)}</tspan>${nm ? `<tspan class="nm"> ${esc(nm)}</tspan>` : ''}</text>`;
    } else if (nm) {
      if (['SW', 'BTN', 'CLK'].indexOf(el.type) >= 0 && !r) s += `<text class="lbl" x="${f1(w.x0 * S - 6)}" y="${f1(el.y * S + 5)}" text-anchor="end">${esc(nm)}</text>`;
      else if (el.type === 'DLED' && !r) s += `<text class="lbl" x="${f1(w.x1 * S + 6)}" y="${f1(el.y * S + 5)}">${esc(nm)}</text>`;
      else s += `<text class="lbl" x="${f1((w.x0 + w.x1) / 2 * S)}" y="${f1(w.y0 * S - 6)}" text-anchor="middle">${esc(nm)}</text>`;
    }
    if (el.type === 'HI') s += `<text class="pm small" x="${el.x * S}" y="${el.y * S - 23}" text-anchor="middle">VCC</text>`;
    if (el.type === 'PU') s += `<text class="pm small" x="${el.x * S}" y="${el.y * S - 61}" text-anchor="middle">VCC</text>`;
    return { body: s, leads: [], label: null, center: [(bb.x0 + bb.x1) / 2 * S, (bb.y0 + bb.y1) / 2 * S], digital: true };
  }

  // ================================================================= 색
  function voltColor(v, vmax) {
    if (!isFinite(v)) return 'rgb(96,165,250)';
    const t = Math.max(-1, Math.min(1, v / (vmax || 1)));
    const g = [140, 146, 158];
    const pos = [230, 57, 70], neg = [37, 99, 235];
    const c = t >= 0 ? pos : neg;
    const k = Math.pow(Math.abs(t), 0.7);
    return `rgb(${Math.round(g[0] + (c[0] - g[0]) * k)},${Math.round(g[1] + (c[1] - g[1]) * k)},${Math.round(g[2] + (c[2] - g[2]) * k)})`;
  }

  // ================================================================= 뷰
  const views = new Set();
  let activeView = null;

  class CircuitView {
    /** @param opts { text, label, editable, keepView, names, probeValues, tips, viewBox, budget } */
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = opts;
      this.running = true;
      this.speedMul = 1;
      this.showVolt = opts.showVolt !== false;
      this.showDots = opts.showDots !== false;
      this.iec = !!opts.iec || CircuitView.iec;
      this.markers = {};
      this.pick = null;
      this.hover = null;
      this.dotPos = new Map();
      this.vmaxS = 1; this.imaxS = 1e-3;
      this.el = document.createElement('div');
      this.el.className = 'cv';
      this.el.innerHTML = `<svg class="cv-svg" xmlns="${NS}"></svg><div class="cv-tip hidden"></div><div class="cv-pickmsg hidden"></div><div class="cv-warn hidden"></div>`;
      host.appendChild(this.el);
      this.svg = this.el.querySelector('svg');
      this.tip = this.el.querySelector('.cv-tip');
      this.pickMsg = this.el.querySelector('.cv-pickmsg');
      this.warnEl = this.el.querySelector('.cv-warn');
      this.bind();
      views.add(this);
      if (opts.text != null) this.load(opts.text);
    }

    destroy() {
      this.stop();
      views.delete(this);
      if (activeView === this) { activeView = null; if (CircuitView.onActiveChange) CircuitView.onActiveChange(null); }
      this.el.remove();
    }

    load(text) {
      this.text = text;
      this.circ = CS.parse(text);
      this.errors = this.circ.errors;
      this.rebuild(true);
    }

    rebuild(fitView) {
      try {
        this.sim = new CS.Sim(this.circ);
        this.sim.computeCurrents();
        this.simError = '';
      } catch (e) {
        console.error(e);
        this.sim = null;
        this.simError = e.message;
      }
      this.dotPos.clear();
      this.carry = 0;
      this.render(fitView);
      this.emit('rebuild');
    }

    // ---------------------------------------------------------------- 그리기
    bounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
      this.circ.elements.forEach((el) => {
        if (isDig(el.type)) {
          const b = D.boundsOf(el);
          add(b.x0 * GRID - 10, b.y0 * GRID - 22); add(b.x1 * GRID + 10, b.y1 * GRID + 10);
          if (['SW', 'BTN', 'CLK'].includes(el.type)) add(b.x0 * GRID - (String(el.name || '').length * 8 + 10), b.y0 * GRID);
          if (el.type === 'DLED') add(b.x1 * GRID + String(el.name || '').length * 8 + 10, b.y1 * GRID);
          return;
        }
        CS.pins(el).forEach(([x, y]) => add(x * GRID, y * GRID));
        if (el.type === 'OA') { const m = mat(el); [[10, -40], [72, 40], [34, -60]].forEach(([a, b]) => add(...apply(m, a, b))); }
        if (el.type === 'Q' || el.type === 'M' || el.type === 'J') { const m = mat(el); [[54, 0], [2, 0]].forEach(([a, b]) => add(...apply(m, a, b))); }
        if (el.type === 'RLY') { const m = mat(el); [[-40, 40], [115, 70]].forEach(([a, b]) => add(...apply(m, a, b))); }
        if (PWR_BOX[el.type]) { const m = mat(el); [[20, -40], [100, PWR_BOX[el.type]]].forEach(([a, b]) => add(...apply(m, a, b))); }
        if (el.type === 'TL431') { const m = mat(el); [[-44, 30], [50, 50]].forEach(([a, b]) => add(...apply(m, a, b))); }
        if (el.type === 'G') add(el.x * GRID, el.y * GRID + 22);
        if (el.type === 'TXT') { add(el.x * GRID, el.y * GRID - 14); add(el.x * GRID + String(el.params.text || '').length * 8, el.y * GRID + 4); }
        if (el.type === 'P') add(el.x * GRID + 30, el.y * GRID - 20);
        if (el.type === 'N') add(el.x * GRID + (String(el.params.label).length * 8 + 16) * (el._left ? -1 : 1), el.y * GRID);
      });
      if (!isFinite(x0)) return { x: 0, y: 0, w: 200, h: 120 };
      const m = 40;
      return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
    }

    placeProbeLabels() {
      const tw = (s, size) => [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.62), 0);
      const boxes = [];
      this.drawn.forEach(({ el, d }) => {
        if (el.type === 'P' || !d.label) return;
        const L = d.label;
        const w = Math.max(...L.lines.map((t) => tw(t, 13.5)));
        const x0 = L.anchor === 'end' ? L.x - w : L.anchor === 'middle' ? L.x - w / 2 : L.x;
        boxes.push([x0 - 2, L.y - 13, x0 + w + 2, L.y + (L.lines.length - 1) * 14 + 4]);
      });
      this.drawn.forEach(({ el }) => {
        const def = CS.TYPES[el.type];
        if (isDig(el.type)) { const b = D.boundsOf(el); boxes.push([b.x0 * GRID, b.y0 * GRID, b.x1 * GRID, b.y1 * GRID]); return; }
        if (def.kind !== '2' || el.type === 'W') return;
        const g = geom2(el);
        const hw = Math.max(9, (BODY[el.type] || 0) > 25 ? 16 : 12);
        boxes.push([Math.min(g.x1, g.x2) - (g.uy ? hw : 0), Math.min(g.y1, g.y2) - (g.ux ? hw : 0), Math.max(g.x1, g.x2) + (g.uy ? hw : 0), Math.max(g.y1, g.y2) + (g.ux ? hw : 0)]);
      });
      const hit = (b) => boxes.reduce((n, o) => n + Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])), 0);
      this.drawn.forEach(({ el, d }) => {
        if (el.type !== 'P' || el.params.lp || !d.label) return;
        const x = el.x * GRID, y = el.y * GRID;
        const w = tw(String(el.params.label), 15) + (this.opts.probeValues !== false && el.params.val !== 0 ? 64 : 4);
        let best = null;
        [['tr', 1, -1], ['tl', -1, -1], ['br', 1, 1], ['bl', -1, 1]].forEach(([, sx, sy], order) => {
          const bx0 = sx > 0 ? x + 6 : x - 6 - w, by0 = sy < 0 ? y - 22 : y + 4;
          const s = hit([bx0, by0, bx0 + w, by0 + 18]) + order * 0.5;
          if (!best || s < best.s) best = { s, sx, sy };
        });
        d.label.x = x + best.sx * 8;
        d.label.y = y + (best.sy > 0 ? 16 : -8);
        d.label.anchor = best.sx < 0 ? 'end' : 'start';
        boxes.push([best.sx > 0 ? x + 6 : x - 6 - w, best.sy < 0 ? y - 22 : y + 4, (best.sx > 0 ? x + 6 : x - 6 - w) + w, (best.sy < 0 ? y - 22 : y + 4) + 18]);
      });
    }

    render(fitView) {
      const els = this.circ.elements;
      if ((fitView && !this.opts.keepView) || !this.vb) this.vb = this.opts.viewBox ? this.opts.viewBox : this.bounds();
      const b = this.vb;
      this.svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
      // 이름표는 이어진 도선의 반대쪽으로 깃발을 편다
      els.forEach((el) => {
        if (el.type !== 'N') return;
        el._left = els.some((w) => w.type === 'W' && ((w.x1 === el.x && w.y1 === el.y && w.x2 > el.x) || (w.x2 === el.x && w.y2 === el.y && w.x1 > el.x)));
      });
      const parts = [];
      const leadsAll = [];
      const labels = [];
      this.drawn = [];
      els.forEach((el, idx) => {
        if (el.type === 'W') return;
        const d = drawEl(el, { iec: this.iec, names: this.opts.names });
        this.drawn.push({ el, d, idx });
        parts.push(`<g class="part t-${el.type}${d.digital ? ' dpart' : ''}${this.opts.editable ? ' editable' : ''}" data-i="${idx}">${d.body}</g>`);
        d.leads.forEach((l) => leadsAll.push({ l, el }));
        if (d.label) labels.push({ d, el });
      });
      this.placeProbeLabels();
      const wires = [];
      els.forEach((el, idx) => {
        if (el.type !== 'W') return;
        wires.push(`<line class="wire" data-i="${idx}" x1="${el.x1 * GRID}" y1="${el.y1 * GRID}" x2="${el.x2 * GRID}" y2="${el.y2 * GRID}"/>`);
      });
      const junc = [];
      this.juncNets = [];
      const sim = this.sim;
      if (sim) {
        const deg = new Map();
        const addDeg = (k) => deg.set(k, (deg.get(k) || 0) + 1);
        sim.segs.forEach((s) => { addDeg(s.a); addDeg(s.b); });
        sim.els.forEach((el) => { if (el.type !== 'W' && el.type !== 'P') el._pins.forEach((p) => addDeg(p)); });
        deg.forEach((dd, k) => {
          if (dd >= 3) { const [x, y] = sim.pts[k]; junc.push(`<circle class="junc" data-net="${sim.ptNet[k]}" cx="${x * GRID}" cy="${y * GRID}" r="3.8"/>`); }
        });
        sim.els.forEach((el) => {
          if (el.type === 'W' || el.type === 'P' || el.type === 'G' || el.type === 'N') return;
          el._pins.forEach((p, k) => {
            const pl = el._pl[k];
            if (isDig(el.type) && (pl.def != null || pl.dir === 'out' || pl.dir === 'aout' || ['CV', 'RST', 'VIN'].indexOf(pl.n) >= 0)) return;
            if ((deg.get(p) || 0) < 2) { const [x, y] = sim.pts[p]; junc.push(`<circle class="open-pin" cx="${x * GRID}" cy="${y * GRID}" r="3.2"/>`); }
          });
        });
      }
      const labelSvg = labels.map(({ d, el }) => {
        const L = d.label;
        const cls = L.probe ? 'probe-t' : 'lbl';
        return `<text class="${cls}" data-lbl="${els.indexOf(el)}" x="${L.x}" y="${L.y}" text-anchor="${L.anchor}">${L.lines.map((t, k) => `<tspan x="${L.x}" dy="${k ? 14 : 0}">${esc(t)}</tspan>`).join('')}</text>`;
      }).join('');
      const grid = this.opts.editable ? `<rect class="grid-bg" x="${b.x - 4000}" y="${b.y - 4000}" width="${b.w + 8000}" height="${b.h + 8000}" fill="url(#cvgrid)"/>` : '';
      this.svg.innerHTML = `<defs><pattern id="cvgrid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.1" class="grid-dot"/></pattern></defs>
        ${grid}
        <g class="l-wires">${wires.join('')}</g>
        <g class="l-leads">${leadsAll.map(({ l }, k) => `<line class="lead" data-k="${k}" x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}"/>`).join('')}</g>
        <g class="l-parts">${parts.join('')}</g>
        <g class="l-junc">${junc.join('')}</g>
        <g class="l-dots"></g>
        <g class="l-labels">${labelSvg}</g>
        <g class="l-live"></g>
        <g class="l-marks"></g>
        <g class="l-over"></g>`;
      this.leadsAll = leadsAll;
      this.wireEls = [...this.svg.querySelectorAll('.l-wires .wire')];
      this.leadEls = [...this.svg.querySelectorAll('.l-leads .lead')];
      this.juncEls = [...this.svg.querySelectorAll('.l-junc .junc')];
      this.glowEls = new Map();
      this.partEls = [];
      this.svg.querySelectorAll('.l-parts .part').forEach((g) => {
        const i = +g.dataset.i;
        const el = els[i];
        const gl = g.querySelector('.glow');
        if (gl) this.glowEls.set(i, gl);
        const dleads = [...g.querySelectorAll('.lead[data-p]')].map((l) => ({ l, k: +l.dataset.p }));
        this.partEls.push({ g, el, dleads, c: sim ? sim.comps.find((c) => c.el === el) : null, last: null });
      });
      // 전류 점
      const dots = [];
      this.dotItems = [];
      if (sim) {
        sim.segs.forEach((s) => {
          const net = sim.nets[sim.ptNet[s.a]];
          if (!net.analog) return;
          const [ax, ay] = sim.pts[s.a], [bx, by] = sim.pts[s.b];
          dots.push(`<line class="dot" x1="${ax * GRID}" y1="${ay * GRID}" x2="${bx * GRID}" y2="${by * GRID}"/>`);
          this.dotItems.push({ seg: s, len: Math.hypot(bx - ax, by - ay) * GRID });
        });
        leadsAll.forEach(({ l, el }) => {
          if (el.type === 'G') return;
          dots.push(`<line class="dot" x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}"/>`);
          this.dotItems.push({ el, pin: l[4], sign: l[5], len: Math.hypot(l[2] - l[0], l[3] - l[1]) });
        });
      }
      const dl = this.svg.querySelector('.l-dots');
      dl.innerHTML = dots.join('');
      this.dotEls = [...dl.children];
      // 실시간 값 (전류계 · 전압계 · 측정점)
      this.liveItems = [];
      const live = [];
      this.drawn.forEach(({ el, d }) => {
        if (el.type === 'AM' || el.type === 'VM') {
          const g = geom2(el);
          const vertical = Math.abs(g.uy) > Math.abs(g.ux);
          const x = vertical ? g.mx - 22 : g.mx, y = vertical ? g.my + 5 : g.my + 34;
          live.push(`<text class="live meter-live" x="${x}" y="${y}" text-anchor="${vertical ? 'end' : 'middle'}"></text>`);
          this.liveItems.push({ el, kind: el.type });
        } else if (el.type === 'P' && this.opts.probeValues !== false && el.params.val !== 0 && el.params.val !== '0') {
          const L = d.label;
          const w = String(L.lines[0]).length * 8.5 + 6;
          const x = L.anchor === 'end' ? L.x - w : L.x + w;
          live.push(`<text class="live probe-live" x="${x}" y="${L.y}" text-anchor="${L.anchor}"></text>`);
          this.liveItems.push({ el, kind: 'P' });
        }
      });
      const ll = this.svg.querySelector('.l-live');
      ll.innerHTML = live.join('');
      this.liveEls = [...ll.children];
      this.renderMarks();
      this.updateVisuals(0, true);
      this.emit('render');
    }

    // ---------------------------------------------------------------- 계측기 표시
    setMark(key, m) {
      if (m) this.markers[key] = m; else delete this.markers[key];
      this.renderMarks();
    }
    obstacleBoxes() {
      const tw = (t, size) => [...String(t)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.62), 0);
      const boxes = [];
      (this.drawn || []).forEach(({ el, d }) => {
        const kind = CS.TYPES[el.type].kind;
        if (isDig(el.type)) { const b = D.boundsOf(el); boxes.push([b.x0 * GRID - 4, b.y0 * GRID - 4, b.x1 * GRID + 4, b.y1 * GRID + 4, 1]); }
        else if (kind === '2') {
          const g = geom2(el);
          const hw = (BODY[el.type] || 0) > 25 ? 18 : 13;
          const bx = g.uy ? hw : 0, by = g.ux ? hw : 0;
          const a0 = g.c - g.B / 2 - 3, a1 = g.c + g.B / 2 + 3;
          const p0 = [g.x1 + g.ux * a0, g.y1 + g.uy * a0], p1 = [g.x1 + g.ux * a1, g.y1 + g.uy * a1];
          boxes.push([Math.min(p0[0], p1[0]) - bx, Math.min(p0[1], p1[1]) - by, Math.max(p0[0], p1[0]) + bx, Math.max(p0[1], p1[1]) + by, 1]);
          boxes.push([Math.min(g.x1, g.x2) - (g.uy ? 8 : 0) - 3, Math.min(g.y1, g.y2) - (g.ux ? 8 : 0) - 3, Math.max(g.x1, g.x2) + (g.uy ? 8 : 0) + 3, Math.max(g.y1, g.y2) + (g.ux ? 8 : 0) + 3, 0.7]);
        } else if (el.type === 'G') {
          const x = el.x * GRID, y = el.y * GRID;
          boxes.push([x - 13, y, x + 13, y + 22, 1]);
        } else if (el.type !== 'P' && el.type !== 'TXT') {
          const ps = CS.pins(el).map(([x, y]) => [x * GRID, y * GRID]);
          const xs = ps.map((q) => q[0]).concat(d.center[0]), ys = ps.map((q) => q[1]).concat(d.center[1]);
          boxes.push([Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6, 1]);
        }
        if (d.label) {
          const L = d.label;
          const w = Math.max(...L.lines.map((t) => tw(t, L.probe ? 15 : 13.5))) + (L.probe && this.opts.probeValues !== false ? 64 : 0);
          const x0 = L.anchor === 'end' ? L.x - w : L.anchor === 'middle' ? L.x - w / 2 : L.x;
          boxes.push([x0 - 2, L.y - 14, x0 + w + 2, L.y + (L.lines.length - 1) * 14 + 4, 1]);
        }
      });
      this.circ.elements.forEach((el) => {
        if (el.type !== 'W') return;
        boxes.push([Math.min(el.x1, el.x2) * GRID - 3, Math.min(el.y1, el.y2) * GRID - 3, Math.max(el.x1, el.x2) * GRID + 3, Math.max(el.y1, el.y2) * GRID + 3, 0.25]);
      });
      return boxes;
    }

    renderMarks() {
      const g = this.svg.querySelector('.l-marks');
      if (!g) return;
      const keys = Object.keys(this.markers);
      if (!keys.length) { g.innerHTML = ''; return; }
      const boxes = this.obstacleBoxes();
      const vb = this.vb || { x: -1e5, y: -1e5, w: 2e5, h: 2e5 };
      const cost = (b) => {
        let c = 0;
        boxes.forEach((o) => { c += o[4] * Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])); });
        const out = Math.max(0, vb.x - b[0]) + Math.max(0, b[2] - vb.x - vb.w) + Math.max(0, vb.y - b[1]) + Math.max(0, b[3] - vb.y - vb.h);
        return c + out * 400;
      };
      const H = 17;
      keys.forEach((k) => {
        const m = this.markers[k];
        if (!m.el) return;
        const d = this.drawn.find((x) => x.el.name === m.el);
        if (d) { const [cx, cy] = d.d.center; boxes.push([cx - 25, cy - 25, cx + 25, cy + 25, 0.8]); }
      });
      g.innerHTML = keys.map((k) => {
        const m = this.markers[k];
        const w = m.text.length * 8 + 10;
        if (m.el) {
          const d = this.drawn.find((x) => x.el.name === m.el);
          if (!d) return '';
          const [cx, cy] = d.d.center;
          let best = null;
          [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]].forEach(([sx, sy], order) => {
            const tx = sx > 0 ? cx + 14 : sx < 0 ? cx - 14 - w : cx - w / 2;
            const ty = sy < 0 ? cy - 34 - (sx ? 0 : 6) : cy + 17 + (sx ? 0 : 6);
            const bb = [tx, ty, tx + w, ty + H];
            const c = cost(bb) + order * 2;
            if (!best || c < best.c) best = { c, b: bb };
          });
          boxes.push(best.b.concat(1));
          return `<g class="mark"><circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="${m.color}" stroke-width="2.5" stroke-dasharray="5 4"/>
            <rect x="${best.b[0]}" y="${best.b[1]}" width="${w}" height="${H}" rx="4" fill="${m.color}"/><text x="${best.b[0] + w / 2}" y="${best.b[1] + 12.5}" class="mark-t" text-anchor="middle">${esc(m.text)}</text></g>`;
        }
        const x = m.x * GRID, y = m.y * GRID;
        let best = null;
        const dirs = [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]];
        [26, 40].forEach((dist, di) => dirs.forEach(([sx, sy], order) => {
          const n = Math.hypot(sx, sy);
          const tcx = x + sx / n * (dist + (sx ? w / 2 - 6 : 0) * Math.abs(sx / n)), tcy = y + sy / n * dist;
          const bb = [tcx - w / 2, tcy - H / 2, tcx + w / 2, tcy + H / 2];
          const c = cost(bb) + order * 0.5 + di * 40;
          if (!best || c < best.c) best = { c, b: bb, tcx, tcy };
        }));
        boxes.push(best.b.concat(1));
        const ex = Math.max(best.b[0], Math.min(x, best.b[2])), ey = Math.max(best.b[1], Math.min(y, best.b[3]));
        return `<g class="mark"><path d="M${x} ${y} L${ex} ${ey}" stroke="${m.color}" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="6.5" fill="${m.color}" stroke="#000" stroke-opacity=".35"/>
          <rect x="${best.b[0]}" y="${best.b[1]}" width="${w}" height="${H}" rx="4" fill="${m.color}"/><text x="${best.tcx}" y="${best.b[1] + 12.5}" class="mark-t" text-anchor="middle">${esc(m.text)}</text></g>`;
      }).join('');
    }

    // ---------------------------------------------------------------- 애니메이션
    activate() {
      if (activeView === this) return;
      if (activeView) activeView.deactivate();
      activeView = this;
      this.el.classList.add('active');
      this.start();
      if (CircuitView.onActiveChange) CircuitView.onActiveChange(this);
      if (this.opts.onActivate) this.opts.onActivate(this);
    }
    deactivate() {
      this.stop();
      this.el.classList.remove('active');
      if (activeView === this) activeView = null;
    }
    get isActive() { return activeView === this; }

    start() {
      if (this.raf) return;
      this.last = performance.now();
      const loop = (ts) => { this.raf = requestAnimationFrame(loop); this.frame(ts); };
      this.raf = requestAnimationFrame(loop);
    }
    stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

    simSpeed() {
      const sim = this.sim;
      if (!sim) return 0;
      return sim.autoSpeed(this.scopeTb) * this.speedMul;
    }

    frame(ts) {
      const dtReal = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
      this.last = ts;
      const sim = this.sim;
      if (!sim) return;
      if (this.running) {
        const want = this.simSpeed() * dtReal;
        const adv = sim.run(want, this.opts.budget || 12);
        this.realSpeed = dtReal > 0 ? adv / dtReal : 0;
      }
      if (sim.visualDirty) { sim.visualDirty = false; this.render(false); this.emit('change'); }
      sim.computeCurrents();
      this.updateVisuals(dtReal);
      this.emit('frame');
    }

    /** 넷 색: 아날로그 → 전압 색(style), 디지털 → 논리 클래스 */
    paintNet(node, net) {
      const sim = this.sim;
      node.classList.remove('v0', 'v1', 'vx', 'vz', 'conf');
      if (!this.showVolt || net == null || net < 0 || !sim.nets[net]) { node.style.stroke = ''; if (node.tagName === 'circle') node.style.fill = ''; return; }
      const n = sim.nets[net];
      if (n.analog) {
        const c = voltColor(sim.netV(net), this.vmaxS);
        if (node.tagName === 'circle') node.style.fill = c; else node.style.stroke = c;
      } else {
        node.style.stroke = ''; if (node.tagName === 'circle') node.style.fill = '';
        node.classList.add(VCLS[n.v]);
        if (n.conflict) node.classList.add('conf');
      }
    }

    updateVisuals(dtReal, force) {
      const sim = this.sim;
      if (!sim) { this.showWarn(this.simError ? '⚠ ' + this.simError : ''); return; }
      let vmax = 0;
      sim.nets.forEach((n) => { if (n.analog) { const v = Math.abs(sim.netV(n.id)); if (isFinite(v)) vmax = Math.max(vmax, v); } });
      if (!sim.analog) vmax = sim.vdd;
      this.vmaxS = Math.max(1, dtReal ? this.vmaxS + (vmax - this.vmaxS) * Math.min(1, dtReal * 2) : vmax);
      if (this.wireEls) {
        let wi = 0;
        this.circ.elements.forEach((el) => {
          if (el.type !== 'W') return;
          const line = this.wireEls[wi++];
          if (line && el._pins) this.paintNet(line, sim.ptNet[el._pins[0]]);
        });
      }
      if (this.leadEls) this.leadsAll.forEach(({ l, el }, k) => { if (el._pins) this.paintNet(this.leadEls[k], sim.ptNet[el._pins[l[4]]]); });
      if (this.juncEls) this.juncEls.forEach((j) => this.paintNet(j, +j.dataset.net));
      (this.partEls || []).forEach((p) => {
        if (p.el._pins) p.dleads.forEach(({ l, k }) => this.paintNet(l, sim.ptNet[p.el._pins[k]]));
        this.updatePart(p, force);
      });
      // 전류 점
      let imax = 0;
      sim.els.forEach((el) => { if (el._ic) el._ic.forEach((i) => { if (isFinite(i)) imax = Math.max(imax, Math.abs(i)); }); });
      this.imaxS = Math.max(1e-9, dtReal ? this.imaxS + (imax - this.imaxS) * Math.min(1, dtReal * 1.5) : imax || 1e-3);
      const K = 90 / this.imaxS;
      if (this.dotEls) {
        this.dotItems.forEach((it, k) => {
          const e = this.dotEls[k];
          const i = it.seg ? it.seg.i : (it.el._ic ? (it.el._ic[it.pin] || 0) * it.sign : 0);
          const vis = this.showDots && Math.abs(i) > this.imaxS * 2e-3 && Math.abs(i) > 1e-10;
          if (!vis) { if (e.style.display !== 'none') e.style.display = 'none'; return; }
          if (e.style.display === 'none') e.style.display = '';
          const sp = Math.max(-240, Math.min(240, i * K));
          const pos = (this.dotPos.get(k) || 0) + sp * dtReal;
          this.dotPos.set(k, pos % 16);
          e.style.strokeDashoffset = (-pos % 16).toFixed(2);
        });
      }
      this.glowEls.forEach((g, idx) => {
        const el = this.circ.elements[idx];
        let lvl = 0;
        if (el.type === 'LED') lvl = Math.max(0, Math.min(1, (el._ic ? el._ic[0] : 0) / 0.02));
        if (el.type === 'LAMP') { const i = el._ic ? el._ic[0] : 0; lvl = Math.min(1, i * i * CS.lampR(el.params) / (+el.params.w || 1)); }
        g.setAttribute('opacity', (Math.pow(lvl, 0.6) * 0.85).toFixed(3));
      });
      if (this.liveEls) {
        this.liveItems.forEach((it, k) => {
          const e = this.liveEls[k];
          let t = '';
          if (it.kind === 'AM') t = CS.fmt(it.el._ic ? it.el._ic[0] : 0, 'A');
          else if (it.kind === 'VM') t = CS.fmt(sim.netV(sim.ptNet[it.el._pins[0]]) - sim.netV(sim.ptNet[it.el._pins[1]]), 'V');
          else if (it.kind === 'P') {
            const n = sim.nets[sim.ptNet[it.el._pins[0]]];
            if (n.analog) t = CS.fmt(sim.netV(n.id), 'V');
            else t = '= ' + CS.VCH[n.v];
            const cls = 'live probe-live' + (n.analog ? '' : ' ' + VCLS[n.v]);
            if (e.getAttribute('class') !== cls) e.setAttribute('class', cls);
          }
          if (e.textContent !== t) e.textContent = t;
        });
      }
      const warn = sim.dig.overload ? '⚡ 사건이 너무 많습니다 (빠른 발진) — 속도를 낮추세요' : sim.dig.conflict && sim.nets.some((n) => n.conflict) ? '⚠ 디지털 출력끼리 충돌 (X)' : sim.warn || (sim.analog && sim.analog.warn) || '';
      this.showWarn(warn);
      if (this.hover && this.tip && !this.tip.classList.contains('hidden') && !this.drag) this.showTip(this.hover, true);
    }
    showWarn(msg) {
      if (this.warnEl.textContent !== msg) { this.warnEl.textContent = msg; this.warnEl.classList.toggle('hidden', !msg); }
    }

    updatePart(p, force) {
      const { g, el, c } = p;
      const sim = this.sim;
      if (el.type === 'ASW') { const o = sim.analog && sim.analog.aswOn(el); if (force || p.last !== o) { p.last = o; g.classList.toggle('on', !!o); } return; }
      if (el.type === 'RLY') { const o = !!(el.st && el.st.on); if (force || p.last !== o) { p.last = o; g.classList.toggle('on', o); } return; }
      if (!c) return;
      const key = stateKey(sim, c);
      if (!force && p.last === key) return;
      p.last = key;
      const d = sim.dig;
      switch (el.type) {
        case 'SW': g.classList.toggle('on', !!c.s.on); break;
        case 'BTN': g.classList.toggle('on', !!c.s.down); break;
        case 'CLK': g.classList.toggle('on', c.s.v === L1); g.classList.toggle('paused', !c.running); break;
        case 'DLED': { const v = d.netValue(c.ins[0]); g.classList.toggle('on', v === L1); g.classList.toggle('bad', v === LX); break; }
        case 'LEDS': g.querySelectorAll('[data-li]').forEach((r) => { const v = d.netValue(c.ins[+r.dataset.li]); r.classList.toggle('lit', v === L1); r.classList.toggle('bad', v === LX); }); break;
        case 'DIP': g.querySelectorAll('[data-bitk]').forEach((r) => { const i = +r.dataset.bitk; const bit = (c.s.val >> (c.n - 1 - i)) & 1; r.setAttribute('x', bit ? -44 : -59); r.classList.toggle('on', !!bit); }); break;
        case 'HEX': {
          const v = d.compValue(c);
          g.querySelector('.hex-digit').textContent = v == null ? '–' : v.toString(16).toUpperCase();
          g.classList.toggle('bad', v == null);
          break;
        }
        case 'SEG': {
          const ca = on(el.params.ca);
          g.querySelectorAll('[data-seg]').forEach((sg) => {
            const idx = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].indexOf(sg.dataset.seg);
            const v = d.netValue(c.ins[idx]);
            sg.classList.toggle('lit', v === (ca ? L0 : L1));
            sg.classList.toggle('bad', v === LX);
          });
          break;
        }
        case 'DAC': {
          const vo = c.aoutV ? c.aoutV[0] : 0;
          const vref = c.vref || 5;
          const bar = g.querySelector('.dac-bar');
          const top = +bar.dataset.top, bot = +bar.dataset.bot;
          const h = Math.max(0, (bot - top) * Math.min(1, vo / vref));
          bar.setAttribute('y', f1(bot - h)); bar.setAttribute('height', f1(h));
          g.querySelector('.dac-v').textContent = c.s.code == null ? '? V' : (+vo.toFixed(2)) + ' V';
          break;
        }
        case 'ADC': { const v = c.s.vnow != null ? c.s.vnow : c.s.vin; g.querySelector('.adc-v').textContent = (+(+v).toFixed(2)) + ' V'; break; }
        case 'T555': g.classList.toggle('on', c.s.q === L1); break;
        case 'CMPR': g.classList.toggle('on', c.ov[0] === L1); break;
      }
    }

    // ---------------------------------------------------------------- 조회
    toSvg(e) {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const m = this.svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const r = pt.matrixTransform(m.inverse());
      return { x: r.x, y: r.y };
    }
    pxPerUnit() { const m = this.svg.getScreenCTM(); return m ? m.a : 1; }

    /** 마우스 위치의 대상: {kind:'node', x,y} | {kind:'el', el} */
    hitTest(e) {
      if (!this.sim) return null;
      const p = this.toSvg(e);
      const tol = Math.max(6, 9 / this.pxPerUnit());
      let best = null, bd = tol;
      this.sim.pts.forEach(([x, y]) => {
        const d = Math.hypot(x * GRID - p.x, y * GRID - p.y);
        if (d < bd) { bd = d; best = { kind: 'node', x, y }; }
      });
      if (best) return best;
      let bestEl = null, be = Infinity;
      this.drawn.forEach(({ el, d }) => {
        if (el.type === 'TXT') return;
        const [cx, cy] = d.center;
        let dist;
        if (isDig(el.type)) {
          const b = D.bodyOf(el);
          const x0 = b.x0 * GRID - 3, x1 = b.x1 * GRID + 3, y0 = b.y0 * GRID - 3, y1 = b.y1 * GRID + 3;
          dist = p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 ? 0 : Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(y0 - p.y, 0, p.y - y1)) + 6;
        } else if (CS.TYPES[el.type].kind === '2') {
          const g = geom2(el);
          dist = segDist(p.x, p.y, g.x1, g.y1, g.x2, g.y2);
          const along = (p.x - g.x1) * g.ux + (p.y - g.y1) * g.uy;
          if (Math.abs(along - g.c) > Math.max(g.B / 2 + 6, 12)) dist += 8;
          if (el.type === 'POT' || el.type === 'SPDT') dist = Math.min(dist, Math.hypot(p.x - cx, p.y - cy) - 10);
        } else if (el.type === 'P' || el.type === 'N') dist = Math.hypot(p.x - cx, p.y - cy) - (el.type === 'N' ? 12 : 0);
        else dist = Math.hypot(p.x - cx, p.y - cy) - (el.type === 'OA' ? 28 : el.type === 'X' ? 30 : el.type === 'RLY' ? 36 : PWR_BOX[el.type] ? 34 : 18);
        if (dist < be) { be = dist; bestEl = el; }
      });
      if (bestEl && be < Math.max(14, 16 / this.pxPerUnit())) return { kind: 'el', el: bestEl };
      let bw = null, bwd = tol;
      this.sim.segs.forEach((s) => {
        const [ax, ay] = this.sim.pts[s.a], [bx, by] = this.sim.pts[s.b];
        const d = segDist(p.x, p.y, ax * GRID, ay * GRID, bx * GRID, by * GRID);
        if (d < bwd) { bwd = d; bw = s; }
      });
      if (bw) return { kind: 'node', x: this.sim.pts[bw.a][0], y: this.sim.pts[bw.a][1], wire: bw };
      return null;
    }

    netName(n) {
      const sim = this.sim;
      if (n == null || n < 0 || !sim) return '';
      const net = sim.nets[n];
      if (net.gnd) return 'GND';
      if (net.names.length) return net.names[0];
      for (const [c, k] of net.drv) { const pp = c.outPins[k]; return pp && c.outs.length > 1 ? `${pp.lbl || pp.n}(${c.name})` : c.name; }
      return '넷 ' + n;
    }

    describe(h) {
      const sim = this.sim;
      const F = CS.fmt;
      const row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
      if (h.kind === 'node') {
        const n = sim.netOfPoint(h.x, h.y);
        const net = sim.nets[n];
        if (!net) return '';
        const nm = this.netName(n);
        if (!net.analog) {
          return `<div class="big ${VCLS[net.v]}">${CS.VCH[net.v]}</div><div><b>${esc(nm)}</b> <span class="muted">디지털 · ${LOGIC_NAME[net.v]}</span></div>`
            + (net.conflict ? '<div style="color:#fca5a5">⚠ 두 출력이 서로 다른 값을 내보내 충돌합니다</div>' : '');
        }
        const v = sim.netV(n);
        let s = `<b>${net.gnd ? '⏚ 접지 (0 V 기준)' : esc(nm)}</b><div class="big">${F(v, 'V')}</div>`;
        if (h.wire) s += `<div class="muted">도선 전류 ${F(Math.abs(h.wire.i), 'A')}</div>`;
        if (net.rd.length || net.drv.length) s += `<div class="muted">디지털 입력으로 읽으면 <b class="lvt v${net.av}">${CS.VCH[net.av]}</b> (문턱 ${F(sim.vil, 'V')} / ${F(sim.vih, 'V')})</div>`;
        return s;
      }
      const el = h.el;
      if (isDig(el.type)) return this.partTip(el);
      if (el.type === 'P' || el.type === 'N') {
        const n = sim.ptNet[el._pins[0]];
        return this.describe({ kind: 'node', x: el.x, y: el.y }).replace(/^<b>[^<]*<\/b>/, `<b>${el.type === 'P' ? '측정점' : '이름표'} ${esc(el.params.label)}</b>`) + (n < 0 ? '' : '');
      }
      const inf = sim.info(el);
      const title = `${esc(el.name || '')} <span class="muted">${esc(CS.TYPES[el.type].name)}${valueLabel(el) ? ' · ' + esc(valueLabel(el)) : ''}</span>`;
      let rows = '';
      switch (el.type) {
        case 'Q':
          rows = row('V<sub>BE</sub>', F(inf.vbe, 'V')) + row('V<sub>CE</sub>', F(inf.vce, 'V')) + row('I<sub>B</sub>', F(inf.ib, 'A')) + row('I<sub>C</sub>', F(inf.ic, 'A'))
            + row('I<sub>C</sub>/I<sub>B</sub>', Math.abs(inf.ib) > 1e-12 ? (inf.ic / inf.ib).toFixed(1) : '—') + row('동작 영역', inf.region);
          break;
        case 'M': case 'J':
          rows = row('V<sub>GS</sub>', F(inf.vgs, 'V')) + row('V<sub>DS</sub>', F(inf.vds, 'V')) + row('I<sub>D</sub>', F(inf.id, 'A')) + row('동작 영역', inf.region || '—');
          break;
        case 'OA':
          rows = row('V<sub>+</sub>', F(inf.vplus, 'V')) + row('V<sub>−</sub>', F(inf.vminus, 'V')) + row('V<sub>+</sub> − V<sub>−</sub>', F(inf.vin, 'V')) + row('출력', F(inf.vout, 'V')) + row('출력 전류', F(inf.iout, 'A'));
          break;
        case 'POT':
          rows = row('양 끝 전압', F(inf.v, 'V')) + row('와이퍼 전압', F(inf.vw, 'V')) + row('위치', Math.round(inf.pos * 100) + '%');
          break;
        case 'X':
          rows = row('1차 전압', F(inf.v1, 'V')) + row('2차 전압', F(inf.v2, 'V')) + row('1차 전류', F(inf.i1, 'A')) + row('2차 전류', F(inf.i2, 'A'));
          break;
        case 'ASW':
          rows = row('상태', inf.on ? '닫힘 (ON)' : '열림 (OFF)') + row('A − B 전압', F(inf.v, 'V')) + row('전류', F(Math.abs(inf.i), 'A')) + '<div class="muted">CTL 이 1 이면 닫힙니다 (inv=1 이면 반대)</div>';
          break;
        case 'RLY':
          rows = row('접점', inf.on ? 'COM–NO 붙음' : 'COM–NC 붙음') + row('코일 전압', F(inf.v, 'V')) + row('코일 전류', F(Math.abs(inf.i), 'A')) + row('동작 전류', F(+el.params.ion || 0.02, 'A')) + row('접점 전류', F(Math.abs(inf.isw), 'A'));
          break;
        case 'VREG': case 'DCDC':
          rows = row('동작', inf.mode) + row('입력', `${F(inf.vin, 'V')} · ${F(inf.iin, 'A')}`) + row('출력', `${F(inf.vout, 'V')} · ${F(inf.i, 'A')}`)
            + row('입력 전력', F(inf.pin, 'W')) + row('출력 전력', F(inf.pout, 'W')) + row(el.type === 'VREG' ? '발열 (손실)' : '손실', F(inf.ploss, 'W'))
            + row('효율', inf.pin > 1e-9 ? (inf.pout / inf.pin * 100).toFixed(1) + ' %' : '—')
            + (el.type === 'VREG' ? row('설정', `${F(+el.params.vout, 'V')} · 드롭아웃 ${F(+el.params.vdo, 'V')} · 한계 ${F(+el.params.ilim, 'A')}`) : row('설정', `${F(+el.params.vout, 'V')} · 효율 ${Math.round((+el.params.eff || 0) * 100)} % · UVLO ${F(+el.params.uvlo, 'V')}`));
          break;
        case 'ACDC':
          rows = row('상태', inf.on ? '동작 중' : '꺼짐 (입력 부족)') + row('입력 첨두 전압', F(inf.vpk, 'V')) + row('출력', `${F(inf.vout, 'V')} · ${F(inf.i, 'A')}`) + row('출력 전력', F(inf.pout, 'W')) + row('입력 전력', F(inf.pin, 'W'));
          break;
        case 'BUCK': case 'BOOST':
          rows = row('스위치', inf.on ? 'ON' : 'OFF') + row('듀티비', (inf.duty * 100).toFixed(1) + ' %') + row('첨두 전류 명령', F(inf.ipk, 'A'))
            + row('VIN', F(inf.vin, 'V')) + row('SW', F(inf.vsw, 'V')) + row('FB', `${F(inf.vfb, 'V')} (기준 ${F(+el.params.vref, 'V')})`) + row('스위칭 주파수', F(+el.params.fsw, 'Hz'));
          break;
        case 'TL431':
          rows = row('REF − A', F(inf.vref, 'V')) + row('K − A', F(inf.vka, 'V')) + row('흡수 전류', F(inf.i, 'A')) + '<div class="muted">REF 가 2.495 V 가 되도록 전류를 흘려 넣는다</div>';
          break;
        case 'G':
          rows = row('전압', '0 V');
          break;
        case 'V': case 'AC': case 'I':
          rows = row('전압', F(inf.v, 'V')) + row('공급 전류', F(inf.i, 'A')) + row('공급 전력', F(inf.p, 'W'));
          break;
        default:
          rows = row('양단 전압', F(inf.v, 'V')) + row('전류', F(Math.abs(inf.i), 'A')) + (['R', 'LAMP', 'D', 'LED', 'Z'].includes(el.type) ? row('전력', F(Math.abs(inf.p), 'W')) : '');
          if (el.type === 'R') rows += row('V ÷ I', Math.abs(inf.i) > 1e-15 ? F(inf.v / inf.i, 'Ω') : '—');
          if (el.type === 'C') rows += row('전하 Q = CV', F(inf.v * (+el.params.c), 'C'));
          if (el.type === 'S' || el.type === 'PB') rows += row('상태', +el.params.on ? '닫힘 (ON)' : '열림 (OFF)');
          if (el.type === 'FUSE') rows += row('정격 전류', F(+el.params.a, 'A')) + row('상태', el.st && el.st.blown ? '✖ 끊어짐 (↺ 로 교체)' : '정상');
      }
      return `<b>${title}</b>${rows}`;
    }

    partTip(el) {
      const sim = this.sim;
      const c = sim.comp(el);
      if (!c) return '';
      const d = sim.dig;
      const meta = CS.TYPES[el.type] || {};
      const V = (n) => { const net = sim.nets[n]; return net && net.analog ? `${CS.VCH[net.v]} <span class="muted">${CS.fmt(sim.netV(n), 'V')}</span>` : CS.VCH[d.netValue(n)]; };
      const row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
      let h = `<div><b>${esc(meta.name || el.type)}</b> <span class="muted">${esc(el.name || '')}</span></div>`;
      const pinRows = (pins, nets) => pins.map((pp, i) => row((pp.neg ? '¬' : '') + (pp.lbl || pp.n || '입력 ' + (i + 1)), V(nets[i]))).join('');
      const aRows = () => Object.keys(c.apins).map((k) => row(k, CS.fmt(sim.netV(c.apins[k]), 'V'))).join('');
      switch (el.type) {
        case 'SW': h += `<div class="big ${VCLS[d.netValue(c.outs[0])]}">${CS.VCH[d.netValue(c.outs[0])]}</div><div class="muted">눌러서 0 ↔ 1</div>`; break;
        case 'BTN': h += `<div class="big">${CS.VCH[d.netValue(c.outs[0])]}</div><div class="muted">누르고 있는 동안 ${on(el.params.inv) ? '0' : '1'}</div>`; break;
        case 'CLK': h += row('주파수', CS.siText(c.f) + 'Hz') + row('주기', CS.siText(1 / c.f) + 's') + row('현재', V(c.outs[0])) + `<div class="muted">${String(el.params.run) === '0' ? '수동 클럭 — 누를 때마다 0 ↔ 1' : c.running ? '누르면 일시 정지' : '멈춤 — 누르면 다시 동작'}</div>`; break;
        case 'DIP': h += row('값', `${c.s.val} (0b${c.s.val.toString(2).padStart(c.n, '0')}, 0x${c.s.val.toString(16).toUpperCase()})`) + '<div class="muted">스위치를 하나씩 눌러 비트를 바꿉니다 (위 = MSB)</div>'; break;
        case 'ADC': h += row('입력 전압', CS.fmt(c.s.vnow != null ? c.s.vnow : c.s.vin, 'V')) + row('출력 코드', `${c.s.code} (0b${(c.s.code || 0).toString(2).padStart(c.n, '0')})`) + row('분해능', CS.fmt(c.vref / Math.pow(2, c.n), 'V')) + (c.aconn('VIN') ? '' : '<div class="muted">VIN 이 비어 있어 vin 속성값을 씁니다</div>'); break;
        case 'DLED': h += `<div class="big ${VCLS[d.netValue(c.ins[0])]}">${CS.VCH[d.netValue(c.ins[0])]}</div><div class="muted">${d.netValue(c.ins[0]) === 1 ? '켜짐' : '꺼짐'}</div>`; break;
        case 'LEDS': case 'HEX': case 'DAC': {
          const v = d.compValue(c);
          h += row('값', v == null ? 'X' : `${v} (0b${v.toString(2).padStart(c.ins.length, '0')}, 0x${v.toString(16).toUpperCase()})`);
          if (el.type === 'DAC') h += row('출력 전압', CS.fmt(c.aoutV ? c.aoutV[0] : 0, 'V')) + row('OUT 단자 전압', CS.fmt(sim.netV(c.outs[0]), 'V'));
          break;
        }
        case 'SEG': h += pinRows(c.inPins, c.ins) + row('표시', String(d.compValue(c))); break;
        case 'CMPR': h += aRows() + row('출력', V(c.outs[0])) + (parseFloat(el.params.hys) ? row('히스테리시스', CS.fmt(CS.parseNum(el.params.hys), 'V')) : ''); break;
        case 'T555': h += row('내부 래치 Q', CS.VCH[c.s.q != null ? c.s.q : 0]) + aRows() + row('OUT', CS.fmt(sim.netV(c.outs[c.outPins.findIndex((q) => q.n === 'OUT')]), 'V'))
          + `<div class="muted">TRIG &lt; ⅓·VCC → 1 (충전) · THR &gt; ⅔·VCC → 0 (DIS 로 방전)</div>`; break;
        case 'SRL': case 'DL': case 'DFF': case 'JKFF': case 'TFF': case 'SRFF':
          h += pinRows(c.inPins, c.ins) + row('Q', V(c.outs[0])) + row('Q̅', V(c.outs[1]));
          if (c.s.bad) h += '<div style="color:#fca5a5">⚠ 금지 입력 (S = R = 1)</div>';
          break;
        case 'REG': case 'CNT': case 'SHR': {
          const v = d.compValue(c);
          h += row('저장 값', v == null ? 'X' : `${v} (0b${v.toString(2).padStart(c.n, '0')})`);
          if (el.type === 'CNT') h += row('계수 범위', `0 ~ ${c.mod - 1}`);
          h += pinRows(c.inPins, c.ins);
          break;
        }
        case 'ROM': case 'RAM': {
          const words = 1 << c.a;
          const cells = [];
          for (let i = 0; i < words; i++) cells.push(`${i.toString(16).toUpperCase()}:${(c.s.mem[i] || 0).toString(16).toUpperCase()}`);
          h += `<div class="mem">${cells.join(' ')}</div>` + pinRows(c.inPins, c.ins);
          break;
        }
        default:
          h += pinRows(c.inPins, c.ins) + c.outPins.map((pp, i) => row('→ ' + (pp.lbl || pp.n), V(c.outs[i]))).join('');
          if (D.GATE_TYPES.indexOf(el.type) >= 0) h += `<div class="muted">지연 ${CS.siText(c.delay, 2)}s</div>`;
      }
      return h;
    }

    showTip(h, keep) {
      if (!h || !this.sim) { this.tip.classList.add('hidden'); return; }
      const html = this.describe(h);
      if (!html) { this.tip.classList.add('hidden'); return; }
      this.tip.innerHTML = html;
      this.tip.classList.remove('hidden');
      if (!keep && this.lastMouse) {
        const r = this.el.getBoundingClientRect();
        let x = this.lastMouse.clientX - r.left + 14, y = this.lastMouse.clientY - r.top + 14;
        const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
        if (x + tw > r.width - 4) x = Math.max(4, this.lastMouse.clientX - r.left - tw - 12);
        if (y + th > r.height - 4) y = Math.max(4, this.lastMouse.clientY - r.top - th - 12);
        this.tip.style.left = x + 'px';
        this.tip.style.top = y + 'px';
      }
    }

    highlight(h) {
      const g = this.svg.querySelector('.l-over');
      if (!g) return;
      if (!h) { g.innerHTML = ''; return; }
      const sim = this.sim;
      if (h.kind === 'node') {
        const n = sim.netOfPoint(h.x, h.y);
        let s = '';
        sim.segs.forEach((sg) => {
          if (sim.ptNet[sg.a] !== n) return;
          const [ax, ay] = sim.pts[sg.a], [bx, by] = sim.pts[sg.b];
          s += `<line class="hl-node" x1="${ax * GRID}" y1="${ay * GRID}" x2="${bx * GRID}" y2="${by * GRID}"/>`;
        });
        sim.pts.forEach(([x, y], i) => { if (sim.ptNet[i] === n) s += `<circle class="hl-pt" cx="${x * GRID}" cy="${y * GRID}" r="5"/>`; });
        g.innerHTML = s;
      } else {
        const d = this.drawn.find((x) => x.el === h.el);
        if (!d) { g.innerHTML = ''; return; }
        if (isDig(h.el.type)) {
          const b = D.bodyOf(h.el);
          g.innerHTML = `<rect class="hl-el" x="${b.x0 * GRID - 6}" y="${b.y0 * GRID - 6}" width="${(b.x1 - b.x0) * GRID + 12}" height="${(b.y1 - b.y0) * GRID + 12}" rx="6"/>`;
          return;
        }
        const [cx, cy] = d.d.center;
        const r = h.el.type === 'OA' ? 46 : h.el.type === 'X' ? 50 : h.el.type === 'RLY' || PWR_BOX[h.el.type] ? 60 : CS.TYPES[h.el.type].kind === '2' ? Math.max(20, geom2(h.el).B / 2 + 10) : 30;
        g.innerHTML = `<circle class="hl-el" cx="${cx}" cy="${cy}" r="${r}"/>`;
      }
    }

    // ---------------------------------------------------------------- 고르기 (계측기 연결)
    startPick(kind, msg, cb) {
      this.pick = { kind, cb };
      this.el.classList.add('picking');
      this.pickMsg.textContent = msg || (kind === 'el' ? '측정할 소자를 누르세요 (Esc 취소)' : '측정할 점(도선)을 누르세요 (Esc 취소)');
      this.pickMsg.classList.remove('hidden');
      this.activate();
    }
    endPick() {
      this.pick = null;
      this.el.classList.remove('picking');
      this.pickMsg.classList.add('hidden');
    }

    // ---------------------------------------------------------------- 조작
    bind() {
      const svg = this.svg;
      svg.addEventListener('pointermove', (e) => {
        this.lastMouse = e;
        if (this.drag) return;
        const h = this.hitTest(e);
        this.hover = h;
        if (this.pick && h && ((this.pick.kind === 'el' && h.kind !== 'el') || (this.pick.kind === 'node' && h.kind !== 'node'))) this.highlight(h.kind === this.pick.kind ? h : null);
        else this.highlight(h);
        if (h && this.opts.tips !== false) this.showTip(h); else this.tip.classList.add('hidden');
        const clickable = h && h.kind === 'el' && CircuitView.isOperable(h.el);
        svg.style.cursor = this.pick ? 'crosshair' : clickable ? 'pointer' : '';
      });
      svg.addEventListener('pointerleave', () => { this.hover = null; this.tip.classList.add('hidden'); this.highlight(null); });
      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (this.opts.editable && this.onEditPointerDown && this.onEditPointerDown(e)) return;
        const h = this.hitTest(e);
        if (this.pick) {
          e.preventDefault();
          if (h && h.kind === this.pick.kind) { const cb = this.pick.cb; this.endPick(); cb(h); }
          else if (this.pick.kind === 'node' && h && h.kind === 'el' && (h.el.type === 'P' || h.el.type === 'N')) { const cb = this.pick.cb; this.endPick(); cb({ kind: 'node', x: h.el.x, y: h.el.y }); }
          return;
        }
        this.activate();
        if (h && h.kind === 'el' && this.operate(h.el, e)) e.preventDefault();
      });
      svg.addEventListener('contextmenu', (e) => {
        const fn = this.opts.onContext || (this.opts.editable ? null : CircuitView.onContext);
        if (fn && this.opts.tips !== false) {
          const h = this.hitTest(e);
          if (h && fn(e, h, this) !== false) e.preventDefault();
        }
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.pick) this.endPick(); });
    }

    /** 부품 조작 (누르기). 버튼은 떼면 풀린다. 처리했으면 true */
    operate(el, e) {
      const sim = this.sim;
      if (!sim) return false;
      if (el.type === 'PB' || el.type === 'BTN') {
        sim.press(el, true);
        this.partChanged(el, true);
        const up = () => { sim.press(el, false); this.partChanged(el, true); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return true;
      }
      if (el.type === 'DIP' && e) {
        const c = sim.comp(el);
        const p = this.toSvg(e);
        const [lx, ly] = invXf(el, p.x / GRID, p.y / GRID);
        const bit = Math.round(ly);
        void lx;
        if (c && bit >= 0 && bit < c.n) { sim.setDip(el, c.s.val ^ (1 << (c.n - 1 - bit))); this.partChanged(el, true); }
        return true;
      }
      if (['S', 'SPDT', 'SW', 'CLK'].includes(el.type)) { sim.toggle(el); this.partChanged(el, true); return true; }
      return false;
    }

    clickAt(ev) {
      const h = this.hitTest(ev);
      this.activate();
      if (h && h.kind === 'el') this.operate(h.el, ev);
    }

    /** 스위치 · 값 변경 → 시뮬레이션 상태 유지, 그림만 다시 */
    partChanged(el, light) {
      if (!this.sim) return;
      if (!light) this.sim.partChanged(el);
      if (['S', 'SPDT', 'PB', 'POT'].includes(el.type)) this.render(false);
      else this.updateVisuals(0);
      this.emit('change', el);
    }

    resetSim() {
      if (!this.sim) return;
      this.sim.reset();
      this.render(false);
      this.dotPos.clear();
      this.carry = 0;
      this.emit('reset');
      this.updateVisuals(0, true);
    }

    on(ev, f) { (this._ev || (this._ev = {}))[ev] = (this._ev[ev] || []).concat(f); return this; }
    off(ev, f) { if (this._ev && this._ev[ev]) this._ev[ev] = this._ev[ev].filter((x) => x !== f); }
    emit(ev, a) { if (this._ev && this._ev[ev]) this._ev[ev].forEach((f) => f(a, this)); }
  }

  /** 세계 좌표 → 부품 지역 좌표 (디지털 부품) */
  function invXf(el, x, y) {
    let a = x - el.x, b = y - el.y;
    const r = ((parseInt(el.params.rot, 10) || 0) % 4 + 4) % 4;
    for (let i = 0; i < r; i++) { const t = a; a = b; b = -t; }
    if (on(el.params.f)) b = -b;
    return [a, b];
  }
  function stateKey(sim, c) {
    switch (c.type) {
      case 'SW': return c.s.on ? 1 : 0;
      case 'BTN': return c.s.down ? 1 : 0;
      case 'CLK': return c.s.v + (c.running ? 'r' : 'p');
      case 'DIP': return c.s.val;
      case 'ADC': return String(c.s.vnow != null ? c.s.vnow.toFixed(3) : c.s.vin);
      case 'DAC': return String(c.aoutV && c.aoutV[0]);
      case 'T555': return c.s.q;
      case 'CMPR': return c.ov[0];
      default: return c.ins.map((n) => sim.dig.netValue(n)).join('');
    }
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx - px, ay + t * dy - py);
  }

  CircuitView.GRID = GRID;
  CircuitView.iec = false;
  CircuitView.active = () => activeView;
  CircuitView.all = () => [...views];
  CircuitView.valueLabel = valueLabel;
  CircuitView.drawEl = drawEl;
  CircuitView.geom2 = geom2;
  CircuitView.invXf = invXf;
  CircuitView.isOperable = (el) => ['S', 'PB', 'SPDT', 'SW', 'BTN', 'CLK', 'DIP'].includes(el.type);
  window.CircuitView = CircuitView;
})();
