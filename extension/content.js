// language: javascript | runtime: isolated-world content script | target: chess.com
// orchestrator: reads the board, drives the engine worker, renders overlay, auto-moves.

(() => {
  const H = window.__chessHelperHuman;
  const B = window.__chessHelperBoard;
  const O = window.__chessHelperOverlay;
  const Chess = window.Chess; // from vendor-chess.js

  const DEFAULTS = {
    mode: 'manual',       // off | manual | auto
    depth: 15,
    skill: 20,            // 0..20
    elo: 1800,            // 0 disables UCI_Elo
    useElo: true,
    blunderRate: 0.0,     // 0..1 chance to play 2nd-best or weaker when > 0
  };

  let state = { ...DEFAULTS };
  let sf = null;                  // stockfish worker
  let engineReady = false;
  let currentFen = null;
  let game = null;                // chess.js instance
  let bottomSide = 'w';
  let lastSeenGrid = null;
  let pendingBestmove = null;     // resolver for in-flight go
  let playingMoveForFen = null;
  let autoCooldownUntil = 0;

  // ---- engine ----

  function startEngine() {
    if (sf) return;
    sf = new Worker(chrome.runtime.getURL('vendor-stockfish.js'));
    sf.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || '';
      if (!line) return;

      if (line === 'uciok') {
        sf.postMessage('isready');
      } else if (line === 'readyok') {
        engineReady = true;
        O.setStatus('engine ready');
      } else if (line.startsWith('info ') && line.includes(' depth ')) {
        const dMatch = line.match(/ depth (\d+)/);
        const cpMatch = line.match(/ score cp (-?\d+)/);
        const mateMatch = line.match(/ score mate (-?\d+)/);
        if (dMatch) O.setDepth(parseInt(dMatch[1], 10));
        if (mateMatch) O.setEval(null, parseInt(mateMatch[1], 10));
        else if (cpMatch) O.setEval(parseInt(cpMatch[1], 10), null);
      } else if (line.startsWith('bestmove ')) {
        const uci = line.split(/\s+/)[1];
        if (pendingBestmove) {
          const r = pendingBestmove; pendingBestmove = null; r(uci);
        }
      }
    };
    sf.postMessage('uci');
  }

  function requestBestMove(fen) {
    return new Promise((resolve) => {
      if (!sf || !engineReady) { resolve(null); return; }
      // cancel any in-flight search
      if (pendingBestmove) {
        const prev = pendingBestmove; pendingBestmove = null; prev(null);
        sf.postMessage('stop');
      }
      pendingBestmove = resolve;
      sf.postMessage(`setoption name Skill Level value ${state.skill}`);
      if (state.useElo && state.elo > 0) {
        sf.postMessage('setoption name UCI_LimitStrength value true');
        sf.postMessage(`setoption name UCI_Elo value ${state.elo}`);
      } else {
        sf.postMessage('setoption name UCI_LimitStrength value false');
      }
      sf.postMessage(`position fen ${fen}`);
      sf.postMessage(`go depth ${state.depth}`);
    });
  }

  // ---- game tracking ----

  function initGameFromCurrentBoard() {
    const grid = B.readGrid();
    if (!grid) return false;
    const boardEl = B.findBoardEl();
    bottomSide = B.detectOrientation(boardEl);

    // determine whose turn: count pieces vs starting pos — crude but works for
    // the common case of joining a fresh game. refined by move tracking afterward.
    let side = 'w';
    const move = new Chess();
    const startGrid = Array.from({ length: 8 }, () => Array(8).fill(''));
    // compare to see if position is startpos
    const startFEN = move.fen();
    const domFEN = B.gridToFen(grid, 'w').split(' ')[0];
    const startPosOnly = startFEN.split(' ')[0];
    if (domFEN !== startPosOnly) {
      // can't tell turn perfectly; default to the color whose turn it is per move list
      side = inferSideToMoveFromPanel();
    }

    game = new Chess(B.gridToFen(grid, side));
    if (!game.fen().includes(' ')) game = new Chess();
    lastSeenGrid = grid;
    currentFen = game.fen();
    return true;
  }

  function inferSideToMoveFromPanel() {
    // chess.com shows the moving player's clock with a lit indicator; variable
    // selectors across pages, so fall back to 'w'
    const candidates = [
      '.clock-player-turn',
      '.clock-bottom.clock-player-turn',
      '[class*="clock"][class*="turn"]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        // if it's the bottom clock, then it's the bottomSide's turn
        if (el.className.includes('bottom')) return bottomSide;
        if (el.className.includes('top')) return bottomSide === 'w' ? 'b' : 'w';
      }
    }
    return 'w';
  }

  function isStartPos(grid) {
    const start = new Chess();
    return B.gridToFen(grid, 'w').split(' ')[0] === start.fen().split(' ')[0];
  }

  function pollBoard() {
    if (!game) {
      if (!initGameFromCurrentBoard()) return;
    }
    const grid = B.readGrid();
    if (!grid) return;
    if (gridEq(grid, lastSeenGrid)) return;

    // fresh game detection: position reverted to start
    if (isStartPos(grid) && !gridEq(lastSeenGrid, grid)) {
      const boardEl = B.findBoardEl();
      bottomSide = B.detectOrientation(boardEl);
      game = new Chess();
      lastSeenGrid = grid;
      currentFen = game.fen();
      O.setStatus('new game');
      onPositionChanged();
      return;
    }

    const diff = B.diffGrids(lastSeenGrid, grid);
    if (diff) {
      // try to apply as a move in chess.js
      const mv = game.move({ from: diff.from, to: diff.to, promotion: diff.promotion || 'q' });
      if (mv) {
        lastSeenGrid = grid;
        currentFen = game.fen();
        onPositionChanged();
      } else {
        // out-of-sync (premove shuffle, animation mid-frame). resync from grid.
        try {
          const side = game.turn();
          const resynced = new Chess(B.gridToFen(grid, side));
          if (resynced.fen()) {
            game = resynced;
            lastSeenGrid = grid;
            currentFen = game.fen();
            onPositionChanged();
          }
        } catch (_) {}
      }
    } else {
      lastSeenGrid = grid;
    }
  }

  function gridEq(a, b) {
    if (!a || !b) return false;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++)
        if (a[r][f] !== b[r][f]) return false;
    return true;
  }

  // ---- reaction loop ----

  async function onPositionChanged() {
    if (state.mode === 'off') {
      O.clearArrow();
      O.setBest('—');
      return;
    }
    const myTurn = game.turn() === bottomSide;
    O.setStatus(myTurn ? 'thinking' : 'waiting for opponent');

    if (!myTurn) {
      O.clearArrow();
      return;
    }

    if (game.game_over()) {
      O.setStatus('game over');
      O.clearArrow();
      return;
    }

    const fen = currentFen;
    if (playingMoveForFen === fen) return;

    const uci = await requestBestMove(fen);
    if (!uci || uci === '(none)') {
      O.setBest('—');
      return;
    }
    if (currentFen !== fen) return; // position already changed

    renderBestMove(uci);

    if (state.mode === 'auto' && Date.now() >= autoCooldownUntil) {
      playingMoveForFen = fen;
      await playMoveHumanized(uci);
      playingMoveForFen = null;
      autoCooldownUntil = Date.now() + 600; // debounce
    }
  }

  function renderBestMove(uci) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci.slice(4) : '';
    O.setBest(`${from}${to}${promo ? '=' + promo.toUpperCase() : ''}`);
    const boardEl = B.findBoardEl();
    if (!boardEl) return;
    const a = B.algCoords(from, boardEl, bottomSide);
    const b = B.algCoords(to, boardEl, bottomSide);
    O.drawArrow(a, b, a.squareSize);
  }

  async function playMoveHumanized(uci) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci.slice(4) : '';
    const boardEl = B.findBoardEl();
    if (!boardEl) return;

    const fromC = B.algCoords(from, boardEl, bottomSide);
    const toC = B.algCoords(to, boardEl, bottomSide);
    const squareSize = fromC.squareSize;

    const jFrom = H.jitter(fromC, squareSize);
    const jTo = H.jitter(toC, squareSize);

    const tc = { clockMs: B.clockTimeMs('.clock-bottom') || 600000 };
    const moveIdx = Math.floor(game.history().length / 2);
    const think = H.thinkMs(moveIdx, tc, 1);
    O.setStatus(`moving in ${Math.round(think)}ms`);
    await H.sleep(think);

    await H.sleep(H.reachMs());

    // pointerdown on the piece's parent; chess.com's draggable listens on it
    const pieceEl = document.elementFromPoint(jFrom.x, jFrom.y);
    const downTarget = (pieceEl && pieceEl.classList && pieceEl.classList.contains('piece'))
      ? pieceEl.parentElement : boardEl;
    H.dispatch(downTarget, 'pointerdown', jFrom.x, jFrom.y);

    await H.glance(boardEl, jFrom, jTo, squareSize);
    await H.drag(boardEl, jFrom, jTo, squareSize);
    await H.sleep(40 + Math.random() * 120);
    H.dispatch(boardEl, 'pointerup', jTo.x, jTo.y);

    if (promo) {
      await H.sleep(180 + Math.random() * 220);
      // chess.com shows a promotion selector; click the chosen piece
      const sel = `.promotion-window .${bottomSide}${promo}, .promotion-piece.${bottomSide}${promo}`;
      const tries = 20;
      for (let i = 0; i < tries; i++) {
        const node = document.querySelector(sel);
        if (node) {
          node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
          node.click();
          break;
        }
        await H.sleep(80);
      }
    }
    O.setStatus('moved');
  }

  // ---- settings + lifecycle ----

  function loadSettings() {
    return new Promise((r) => {
      chrome.storage.local.get(DEFAULTS, (res) => {
        state = { ...DEFAULTS, ...res };
        O.setMode(state.mode);
        r();
      });
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    for (const k of Object.keys(changes)) {
      state[k] = changes[k].newValue;
    }
    O.setMode(state.mode);
    if (state.mode === 'off') {
      O.clearArrow();
      O.setBest('—');
      O.setStatus('off');
    } else {
      // re-evaluate with new settings
      onPositionChanged();
    }
  });

  async function main() {
    O.mount();
    await loadSettings();
    startEngine();

    // wait for board to appear
    const waitBoard = async () => {
      for (let i = 0; i < 60; i++) {
        if (B.findBoardEl()) return true;
        await H.sleep(500);
      }
      return false;
    };
    const ok = await waitBoard();
    if (!ok) {
      O.setStatus('no board on page');
      return;
    }

    O.setStatus('watching board');
    // poll every 150ms; cheap, robust across chess.com's various renderers
    setInterval(pollBoard, 150);
  }

  main();
})();
