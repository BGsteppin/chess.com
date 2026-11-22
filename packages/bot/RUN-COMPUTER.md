# Running against chess.com's computer bots

This mode drives the "Play Computer" page — you're playing chess.com's
built-in bots, not human opponents.

## Prerequisites (Windows)

- **Git for Windows** (ships with Git Bash). Several scripts in this
  repo use Unix commands (`rm -rf`, `cp`, inline `VAR=value` env
  vars) — running them from Git Bash avoids per-command rewrites.
- **Node.js 18 or 20** (install from https://nodejs.org or use
  [nvm-windows](https://github.com/coreybutler/nvm-windows)).
- **Yarn 1** (`npm install -g yarn`).
- **Google Chrome** installed normally.

> **Recommendation:** open **Git Bash** (not cmd/PowerShell) for every
> `yarn` command below. The repo's upstream scripts assume a POSIX
> shell.

## One-time setup

From the repo root in Git Bash:

```bash
yarn
npx lerna run build
```

Then in `packages/bot/`:

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

- `OPPONENT_STRENGTH` — chess.com bot slider value (1-30+)
- `DURATION` — time control label from the Custom dropdown
  (e.g. `Unlimited`, `10 min`)
- `CHROME_PATH` — Windows Chrome path, usually one of:
  - `C:/Program Files/Google/Chrome/Application/chrome.exe`
  - `C:/Program Files (x86)/Google/Chrome/Application/chrome.exe`

  (use forward slashes or escape backslashes; dotenv reads literal
  strings)
- `USER_DATA_DIR` — a dedicated profile dir so your chess.com login
  persists across runs, e.g.
  `C:/Users/YourName/chess-bot-profile`

## Log in once

Point Chrome at `USER_DATA_DIR` and sign into chess.com manually before
the first bot run. The bot reuses that profile so it starts already
logged in.

From Git Bash:

```bash
"$CHROME_PATH" --user-data-dir="$USER_DATA_DIR"
# → go to chess.com, sign in, close Chrome
```

Or from PowerShell:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\Users\YourName\chess-bot-profile"
```

## Run

From `packages/bot/` in Git Bash:

```bash
yarn start:computer
```

This builds the frontend bundle, launches Chrome, navigates to
`chess.com/play/computer`, picks a bot at the configured strength, sets
the time control, and starts playing. A small overlay in the
bottom-left corner shows the bot's state.

## Running from cmd or PowerShell

The `run:computer` script sets `GAME_TYPE=computer` via `cross-env`, so
it works everywhere. But several upstream scripts (`build`,
`copy-api-worker`, `watch:frontend`, `cleanup`) still use `rm -rf` /
`cp`, which fail outside Git Bash / WSL. If you must stay in
cmd/PowerShell, either:

- install `rimraf` and `shx` globally and rewrite those scripts, or
- just run the problematic ones via `npx sh -c '<script>'` in
  Git Bash while developing from your preferred shell.

Git Bash is the lower-friction path.

## Caveats

- chess.com's DOM changes periodically; the selectors in
  `src/backend/context/computer/navigation.ts` may need updating if the
  "Play Computer" page is redesigned.
- This is for playing against bots. Do not point it at live rated
  games against humans.
- Requires a real display and a logged-in Chrome profile — won't run
  in a headless cloud container.
