// language: javascript | runtime: isolated-world content script | target: chess.com page DOM
// shadow-DOM status panel + SVG arrow overlay on the board. nothing queryable
// from chess.com's own document because the shadow root is closed.

(() => {
  const Overlay = {};
  let host = null;
  let shadow = null;
  let panel = null;
  let arrow = null;
  let arrowHost = null;
  let arrowShadow = null;

  function el(tag, attrs = {}, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') n.style.cssText = v;
      else n.setAttribute(k, v);
    }
    if (text !== undefined) n.textContent = text;
    return n;
  }

  Overlay.mount = () => {
    if (host) return;
    host = document.createElement('div');
    host.style.cssText = 'all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647;';
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .panel {
        font: 12px/1.4 -apple-system, Segoe UI, Roboto, sans-serif;
        background: rgba(20,20,22,0.92);
        color: #e8e8ea;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 10px 12px;
        min-width: 180px;
        max-width: 240px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.4);
        user-select: none;
      }
      .row { display: flex; justify-content: space-between; margin: 2px 0; gap: 8px; }
      .k { color: #8a8a93; }
      .v { color: #e8e8ea; font-variant-numeric: tabular-nums; }
      .mode { font-weight: 600; color: #7dd3fc; }
      .best { color: #fbbf24; font-weight: 600; letter-spacing: 0.5px; }
      .eval-pos { color: #86efac; }
      .eval-neg { color: #fda4af; }
      .dim { color: #6b6b73; font-size: 11px; }
      .pill {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        font-size: 10px;
        margin-left: 4px;
      }
    `;
    shadow.appendChild(style);

    panel = el('div', { class: 'panel' });
    panel.appendChild(el('div', { class: 'row' })).innerHTML =
      '<span class="k">Mode</span><span class="v mode" data-f="mode">off</span>';
    panel.appendChild(el('div', { class: 'row' })).innerHTML =
      '<span class="k">Best</span><span class="v best" data-f="best">—</span>';
    panel.appendChild(el('div', { class: 'row' })).innerHTML =
      '<span class="k">Eval</span><span class="v" data-f="eval">—</span>';
    panel.appendChild(el('div', { class: 'row' })).innerHTML =
      '<span class="k">Depth</span><span class="v" data-f="depth">—</span>';
    panel.appendChild(el('div', { class: 'row dim' })).innerHTML =
      '<span data-f="status">idle</span>';

    shadow.appendChild(panel);
  };

  Overlay.setField = (name, text, cls) => {
    if (!shadow) return;
    const node = shadow.querySelector(`[data-f="${name}"]`);
    if (!node) return;
    node.textContent = text;
    if (cls !== undefined) {
      node.className = 'v ' + cls;
    }
  };

  Overlay.setMode = (m) => Overlay.setField('mode', m);
  Overlay.setBest = (txt) => Overlay.setField('best', txt || '—');
  Overlay.setEval = (cp, mate) => {
    if (mate !== undefined && mate !== null) {
      Overlay.setField('eval', `#${mate}`, mate >= 0 ? 'v eval-pos' : 'v eval-neg');
      return;
    }
    if (cp === undefined || cp === null) {
      Overlay.setField('eval', '—');
      return;
    }
    const p = (cp / 100).toFixed(2);
    const s = cp >= 0 ? `+${p}` : p;
    Overlay.setField('eval', s, cp >= 0 ? 'v eval-pos' : 'v eval-neg');
  };
  Overlay.setDepth = (d) => Overlay.setField('depth', d != null ? String(d) : '—');
  Overlay.setStatus = (s) => Overlay.setField('status', s || '');

  // --- arrow overlay on the actual board ---

  function ensureArrowHost() {
    if (arrowHost) return;
    arrowHost = document.createElement('div');
    arrowHost.style.cssText = 'all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483646; pointer-events: none;';
    document.documentElement.appendChild(arrowHost);
    arrowShadow = arrowHost.attachShadow({ mode: 'closed' });
  }

  Overlay.drawArrow = (fromCoords, toCoords, squareSize) => {
    Overlay.clearArrow();
    if (!fromCoords || !toCoords) return;
    ensureArrowHost();

    arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('width', window.innerWidth);
    arrow.setAttribute('height', window.innerHeight);
    arrow.style.cssText = `
      position: fixed; left: 0; top: 0;
      pointer-events: none;
    `;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', '__ch_arrowhead');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '3');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const tip = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    tip.setAttribute('points', '0,0 6,3 0,6');
    tip.setAttribute('fill', 'rgba(251,191,36,0.9)');
    marker.appendChild(tip);
    defs.appendChild(marker);
    arrow.appendChild(defs);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromCoords.x);
    line.setAttribute('y1', fromCoords.y);
    line.setAttribute('x2', toCoords.x);
    line.setAttribute('y2', toCoords.y);
    line.setAttribute('stroke', 'rgba(251,191,36,0.9)');
    line.setAttribute('stroke-width', Math.max(6, squareSize * 0.12));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', 'url(#__ch_arrowhead)');
    arrow.appendChild(line);

    arrowShadow.appendChild(arrow);
  };

  Overlay.clearArrow = () => {
    if (arrow) {
      arrow.remove();
      arrow = null;
    }
  };

  window.__chessHelperOverlay = Overlay;
})();
