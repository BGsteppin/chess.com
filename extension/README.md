# Chess Helper (Browser Extension)

Local Stockfish analysis overlay for chess.com. No API key, no network, engine
runs inside the extension as a web worker.

## Install (Brave / Chrome)

1. Open `brave://extensions` (or `chrome://extensions`)
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the `extension/` directory in this repo
5. Pin the extension icon so you can open the popup quickly

Open https://www.chess.com and start a game. A dark panel appears in the top-right
of the page showing mode, best move, eval, and depth.

## Modes

Open the popup (click the extension icon):

- **off** — engine idle, no overlay arrow
- **manual** — engine analyses silently, a yellow arrow is drawn on your board
  showing the best move. You move the piece yourself.
- **auto** — engine computes, humanized mouse motion plays the move for you
  after a realistic thinking delay.

## Tuning

- **Depth** — Stockfish search depth. 12-15 is fast and already outplays most
  humans. Higher = stronger and slower per move.
- **Limit by ELO** — uses Stockfish's `UCI_LimitStrength`. Target ELO roughly
  caps how well it plays. 1800 is a plausible intermediate club level.
- **Skill Level** — 0-20 secondary dial. 20 = full strength, 0 = basically
  random. Interacts with ELO limit when both are on.

For looking "natural" in rated play: Limit by ELO on, target ELO near your
rating, auto mode. The humanizer handles mouse paths, thinking latency,
sub-square landing jitter, and occasional decoy glances on the way to the
target square.

## What it doesn't do

- No cloud engine, no API calls. Everything is local.
- No header rewriting. Stockfish runs single-threaded asm.js — simpler, no
  extra permissions.
- No interaction with chess.com's internal JS — pure DOM reads, closed
  shadow-DOM overlay, isolated-world content script.

## Troubleshooting

- **Panel shows "no board on page"** — chess.com's board DOM may have changed
  class names. Open DevTools on the chess.com tab, find the element with the
  pieces, report its tag + classes.
- **Engine shows "idle"** — the Stockfish worker didn't start. Open DevTools
  and look for CSP or worker-load errors.
- **Auto-mode doesn't move the piece** — chess.com occasionally gates moves
  on `event.isTrusted`. If the piece stays put on your board, switch to manual
  and play the move yourself.
