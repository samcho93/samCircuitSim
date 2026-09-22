/* samCircuitSim 페이지 (index.html) */
(function () {
  'use strict';
  const { esc, store } = window.JU;
  const CS = window.CircuitSim;
  const { EXAMPLES, GROUPS } = window.SIM_EXAMPLES;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ 시작
  function applyTheme(t) { document.documentElement.dataset.theme = t; store.set('jc.theme', t); }
  applyTheme(store.get('jc.theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  CircuitView.iec = store.get('jc.iec', '0') === '1';
  const outW = store.get('jc.simOutW', '');
  if (outW) document.documentElement.style.setProperty('--out-w', outW);
  if (store.get('jc.inst', '1') === '0') $('app').classList.add('no-inst');

  let name = EXAMPLES[0].title;
  let text = EXAMPLES[0].text;
  const h = parseHash();
  if (h.c) { const t = JU.decodeCircuit(h.c); if (t != null) { text = t; name = h.t || '공유된 회로'; } }
  else if (h.ex != null && EXAMPLES[+h.ex]) { text = EXAMPLES[+h.ex].text; name = EXAMPLES[+h.ex].title; }
  else {
    const auto = store.get('jc.autosave', '');
    if (auto) { try { const a = JSON.parse(auto); if (a.text != null) { text = a.text; name = a.name || name; } } catch (e) { /* 무시 */ } }
  }

  const view = new CircuitView($('canvas'), { text, label: name, editable: true, keepView: true });
  const panel = new Instruments.InstrumentPanel($('consolePanel'), { toast, store });
  CircuitView.onActiveChange = (v) => panel.attach(v);
  const ed = new CircuitEditor.Editor(view, {
    propsEl: $('props'),
    toast,
    onChange: (t) => { store.set('jc.autosave', JSON.stringify({ name, text: t })); updateInfo(); },
    onTool: (tool) => {
      document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
      document.querySelectorAll('.pal-item').forEach((b) => b.classList.toggle('active', b.dataset.key === tool));
      const x = CircuitEditor.PAL[tool];
      $('stTool').textContent = tool === 'select' ? '↖ 선택: 부품을 눌러 선택 · 끌어서 이동 · 끝점을 끌어 늘이기 · 빈 곳을 끌면 여러 개 선택 · 스위치는 눌러서 조작'
        : tool === 'W' ? '╱ 도선: 시작점에서 끝점까지 끌기 (꺾이면 ㄱ자로) · Esc 로 끝'
          : tool === 'pan' ? '✋ 화면 이동: 끌어서 이동 · 휠로 확대/축소'
            : `➕ ${x ? x.name : ''}: ${x && CS.TYPES[x.type].kind === '2' ? '끌어서 길이와 방향 정하기 (그냥 누르면 4칸)' : '누른 자리에 놓기'} · R 로 방향 바꾸기 · Esc 로 끝`;
    },
    onCursor: (g) => { $('stCursor').textContent = `(${g.x}, ${g.y})`; },
    onContext: (e, hh, v) => panel.contextMenu(e, hh, v),
    focusProps: () => { const i = $('props').querySelector('input[type=text]'); if (i) { i.focus(); i.select(); } }
  });
  view.activate();
  window.samSim = { view, editor: ed, panel, load: (t, n) => loadCircuit(t, n || '회로'), examples: EXAMPLES };
  setName(name);
  requestAnimationFrame(() => ed.fit());
  ed.showProps();
  ed.setTool('select');
  updateInfo();

  // ------------------------------------------------------------------ 부품 목록
  function renderPalette() {
    const q = $('palSearch').value.trim().toLowerCase();
    let html = '';
    CircuitEditor.PALETTE.forEach(([key, cat, items]) => {
      let list = items;
      if (q) list = items.filter((x) => (x.key + ' ' + x.type + ' ' + x.name + ' ' + (CS.TYPES[x.type].name || '') + ' ' + (CS.TYPES[x.type].desc || '') + ' ' + cat).toLowerCase().indexOf(q) >= 0);
      if (!list.length) return;
      const folded = !q && store.get('jc.pal.fold.' + key, key === 'mem' || key === 'reg' || key === 'comb' ? '1' : '0') === '1';
      html += `<section class="pal-sec${folded ? ' folded' : ''}" data-sec="${key}"><div class="pal-cat"><span class="caret">▾</span>${esc(cat)}<span class="n">${list.length}</span></div><div class="pal-grid">${list.map((x) =>
        `<button class="pal-item${ed.tool === x.key ? ' active' : ''}" data-key="${x.key}" title="${esc(x.name)} (${x.type})${CS.TYPES[x.type].desc ? ' — ' + esc(CS.TYPES[x.type].desc) : ''}${x.hot ? ' · 단축키 ' + x.hot : ''}">${CircuitEditor.iconSvg(x)}<span>${esc(x.name)}</span></button>`).join('')}</div></section>`;
    });
    $('palette').innerHTML = html || '<div class="pal-empty">찾는 부품이 없습니다.</div>';
  }
  renderPalette();
  $('palSearch').addEventListener('input', renderPalette);
  $('palSearch').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const b = $('palette').querySelector('.pal-item'); if (b) { ed.setTool(b.dataset.key); $('palSearch').blur(); } }
    if (e.key === 'Escape') { $('palSearch').value = ''; renderPalette(); $('palSearch').blur(); }
  });
  $('palette').addEventListener('click', (e) => {
    const b = e.target.closest('.pal-item');
    if (b) { ed.setTool(ed.tool === b.dataset.key ? 'select' : b.dataset.key); return; }
    const c = e.target.closest('.pal-cat');
    if (c) {
      const sec = c.parentElement;
      sec.classList.toggle('folded');
      store.set('jc.pal.fold.' + sec.dataset.sec, sec.classList.contains('folded') ? '1' : '0');
    }
  });
  document.querySelectorAll('.tool').forEach((b) => b.onclick = () => ed.setTool(b.dataset.tool));

  // ------------------------------------------------------------------ 명령
  document.querySelector('.sim-top').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    ({
      new: () => { if (view.circ.elements.length && !confirm('지금 회로를 지우고 새로 시작할까요?')) return; ed.loadText(''); setName('새 회로'); ed.snapshot(); panel.attach(null); panel.attach(view); },
      open: () => openDialog('ex'),
      save: saveDialog,
      text: textDialog,
      share,
      image: imageDialog,
      undo: () => ed.undo(),
      redo: () => ed.redo(),
      rot: () => ed.rotateSel(),
      flip: () => ed.flipSel(),
      del: () => ed.deleteSel(),
      zoomin: () => ed.zoom(1 / 1.25),
      zoomout: () => ed.zoom(1.25),
      fit: () => ed.fit(),
      settings: settingsDialog,
      help: helpDialog,
      inst: () => { const hide = !$('app').classList.contains('no-inst'); $('app').classList.toggle('no-inst', hide); store.set('jc.inst', hide ? '0' : '1'); }
    }[b.dataset.cmd] || (() => {}))();
  });
  $('themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('circName').onclick = () => { const n = prompt('회로 이름', name); if (n) setName(n); };
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveDialog(); }
    if (ctrl && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); openDialog('ex'); }
    if (e.key === 'Escape' && !$('modal').classList.contains('hidden')) closeModal();
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && $('modal').classList.contains('hidden')) { e.preventDefault(); $('palSearch').focus(); }
  });
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  window.addEventListener('hashchange', () => {
    const hh = parseHash();
    if (hh.c) { const t = JU.decodeCircuit(hh.c); if (t != null) loadCircuit(t, hh.t || '공유된 회로'); }
    else if (hh.ex != null && EXAMPLES[+hh.ex]) loadCircuit(EXAMPLES[+hh.ex].text, EXAMPLES[+hh.ex].title);
  });
  view.on('rebuild', updateInfo);

  // 오른쪽 창 너비 조절
  document.querySelectorAll('[data-resize]').forEach((g) => {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const w = Math.max(300, Math.min(window.innerWidth * 0.55, window.innerWidth - ev.clientX)) + 'px';
        document.documentElement.style.setProperty('--out-w', w); store.set('jc.simOutW', w);
      };
      const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
  });

  // 텍스트 파일 끌어다 놓기
  const cvs = $('canvas');
  cvs.addEventListener('dragover', (e) => { e.preventDefault(); if (!cvs.querySelector('.drop-hint')) cvs.insertAdjacentHTML('beforeend', '<div class="drop-hint">📄 회로 텍스트 파일을 놓으면 불러옵니다</div>'); });
  cvs.addEventListener('dragleave', () => { const d = cvs.querySelector('.drop-hint'); if (d) d.remove(); });
  cvs.addEventListener('drop', async (e) => {
    e.preventDefault();
    const d = cvs.querySelector('.drop-hint'); if (d) d.remove();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const t = await f.text();
    const c = CS.parse(t);
    if (c.errors.length && !c.elements.length) { toast('⚠ 회로 텍스트가 아닙니다'); return; }
    loadCircuit(t, f.name.replace(/\.[^.]+$/, ''));
  });

  // ------------------------------------------------------------------ 도우미
  function parseHash() {
    const o = {};
    location.hash.slice(1).split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    return o;
  }
  function setName(n) {
    name = n;
    $('circName').textContent = n;
    view.opts.label = n;
    panel.sync();
    document.title = `${n} · samCircuitSim`;
    store.set('jc.autosave', JSON.stringify({ name, text: ed.text() }));
  }
  function updateInfo() {
    const sim = view.sim;
    const els = view.circ.elements;
    const na = els.filter((e) => CS.isAnalog(e.type) && e.type !== 'G').length;
    const nd = els.filter((e) => CS.isDigital(e.type)).length;
    const msg = view.errors && view.errors.length ? `⚠ ${view.errors[0]}` : `아날로그 ${na} · 디지털 ${nd} · 도선 ${els.filter((e) => e.type === 'W').length}${sim ? ` · 넷 ${sim.nets.length} (아날로그 ${sim.nets.filter((n) => n.analog).length})` : ''}`;
    $('stInfo').textContent = msg + '  ';
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add('hidden'), 1900);
  }
  function openModal(title, html) { $('modalTitle').textContent = title; $('modalBody').innerHTML = html; $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); }
  function loadCircuit(t, n) {
    ed.loadText(t, true);
    ed.snapshot();
    setName(n);
    closeModal();
    panel.attach(null);
    panel.attach(view);
    history.replaceState(null, '', location.pathname);
  }
  function savedList() { try { return JSON.parse(store.get('jc.saved', '[]')); } catch (e) { return []; } }

  // ------------------------------------------------------------------ 열기
  function openDialog(tab) {
    tab = typeof tab === 'string' ? tab : 'ex';
    const tabs = [['ex', '✨ 예제'], ['saved', '💾 저장한 회로']];
    openModal('📂 회로 열기', `<div class="open-tabs">${tabs.map(([k, t]) => `<button class="btn small${k === tab ? ' active' : ''}" data-tab="${k}">${t}</button>`).join('')}</div><div class="open-list" id="openList"></div>`);
    document.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => openDialog(b.dataset.tab));
    const list = $('openList');
    if (tab === 'saved') {
      const s = savedList();
      list.innerHTML = s.length ? s.map((x, i) => `<div class="open-item" data-i="${i}"><span class="t">${esc(x.name)}</span><span class="m">${new Date(x.time).toLocaleString()}</span>
        <button class="btn small ghost" data-del="${i}" title="삭제">🗑</button></div>`).join('') : '<p class="muted">저장한 회로가 없습니다. 💾 저장 으로 이 브라우저에 저장할 수 있습니다.</p>';
      list.onclick = (e) => {
        const d = e.target.closest('[data-del]');
        if (d) { e.stopPropagation(); const arr = savedList(); if (!confirm(`'${arr[+d.dataset.del].name}' 을(를) 지울까요?`)) return; arr.splice(+d.dataset.del, 1); store.set('jc.saved', JSON.stringify(arr)); openDialog('saved'); return; }
        const it = e.target.closest('[data-i]');
        if (it) { const x = savedList()[+it.dataset.i]; loadCircuit(x.text, x.name); }
      };
    } else {
      let html = '';
      Object.keys(GROUPS).forEach((g) => {
        const items = EXAMPLES.map((x, i) => [x, i]).filter(([x]) => x.group === g);
        if (!items.length) return;
        html += `<div class="ex-group">${esc(GROUPS[g])}</div>` + items.map(([x, i]) => `<div class="open-item" data-i="${i}"><span class="t">${esc(x.title)}<span class="d">${esc(x.desc || '')}</span></span></div>`).join('');
      });
      list.innerHTML = html;
      list.onclick = (e) => { const it = e.target.closest('[data-i]'); if (it) { const x = EXAMPLES[+it.dataset.i]; loadCircuit(x.text, x.title); } };
    }
  }

  // ------------------------------------------------------------------ 저장
  function saveDialog() {
    const n = prompt('이 브라우저에 저장할 이름', name);
    if (!n) return;
    const arr = savedList();
    const i = arr.findIndex((x) => x.name === n);
    const item = { name: n, text: ed.text(), time: Date.now() };
    if (i >= 0) { if (!confirm(`'${n}' 을(를) 덮어쓸까요?`)) return; arr[i] = item; } else arr.unshift(item);
    store.set('jc.saved', JSON.stringify(arr.slice(0, 300)));
    setName(n);
    toast('저장했습니다');
  }

  // ------------------------------------------------------------------ 텍스트
  function download(fname, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  const fileBase = () => (name || 'circuit').replace(/[\\/:*?"<>|]/g, '_');
  function textDialog() {
    openModal('📝 회로 텍스트', `<p class="muted" style="margin-top:0">한 줄에 부품 하나: <code>R x1 y1 x2 y2 1k</code> (두 점 부품) · <code>AND x y n=3</code> (한 점 부품) · <code>W x1 y1 x2 y2</code> (도선).
      회로이론 · 디지털 강좌의 회로 텍스트도 그대로 붙여 넣을 수 있습니다.</p>
      <textarea class="circ-text" id="circText" spellcheck="false">${esc(ed.text())}</textarea>
      <div class="meta-row"><button class="btn primary" id="txApply">✔ 적용</button><button class="btn" id="txCopy">⧉ 복사</button>
        <button class="btn" id="txDown">⬇ 파일로 내보내기</button><label class="btn" style="cursor:pointer">⬆ 파일 가져오기<input type="file" id="txFile" accept=".txt,.cir,text/plain" hidden></label></div>
      <p id="txMsg" style="font-size:13px;color:var(--danger)"></p>`);
    const ta = $('circText');
    ta.onkeydown = (e) => { e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('txApply').click(); };
    $('txApply').onclick = () => {
      const c = CS.parse(ta.value);
      if (c.errors.length) { $('txMsg').textContent = c.errors.join(' / '); return; }
      loadCircuit(ta.value, name);
      toast('적용했습니다');
    };
    $('txCopy').onclick = async () => { try { await navigator.clipboard.writeText(ta.value); toast('복사했습니다'); } catch (e) { ta.select(); } };
    $('txDown').onclick = () => download(fileBase() + '.txt', new Blob([ta.value], { type: 'text/plain;charset=utf-8' }));
    $('txFile').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      ta.value = await f.text();
      name = f.name.replace(/\.[^.]+$/, '');
    };
  }

  async function share() {
    const url = location.origin + location.pathname + '#t=' + encodeURIComponent(name) + '&c=' + JU.encodeCircuit(ed.text());
    try { await navigator.clipboard.writeText(url); toast('공유 주소를 복사했습니다'); }
    catch (e) { prompt('이 주소를 복사하세요', url); }
  }

  // ------------------------------------------------------------------ 그림으로 내보내기
  function buildSvg() {
    const src = view.svg;
    const clone = src.cloneNode(true);
    ['.grid-bg', '.l-edit', '.l-dots', '.l-marks', '.l-over'].forEach((s) => clone.querySelectorAll(s).forEach((n) => n.remove()));
    const a = [...src.querySelectorAll('*')], b = [...clone.querySelectorAll('*')];
    const keep = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-weight', 'font-family', 'paint-order', 'display', 'filter'];
    const map = new Map();
    a.forEach((n) => { if (n.closest('.grid-bg, .l-edit, .l-dots, .l-marks, .l-over')) return; map.set(n, true); });
    let j = 0;
    a.forEach((n) => {
      if (!map.has(n)) return;
      const c = b[j++];
      if (!c) return;
      const cs = getComputedStyle(n);
      c.setAttribute('style', keep.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(';'));
      c.removeAttribute('class');
    });
    const bb = view.bounds();
    clone.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.w} ${bb.h}`);
    clone.setAttribute('width', Math.round(bb.w));
    clone.setAttribute('height', Math.round(bb.h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--sch-bg').trim() || '#fff';
    clone.insertAdjacentHTML('afterbegin', `<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" fill="${bg}"/>`);
    return { str: new XMLSerializer().serializeToString(clone), w: bb.w, h: bb.h };
  }
  function imageDialog() {
    openModal('🖼 그림으로 저장', `<p class="muted" style="margin-top:0">지금 보이는 전압 · 논리 색 그대로 회로도를 그림 파일로 저장합니다.</p>
      <div class="meta-row"><button class="btn primary" id="imSvg">⬇ SVG (벡터)</button><button class="btn" id="imPng">⬇ PNG (2배 해상도)</button></div>`);
    $('imSvg').onclick = () => { const s = buildSvg(); download(fileBase() + '.svg', new Blob([s.str], { type: 'image/svg+xml' })); closeModal(); };
    $('imPng').onclick = () => {
      const s = buildSvg();
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = Math.round(s.w * 2); c.height = Math.round(s.h * 2);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((blob) => download(fileBase() + '.png', blob));
        closeModal();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.str);
    };
  }

  // ------------------------------------------------------------------ 설정
  function settingsDialog() {
    const o = view.circ.opts || {};
    const sim = view.sim;
    openModal('⚙ 시뮬레이션 설정', `
      <div class="table-wrap"><table class="set-tbl"><tbody>
        <tr><th>시간 간격 dt</th><td><input type="text" id="stDt" value="${esc(o.dt || '')}" placeholder="자동 (${sim ? CS.fmt(sim.dt, 's') : ''})"></td><td class="muted">콘덴서 · 코일 · 교류가 있을 때 아날로그와 디지털이 함께 나아가는 간격. 작을수록 정확하지만 느립니다.</td></tr>
        <tr><th>속도 speed</th><td><input type="text" id="stSp" value="${esc(o.speed || '')}" placeholder="auto"></td><td class="muted">실제 1초에 진행할 시뮬레이션 시간 (1 = 실시간, 100n = 1초에 100 ns)</td></tr>
        <tr><th>초기 상태</th><td><select id="stIc"><option value="dcop"${o.ic !== 'zero' ? ' selected' : ''}>직류 정상 상태</option><option value="zero"${o.ic === 'zero' ? ' selected' : ''}>모두 0 (방전)</option></select></td><td class="muted">충전 과정을 보려면 “모두 0”</td></tr>
        <tr><th>적분 방법</th><td><select id="stMe"><option value="trap"${o.method !== 'be' ? ' selected' : ''}>사다리꼴 (정확)</option><option value="be"${o.method === 'be' ? ' selected' : ''}>후진 오일러 (안정)</option></select></td><td></td></tr>
        <tr><th>논리 전원 VDD</th><td><input type="text" id="stVdd" value="${esc(o.vdd || '')}" placeholder="5"></td><td class="muted">디지털 출력 1 의 전압, 입력 문턱값의 기준</td></tr>
        <tr><th>디지털 출력 저항</th><td><input type="text" id="stRout" value="${esc(o.rout || '')}" placeholder="25"></td><td class="muted">게이트 출력이 아날로그 회로를 구동할 때의 내부 저항 (Ω)</td></tr>
        <tr><th>입력 문턱값</th><td><input type="text" id="stVih" value="${esc(o.vih || '')}" placeholder="0.6" style="width:62px"> / <input type="text" id="stVil" value="${esc(o.vil || '')}" placeholder="0.4" style="width:62px"></td><td class="muted">아날로그 전압을 1 로 읽는 문턱(↑) / 0 으로 읽는 문턱(↓). 1 이하면 VDD 비율, 넘으면 볼트</td></tr>
        <tr><th>기호</th><td colspan="2"><label><input type="checkbox" id="stIec"${CircuitView.iec ? ' checked' : ''}> 사각형(IEC/KS) 저항 · 게이트 기호</label></td></tr>
      </tbody></table></div>
      <div class="meta-row"><button class="btn primary" id="stOk">적용</button></div>`);
    $('stOk').onclick = () => {
      const oo = Object.assign({}, view.circ.opts);
      const setv = (k, id, dflt) => { const v = $(id).value.trim(); if (v && v !== dflt) oo[k] = v; else delete oo[k]; };
      setv('dt', 'stDt'); setv('speed', 'stSp', 'auto'); setv('vdd', 'stVdd'); setv('rout', 'stRout'); setv('vih', 'stVih'); setv('vil', 'stVil');
      if ($('stIc').value === 'zero') oo.ic = 'zero'; else delete oo.ic;
      if ($('stMe').value === 'be') oo.method = 'be'; else delete oo.method;
      view.circ.opts = oo;
      const iec = $('stIec').checked;
      if (iec !== CircuitView.iec) { CircuitView.iec = iec; view.iec = iec; store.set('jc.iec', iec ? '1' : '0'); renderPalette(); }
      ed.commit(true);
      closeModal();
    };
  }

  function helpDialog() {
    openModal('❔ samCircuitSim 사용법', `<div class="help-grid">
      <div><h4>혼합 신호란?</h4><ul><li>저항 · 콘덴서 · 트랜지스터 같은 <b>아날로그 부품</b>과 게이트 · 플립플롭 · 카운터 같은 <b>디지털 부품</b>을 한 회로에 섞어 놓을 수 있습니다.</li>
        <li>디지털 출력이 아날로그 회로에 닿으면 <b>출력 저항(25 Ω) + 0 V / 5 V 전원</b>처럼 동작하고, 아날로그 전압이 디지털 입력에 닿으면 <b>문턱값(2 V ↓ / 3 V ↑)</b>으로 0 · 1 을 읽습니다.</li>
        <li>도선 색: 아날로그 넷은 <span style="color:#e63946">전압 색</span>, 디지털 넷은 <span style="color:#16a34a">논리 색</span> (X 빨강, Z 파랑 점선).</li></ul></div>
      <div><h4>부품 놓기</h4><ul><li>왼쪽 목록에서 부품을 고른 뒤 회로판을 누릅니다. 두 단자 부품(저항 등)은 <b>끌어서</b> 길이 · 방향을 정합니다.</li><li><kbd>/</kbd> 로 부품 찾기, <kbd>R</kbd> 회전 · <kbd>F</kbd> 뒤집기, <kbd>Esc</kbd> 그만 놓기.</li>
        <li>단축키: <kbd>W</kbd> 도선 · <kbd>R</kbd>… 는 선택 시 회전, 부품 선택 전에는 <kbd>G</kbd> 접지 · <kbd>P</kbd> 측정점 · <kbd>B</kbd> 전원 · <kbd>C</kbd> 콘덴서 · <kbd>L</kbd> 코일 · <kbd>D</kbd> 다이오드 · <kbd>T</kbd> NPN · <kbd>O</kbd> OP앰프 · <kbd>A</kbd> AND · <kbd>N</kbd> NOT · <kbd>K</kbd> 클럭</li></ul></div>
      <div><h4>배선 · 편집</h4><ul><li><b>╱ 도선</b>으로 단자에서 단자까지 끕니다. 단자가 도선 <b>중간</b>에 닿아도 연결됩니다. 멀리 있는 점은 같은 이름의 <b>이름표(N)</b>로 잇습니다.</li>
        <li>연결 안 된 단자는 <span style="color:#ef4444">빨간 동그라미</span>. 선택 후 화살표 키로 한 칸씩 이동, <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd>/<kbd>D</kbd>/<kbd>Z</kbd>/<kbd>Y</kbd>.</li></ul></div>
      <div><h4>측정 · 조작</h4><ul><li>마우스를 올리면 전압 · 논리값 · 전류 · 전력이 보입니다. 스위치 · 버튼 · DIP · 클럭은 눌러서 조작합니다.</li>
        <li>오른쪽 계측기: 멀티미터, 2채널 오실로스코프, 8채널 로직 분석기, 로직 프로브, 입출력판, 진리표. 점 · 부품에서 <b>오른쪽 버튼을 짧게</b> 누르면 바로 연결 메뉴.</li></ul></div>
      <div><h4>시간 진행</h4><ul><li>콘덴서 · 코일 · 교류 전원이 있으면 아날로그와 디지털이 같은 시간 간격(dt)으로 함께 나아갑니다.</li><li>없으면 디지털 사건(게이트 지연 ns 단위)이 생길 때마다 아날로그를 다시 풉니다. ⚙ 설정에서 dt · 속도 · VDD · 문턱값을 바꿀 수 있습니다.</li></ul></div>
      <div><h4>저장 · 공유</h4><ul><li>💾 이 브라우저에 저장, 🔗 회로가 담긴 주소 복사, 📝 텍스트 파일 내보내기 · 가져오기(끌어다 놓기도 됨), 🖼 SVG · PNG 그림.</li><li>회로이론 · 디지털 강좌의 회로 텍스트를 📝 텍스트에 붙여 넣으면 그대로 열립니다.</li></ul></div>
    </div>`);
  }
})();
