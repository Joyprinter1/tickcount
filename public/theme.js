/* Site colour theme. The admin page saves it; every page applies it on load. */
(function () {
  var KEY = 'td.theme';
  var SURF = {
    slate:    ['#0B1117', '#131B23', '#1A242E', '#26323E'],
    navy:     ['#0A1224', '#111B33', '#18253F', '#243252'],
    charcoal: ['#121212', '#1B1B1D', '#242427', '#33343A'],
    forest:   ['#0A1410', '#101E18', '#17291F', '#233A2E'],
    plum:     ['#150F1F', '#1E1630', '#271D3E', '#372A52'],
    black:    ['#000000', '#0B0B0D', '#141418', '#25262C']
  };
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var amberIsAccent = false;
  try { var cs = document.currentScript; amberIsAccent = !!(cs && cs.hasAttribute('data-amber')); } catch (e) {}

  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function hex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase(); }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function mix(h, t, k) { var a = rgb(h), b = rgb(t); return hex([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]); }
  function on(h) { return lum(h) > 0.4 ? '#1A1303' : '#FFFFFF'; }
  function valid(t) { return t && HEX.test(t.accent || '') && HEX.test(t.accent2 || '') && SURF[t.surface]; }

  function css(t) {
    var A = t.accent, B = t.accent2, S = SURF[t.surface];
    var ink = lum(A) > 0.35 ? mix(A, '#000000', 0.45) : A;            // readable accent text on light pages
    var o = ':root:root{--accent:' + A + ';--on-accent:' + on(A) + ';--accent-ink:' + ink + ';--blue:' + B + ';--blk:' + mix(B, '#000000', 0.3) +
      ';--brand-red-coral:' + A + ';--brand-secondary:' + B + ';' + (amberIsAccent ? '--amber:' + A + ';' : '') + '}';
    var dark = '--bg:' + S[0] + ';--surface:' + S[1] + ';--raise:' + S[2] + ';--line:' + S[3] + ';--panel:' + S[1] + ';--panel2:' + S[2];
    o += '@media (prefers-color-scheme:dark){:root:root:not([data-theme="light"]){' + dark + '}}:root:root[data-theme="dark"]{' + dark + '}';
    if (amberIsAccent) o += ':root:root{' + dark + '}';
    o += '.theme--dark.theme--dark{--general-main-1:' + S[0] + ';--general-main-2:' + S[1] + ';--general-section-1:' + S[1] + ';--general-section-2:' + S[0] + ';--border-normal:' + S[3] + ';--brand-red-coral:' + A + ';--brand-secondary:' + B + '}';
    o += '.theme--light.theme--light{--brand-red-coral:' + A + ';--brand-secondary:' + B + '}';
    return o;
  }

  function apply(t) {
    var el = document.getElementById('td-theme');
    if (!valid(t)) { if (el) el.textContent = ''; return; }
    if (!el) { el = document.createElement('style'); el.id = 'td-theme'; (document.head || document.documentElement).appendChild(el); }
    el.textContent = css(t);
  }

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  apply(saved);
  window.tdTheme = { apply: apply, surfaces: SURF, valid: valid };

  try {
    fetch('/api/settings', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return;
      var t = j.theme && valid(j.theme) ? j.theme : null;
      try { if (t) localStorage.setItem(KEY, JSON.stringify(t)); else localStorage.removeItem(KEY); } catch (e) {}
      apply(t);
    }).catch(function () {});
  } catch (e) {}
})();
