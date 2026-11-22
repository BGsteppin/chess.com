// language: typescript | runtime: browser (injected via main-di-browserified.js) | target: chess.com board DOM
// humanization helpers: thinking latency, bezier mouse paths, sub-square jitter.
// everything deterministic within a move, randomized across moves.

export interface Point { x: number; y: number }

// log-normal-ish think time: short for recaptures/obvious, long for deeper moves.
// move index biases it so openings fire fast and midgame thinks longer.
export function thinkMs(moveIndex: number, squareSize: number): number {
    const base = 180 + Math.random() * 220;             // 180..400ms reflex floor
    const openingDecay = Math.exp(-moveIndex / 6);      // < move 6 is mostly book
    const midgameWeight = Math.exp(-Math.pow((moveIndex - 18) / 12, 2));
    const deepThink = midgameWeight * (900 + Math.random() * 2600); // up to ~3.5s spike mid
    const casualThink = (1 - openingDecay) * (250 + Math.random() * 900);
    // squareSize factors in the UI scale — bigger board, slightly longer visual scan
    const scanBias = (squareSize / 80) * (40 + Math.random() * 90);
    return Math.round(base + deepThink + casualThink + scanBias);
}

// pre-grab hesitation: short pause after deciding, before pointerdown (eye-to-hand).
export function reachMs(): number {
    return Math.round(60 + Math.random() * 140);
}

// hold time: how long the piece is dragged before release at destination.
export function holdMs(dist: number): number {
    // Fitts' law-ish: longer hop takes more time. 1.6ms per px + small random.
    return Math.round(140 + dist * 1.6 + Math.random() * 90);
}

export function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

// uniform within [-r, r] but biased toward center (cosine).
function subSquareOffset(squareSize: number): number {
    const r = squareSize * 0.28;
    const u = (Math.random() + Math.random() + Math.random()) / 3 - 0.5; // ~gaussian
    return u * 2 * r;
}

export function jitterPoint(p: Point, squareSize: number): Point {
    return {
        x: p.x + subSquareOffset(squareSize),
        y: p.y + subSquareOffset(squareSize),
    };
}

// cubic bezier with two control points pulled perpendicular to the path.
// returns an array of points spaced for pointermove dispatch.
export function bezierPath(a: Point, b: Point, squareSize: number): Point[] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;

    // perpendicular unit vector
    const nx = -dy / dist;
    const ny = dx / dist;

    // control-point magnitude ~ 20-55% of distance, random sign so arc flips naturally
    const c1Mag = dist * (0.15 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1);
    const c2Mag = dist * (0.15 + Math.random() * 0.25) * (Math.random() < 0.5 ? -1 : 1);

    // controls at 1/3 and 2/3 along the line, pushed sideways
    const c1 = {
        x: a.x + dx * 0.33 + nx * c1Mag,
        y: a.y + dy * 0.33 + ny * c1Mag,
    };
    const c2 = {
        x: a.x + dx * 0.66 + nx * c2Mag,
        y: a.y + dy * 0.66 + ny * c2Mag,
    };

    // step count scales with distance; floor at 14, cap at 42
    const steps = Math.max(14, Math.min(42, Math.round(dist / 18)));
    const pts: Point[] = [];

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        // standard cubic bezier
        const x = mt * mt * mt * a.x
            + 3 * mt * mt * t * c1.x
            + 3 * mt * t * t * c2.x
            + t * t * t * b.x;
        const y = mt * mt * mt * a.y
            + 3 * mt * mt * t * c1.y
            + 3 * mt * t * t * c2.y
            + t * t * t * b.y;

        // 1-2px tremor per step — real cursors don't walk perfect curves
        const tremor = 1.2;
        pts.push({
            x: x + (Math.random() - 0.5) * tremor,
            y: y + (Math.random() - 0.5) * tremor,
        });
    }

    return pts;
}

// ease-out timing: fast start, slow landing. returns ms per segment.
export function segmentDelays(count: number, totalMs: number): number[] {
    const raw: number[] = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
        const t = i / count;
        // weight: higher near the end (slower landing)
        const w = 1 + 1.8 * t * t;
        raw.push(w);
        sum += w;
    }
    return raw.map(w => (w / sum) * totalMs * (0.85 + Math.random() * 0.3));
}

function dispatch(target: EventTarget, type: string, x: number, y: number): void {
    const ev = new PointerEvent(type, {
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
    } as any);
    target.dispatchEvent(ev);

    // chess.com's handlers sometimes also listen to mouse* fallbacks
    const mouseType =
        type === 'pointerdown' ? 'mousedown' :
        type === 'pointerup' ? 'mouseup' :
        type === 'pointermove' ? 'mousemove' : null;
    if (mouseType) {
        target.dispatchEvent(new MouseEvent(mouseType, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: mouseType === 'mouseup' ? 0 : 1,
            view: window,
        } as any));
    }
}

// walks the cursor from a to b through the bezier, dispatching pointermove at each step.
// target is where move events are dispatched (the board root); pointerdown/up are handled by caller.
export async function dragPath(
    target: EventTarget,
    from: Point,
    to: Point,
    squareSize: number,
): Promise<void> {
    const pts = bezierPath(from, to, squareSize);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const delays = segmentDelays(pts.length, holdMs(dist));

    for (let i = 0; i < pts.length; i++) {
        dispatch(target, 'pointermove', pts[i].x, pts[i].y);
        await sleep(delays[i]);
    }
}

export function fireDown(target: EventTarget, p: Point): void {
    dispatch(target, 'pointerdown', p.x, p.y);
}

export function fireUp(target: EventTarget, p: Point): void {
    dispatch(target, 'pointerup', p.x, p.y);
}

// occasional misdirection: briefly hover a nearby square on the way, as if reconsidering.
// returns true if a glance happened.
export async function maybeGlance(
    target: EventTarget,
    from: Point,
    to: Point,
    squareSize: number,
): Promise<boolean> {
    if (Math.random() > 0.08) return false; // ~8% of moves
    // pick a decoy point near the midpoint, kicked perpendicular by 1-2 squares
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist, ny = dx / dist;
    const off = squareSize * (1 + Math.random());
    const side = Math.random() < 0.5 ? -1 : 1;
    const decoy: Point = { x: mx + nx * off * side, y: my + ny * off * side };

    const pts = bezierPath(from, decoy, squareSize);
    const delays = segmentDelays(pts.length, 160 + Math.random() * 180);
    for (let i = 0; i < pts.length; i++) {
        dispatch(target, 'pointermove', pts[i].x, pts[i].y);
        await sleep(delays[i]);
    }
    // small pause at the decoy, then path to real target handled by caller
    await sleep(90 + Math.random() * 150);
    return true;
}
