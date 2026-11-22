// language: javascript | runtime: isolated-world content script | target: chess.com board DOM
// FEN extraction + move detection by diffing board state. chess.js is the source of truth
// for castling / en passant once seeded from the DOM's current piece positions.

(() => {
  const Board = {};

  Board.findBoardEl = () => {
    return document.querySelector('wc-chess-board, chess-board, cg-board');
  };

  // chess.com orientation: coordinate labels on the board show '1' at bottom when white
  // is at the bottom. When flipped (black at bottom) they show '8' at bottom.
  Board.detectOrientation = (boardEl) => {
    // chess.com uses class "flipped" on wc-chess-board when black is at bottom
    if (!boardEl) return 'w';
    if (boardEl.classList.contains('flipped')) return 'b';
    // fallback: look at the lowest rank coordinate
    const coords = boardEl.querySelectorAll('.coordinate-light, .coordinate-dark, .coordinates text');
    for (const c of coords) {
      const txt = (c.textContent || '').trim();
      if (txt === '1' || txt === '8') return txt === '1' ? 'w' : 'b';
    }
    return 'w';
  };

  Board.squareFromClass = (cls) => {
    // "square-NN" where first digit = file (1..8, a..h), second = rank (1..8)
    const m = cls.match(/^square-(\d)(\d)$/);
    if (!m) return null;
    return { file: parseInt(m[1], 10) - 1, rank: parseInt(m[2], 10) - 1 };
  };

  Board.pieceFromClass = (cls) => {
    const m = cls.match(/^([bw])([prnbqk])$/);
    if (!m) return null;
    const letter = m[2].toUpperCase();
    return m[1] === 'w' ? letter : letter.toLowerCase();
  };

  // reads current piece grid from DOM. returns 8x8 (rank 0 = rank 1) or null.
  Board.readGrid = () => {
    const boardEl = Board.findBoardEl();
    if (!boardEl) return null;
    const grid = Array.from({ length: 8 }, () => Array(8).fill(''));
    const pieces = boardEl.querySelectorAll('.piece');
    if (!pieces.length) return null;
    for (const p of pieces) {
      let sq = null, pc = null;
      for (const c of p.classList) {
        if (!sq) sq = Board.squareFromClass(c);
        if (!pc) pc = Board.pieceFromClass(c);
      }
      if (sq && pc) grid[sq.rank][sq.file] = pc;
    }
    return grid;
  };

  Board.gridToFen = (grid, side) => {
    const ranks = [];
    for (let r = 7; r >= 0; r--) {
      let s = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = grid[r][f];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        s += p;
      }
      if (empty) s += empty;
      ranks.push(s);
    }
    return `${ranks.join('/')} ${side} - - 0 1`;
  };

  Board.squareToAlg = (file, rank) =>
    String.fromCharCode('a'.charCodeAt(0) + file) + String(rank + 1);

  // compare two grids and infer a move: from square, to square, promotion
  Board.diffGrids = (prev, curr) => {
    const removed = [], added = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const a = prev[r][f], b = curr[r][f];
        if (a === b) continue;
        if (a && !b) removed.push({ file: f, rank: r, piece: a });
        else if (!a && b) added.push({ file: f, rank: r, piece: b });
        else if (a && b && a !== b) {
          // capture: piece replaced on this square
          removed.push({ file: f, rank: r, piece: a });
          added.push({ file: f, rank: r, piece: b });
        }
      }
    }
    if (!removed.length || !added.length) return null;

    // castling: two pieces moved of the same color (king + rook)
    if (removed.length >= 2 && added.length >= 2) {
      const kingRemoved = removed.find((x) => x.piece.toLowerCase() === 'k');
      const kingAdded = added.find((x) => x.piece.toLowerCase() === 'k');
      if (kingRemoved && kingAdded) {
        return {
          from: Board.squareToAlg(kingRemoved.file, kingRemoved.rank),
          to: Board.squareToAlg(kingAdded.file, kingAdded.rank),
        };
      }
    }

    const r0 = removed[0], a0 = added[0];
    const from = Board.squareToAlg(r0.file, r0.rank);
    const to = Board.squareToAlg(a0.file, a0.rank);
    let promotion;
    if (r0.piece.toLowerCase() === 'p' && a0.piece.toLowerCase() !== 'p') {
      promotion = a0.piece.toLowerCase();
    }
    return promotion ? { from, to, promotion } : { from, to };
  };

  // coordinates for a given algebraic square, respecting board orientation
  Board.algCoords = (sq, boardEl, bottomSide) => {
    const rect = boardEl.getBoundingClientRect();
    const squareSize = rect.width / 8;
    const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(sq[1], 10) - 1;
    const visFile = bottomSide === 'w' ? file : 7 - file;
    const visRank = bottomSide === 'w' ? 7 - rank : rank;
    return {
      x: rect.left + (visFile + 0.5) * squareSize,
      y: rect.top + (visRank + 0.5) * squareSize,
      squareSize,
      boardEl,
    };
  };

  // detect whose clock is active (fallback to game.turn() if unavailable)
  Board.clockTimeMs = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const txt = (el.textContent || '').trim();
    // "10:00" / "1:23.4" / "0:05.1"
    const m = txt.match(/^(\d+):(\d+)(?:\.(\d))?/);
    if (!m) return null;
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const tenths = m[3] ? parseInt(m[3], 10) : 0;
    return (mins * 60 + secs) * 1000 + tenths * 100;
  };

  window.__chessHelperBoard = Board;
})();
