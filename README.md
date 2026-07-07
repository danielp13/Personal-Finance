# Compass — Personal Finance

A installable, offline-first finance app: income & investing target, expenses &
subscriptions, net worth tracking, and a home loan calculator that supports a
fixed-then-Euribor-variable rate structure, plus a simple auto loan calculator.

All data stays on your phone (browser local storage) — nothing is sent to a
server. Use **Settings → Export** to save a JSON backup any time.

## Deploy to your iPhone (GitHub Pages), same flow as your Sign On app

1. Create a new GitHub repository (e.g. `compass-finance`).
2. Add all the files in this folder to the repo root (`index.html`, `style.css`,
   `app.js`, `manifest.json`, `service-worker.js`, `icons/`).
3. Push to GitHub.
4. In the repo, go to **Settings → Pages**, set the source to your default
   branch (root), and save.
5. GitHub will give you a URL like `https://yourusername.github.io/compass-finance/`.
   Open it in Safari on your iPhone.
6. Tap the Share icon → **Add to Home Screen**. It'll launch full-screen with
   its own icon, no browser chrome.

### Updating later
Whenever you push changes, bump `CACHE_VERSION` at the top of
`service-worker.js` (e.g. `compass-v2`) — this forces iOS Safari to pick up
the new files instead of serving the old cached ones, exactly like the
caching quirk you ran into with Sign On.

## Local testing before deploying
From this folder:
```
python3 -m http.server 8080
```
Then open `http://localhost:8080` in a browser. (The service worker won't
fully register over plain `http://` on non-localhost hosts — GitHub Pages
serves over `https://`, so that's not an issue once deployed.)

## Cloud backup (so a lost phone doesn't lose your data)

Open the Settings sheet (gear icon, top right) → **Cloud backup**. Paste in a
GitHub personal access token and tap **Back up now**. This creates a private
Gist under your GitHub account holding a copy of your data, and from then on
the app auto-backs-up a couple of seconds after every change.

To create a token: **github.com/settings/tokens** → *Generate new token
(classic)* → check only the **gist** scope → generate → paste it into the
app. Treat it like a password. (If you use a fine-grained token instead,
grant it "Gists: read and write" under Account permissions.)

To restore on a new/replacement phone: install the app, open Settings, paste
the **same token**, and tap **Restore from cloud**.

This is a personal backup, not real-time multi-device sync — if you edit on
two devices before either has synced, the last one to back up wins. For one
phone (with an old one as backup), it does exactly what you need.

The token and Gist ID are stored only in this app's local storage — they are
never included in the JSON export/import files.

- Loan balances (home & auto) are calculated automatically from the loan
  details you enter — no manual monthly balance entry needed. Net worth
  snapshots pull in the loan balance for that month automatically.
- The home loan supports a fixed-rate period followed by a variable
  Euribor + Spread period. The payment recalculates automatically at the
  reset date based on the remaining balance and remaining term — the same
  way your bank recasts it. Update the Euribor field whenever it changes.
