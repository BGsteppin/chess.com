# Running against chess.com's computer bots

This mode drives the "Play Computer" page — you're playing chess.com's
built-in bots, not human opponents.

## One-time setup

From the repo root:

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
- `DURATION` — time control label from the Custom dropdown (e.g. `Unlimited`, `10 min`)
- `CHROME_PATH` — path to your Chrome binary (optional; puppeteer ships one)
- `USER_DATA_DIR` — a dedicated profile dir so your chess.com login persists

## Log in once

Point Chrome at `USER_DATA_DIR` and sign into chess.com manually before
the first bot run. The bot reuses that profile so it starts already
logged in.

```bash
"$CHROME_PATH" --user-data-dir="$USER_DATA_DIR"
# → go to chess.com, sign in, close Chrome
```

## Run

From `packages/bot/`:

```bash
yarn start:computer
```

This builds the frontend bundle, launches Chrome, navigates to
`chess.com/play/computer`, picks a bot at the configured strength, sets
the time control, and starts playing. The bottom-left overlay shows the
bot's state.

## Caveats

- Requires a desktop with a display server — won't run in a headless
  cloud container.
- chess.com's DOM changes periodically; the selectors in
  `src/backend/context/computer/navigation.ts` may need updating if the
  "Play Computer" page is redesigned.
- This is for playing against bots. Do not point it at live rated games
  against humans.
