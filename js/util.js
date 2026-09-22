/* 공용 유틸: HTML 이스케이프, 저장소(강좌별 이름표), SVG 스타일 범위 한정, 회로 공유 링크 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 저장소 키는 강좌마다 따로 쓴다 (jc.theme → jc.circuit.theme) */
  const NS = 'jc.samsim.';
  const nsKey = (k) => (k.indexOf('jc.') === 0 ? NS + k.slice(3) : k);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(nsKey(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(nsKey(k), v); } catch (e) { /* 저장 불가 환경 */ } },
    remove(k) { try { localStorage.removeItem(nsKey(k)); } catch (e) { /* 무시 */ } }
  };

  /** 그림(SVG) 안의 <style> 규칙이 페이지 전체에 퍼지지 않도록 범위를 한정한다 */
  let scopeSeq = 0;
  function scoped(html) {
    html = String(html || '');
    if (!/<style/i.test(html)) return html;
    const cls = 'scope-' + (++scopeSeq);
    const out = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs, css) => {
      const rules = css.replace(/([^{}]+)\{([^{}]*)\}/g, (mm, sel, body) => {
        if (/^\s*@/.test(sel)) return mm;
        const s = sel.split(',').map((x) => x.trim()).filter(Boolean).map((x) => `.${cls} ${x}`).join(', ');
        return `${s}{${body}}`;
      });
      return `<style${attrs}>${rules}</style>`;
    });
    return `<div class="${cls}" style="display:contents">${out}</div>`;
  }

  /** 회로 텍스트 ↔ 주소 조각 (base64url) */
  function encodeCircuit(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeCircuit(s) {
    try {
      const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) { return null; }
  }
  function simulatorUrl(text, title) {
    return `index.html#${title ? 't=' + encodeURIComponent(title) + '&' : ''}c=${encodeCircuit(text)}`;
  }

  window.JU = { esc, store, scoped, encodeCircuit, decodeCircuit, simulatorUrl };
})();
