// language: javascript | runtime: isolated-world content script | target: chess.com board DOM
// humanization: think time by phase, bezier mouse path, sub-square jitter, pointer dispatch.

(() => {
  const H = {};

  H.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // think time grows through opening, spikes mid-game, relaxes in endgame.
  // tc = {clockMs, incrementMs}; moveIdx is full-move pair index.
  H.thinkMs = (moveIdx, tc, complexity = 1) => {
    const clock = tc && tc.clockMs ? tc.clockMs : 600000;
    const reflex = 180 + Math.random() * 220;
    const openingDecay = Math.exp(-moveIdx / 6);
    const midWeight = Math.exp(-Math.pow((moveIdx - 18) / 12, 2));
    const deep = midWeight * (900 + Math.random() * 2600) * complexity;
    const casual = (1 - openingDecay) * (250 + Math.random() * 900);
    // under time pressure, think less
    const pressure = clock < 60000 ? 0.35 : clock < 180000 ? 0.65 : 1;
    return Math.round((reflex + deep + casual) * pressure);
  };

  H.reachMs = () => Math.round(60 + Math.random() * 140);

  H.holdMs = (dist) => Math.round(140 + dist * 1.6 + Math.random() * 90);

  const gaussOffset = (r) => {
    const u = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
    return u * 2 * r;
  };

  H.jitter = (p, squareSize) => ({
    x: p.x + gaussOffset(squareSize * 0.28),
    y: p.y + gaussOffset(squareSize * 0.28),
  });

  H.bezierPath = (a, b, squareSize) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    const c1Mag = dist * (0.15 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1);
    const c2Mag = dist * (0.15 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1);
    const c1 = { x: a.x + dx * 0.33 + nx * c1Mag, y: a.y + dy * 0.33 + ny * c1Mag };
    const c2 = { x: a.x + dx * 0.66 + nx * c2Mag, y: a.y + dy * 0.66 + ny * c2Mag };
    const steps = Math.max(14, Math.min(42, Math.round(dist / 18)));
    const pts = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, mt = 1 - t;
      const x = mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x;
      const y = mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y;
      pts.push({ x: x + (Math.random() - 0.5) * 1.2, y: y + (Math.random() - 0.5) * 1.2 });
    }
    return pts;
  };

  H.segmentDelays = (count, totalMs) => {
    const raw = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const w = 1 + 1.8 * t * t;
      raw.push(w); sum += w;
    }
    return raw.map((w) => (w / sum) * totalMs * (0.85 + Math.random() * 0.3));
  };

  function makePointer(type, x, y) {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: 'mouse',
      pointerId: 1,
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      view: window,
    });
  }

  function makeMouse(type, x, y) {
    return new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
      view: window,
    });
  }

  H.dispatch = (target, type, x, y) => {
    target.dispatchEvent(makePointer(type, x, y));
    const m = type === 'pointerdown' ? 'mousedown'
      : type === 'pointerup' ? 'mouseup'
      : type === 'pointermove' ? 'mousemove' : null;
    if (m) target.dispatchEvent(makeMouse(m, x, y));
  };

  H.drag = async (target, from, to, squareSize) => {
    const pts = H.bezierPath(from, to, squareSize);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const delays = H.segmentDelays(pts.length, H.holdMs(dist));
    for (let i = 0; i < pts.length; i++) {
      H.dispatch(target, 'pointermove', pts[i].x, pts[i].y);
      await H.sleep(delays[i]);
    }
  };

  H.glance = async (target, from, to, squareSize) => {
    if (Math.random() > 0.08) return;
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    const off = squareSize * (1 + Math.random());
    const side = Math.random() < 0.5 ? -1 : 1;
    const decoy = { x: mx + nx * off * side, y: my + ny * off * side };
    const pts = H.bezierPath(from, decoy, squareSize);
    const delays = H.segmentDelays(pts.length, 160 + Math.random() * 180);
    for (let i = 0; i < pts.length; i++) {
      H.dispatch(target, 'pointermove', pts[i].x, pts[i].y);
      await H.sleep(delays[i]);
    }
    await H.sleep(90 + Math.random() * 150);
  };

  window.__chessHelperHuman = H;
})();
