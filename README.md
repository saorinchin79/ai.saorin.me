# ✦ AI Generator Template

A form-driven prompt studio for AI **image** and **video** models, live at
**[ai.saorin.me](https://ai.saorin.me/)**.

Describe the subject, scene and background, then dial in **style, lighting, camera,
motion, mood, palette and quality**. The prompt assembles live in the right-hand pane,
tuned to whichever model you pick. Copy it and go. The whole UI switches between
**English** and **ភាសាខ្មែរ** — labels, option names and tips all translate.

- **Image / Video** tabs with separate model rosters and per-model phrasing notes
- Negative prompt + aspect ratio, appended in each model's native syntax
- **Tips** panel with prompt-writing guidance per language
- **History** of recently copied prompts — in `localStorage`, or in your account
- Passwordless sign-in by one-time code over email or Telegram

Anyone can generate prompts without an account. Signing in — by one-time code sent
over **email** or **Telegram** — is what makes the history durable, and it adopts the
prompts you already made in that browser. A **superadmin console** at `/admin` lists
every prompt from signed-in and signed-out visitors alike.

## Run locally

```bash
cp .env.example .env      # fill in SUPERADMIN_EMAILS at minimum
npm install
npm start
# → http://localhost:3600      (set PORT to change)
```

To exercise the sign-in flow without sending real mail:

```bash
SMTP_TRANSPORT=json SMTP_FROM=dev@local OTP_DEBUG=1 \
  SUPERADMIN_EMAILS=you@example.com npm start
```

`SMTP_TRANSPORT=json` swaps in nodemailer's non-sending transport, and `OTP_DEBUG=1`
returns the issued code as `devCode` in the `/api/auth/email/start` response so a script
can complete a login. `OTP_DEBUG` refuses to arm when `NODE_ENV=production`.

## Accounts and prompt capture

| | Signed out | Signed in |
|---|---|---|
| Generate + copy prompts | ✅ | ✅ |
| History | browser `localStorage` | server-side, follows you across devices |
| Grouped by | `aigen_uid` cookie | account |

Every copied prompt is POSTed to `/api/prompts` either way — that is what fills the
admin console. The page says so next to the account chip, in English and Khmer; set
`CAPTURE_ANONYMOUS=0` to record only signed-in users.

When someone signs in, the prompts already recorded against their browser's `aigen_uid`
are re-pointed at the new account, so nothing they made before registering is lost.

### Sign-in channels

Both are passwordless one-time codes; the first successful code creates the account.

- **Email** — Elastic Email over SMTP. The sender domain must be verified in Elastic:
  `no-reply@saorin.me` works, `no-reply@ai.saorin.me` is rejected (`553 Envelope FROM
  … not allowed`) because the subdomain isn't verified. Note the API key is *not* the
  SMTP password — SMTP needs its own credential.
- **Telegram** — [Gateway API](https://core.telegram.org/gateway/api). The Gateway
  generates and checks the code; we only carry `request_id` between send and verify.
  Numbers typed without a country code are upgraded using the caller's
  `cf-ipcountry` dial code (Cambodia by default).

**Telegram sends are billed** (~$0.01/code) against a balance shared with
beta.als.social, leng.social and earn.als.social, so every send passes three caps first
— per identifier/hour, per IP/hour, and a global daily ceiling (`TG_DAILY_MAX`). A
repeat request inside `OTP_RESEND_COOLDOWN` reuses the live code instead of paying for
another.

### Superadmin

`SUPERADMIN_EMAILS` is the source of truth: those addresses are seeded as superadmins on
boot and re-asserted at every login, so admin access survives a wiped database. The
console at `/admin` has three tabs — Overview (counts, top models, 14-day chart),
**User Prompt Modules** (every prompt, filterable by audience/mode/model/search, with
detail view, delete and CSV export), and Users (roles, block/unblock, per-user prompts).
Blocking revokes that user's live sessions immediately.

The `/admin` page itself is a public shell holding no data; `/api/admin/*` is what
requires the superadmin session.

## How it's built

The UI is a **dc artifact**: a declarative HTML template plus a logic class, rendered by
the `dc` runtime in [public/support.js](public/support.js). There is no build step — the
browser parses `<x-dc>…</x-dc>` from [public/index.html](public/index.html), and the
`<script type="text/x-dc">` block at the bottom of that same file supplies state and the
values the template binds to.

```
server.js                          Express wiring: API, statics, SPA fallback
src/config.js                      env loading + every tunable, with defaults
src/db.js                          SQLite schema, migrations, superadmin seeding
src/auth.js                        sessions, cookies, anon identity, middleware
src/otp.js                         code issue/verify + the three rate limits
src/mailer.js                      Elastic Email SMTP + the code email
src/telegram.js                    Telegram Gateway API client
src/routes/auth.js                 /api/auth/*
src/routes/prompts.js              /api/prompts/*
src/routes/admin.js                /api/admin/*
public/index.html                  <head> + the dc template + the logic class
public/support.js                  dc runtime (generated — do not hand-edit)
public/account.js                  sign-in widget + prompt capture bridge
public/admin/                      superadmin console (shell + css + js)
public/vendor/react*.min.js        React 18.3.1 UMD, self-hosted
data/app.db                        SQLite (gitignored, created on boot)
```

### API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/prompts` | none | record a copied prompt (anon or user) |
| `GET /api/prompts/mine` | user | server-side history |
| `DELETE /api/prompts/mine[/:id]` | user | clear history / one entry |
| `GET /api/auth/config` | none | which channels are on, caller's dial code |
| `GET /api/auth/me` | none | current user or null |
| `POST /api/auth/{email,telegram}/start` | none | send a code |
| `POST /api/auth/{email,telegram}/verify` | none | redeem it → session |
| `POST /api/auth/logout` | none | revoke the session |
| `GET /api/admin/stats` | superadmin | counts, top models, daily series |
| `GET /api/admin/prompts[.csv]` | superadmin | User Prompt Modules, filtered |
| `GET/DELETE /api/admin/prompts/:id` | superadmin | detail / remove |
| `GET /api/admin/users` | superadmin | user list with prompt counts |
| `PATCH/DELETE /api/admin/users/:id` | superadmin | role, block, delete |

### Editing the app

Everything you'd want to change lives in `public/index.html`:

| What | Where |
|------|-------|
| Dropdown choices (style, lighting, camera, motion, mood, palette, quality, AR) | `const OPTS` |
| Khmer translations of those choices | `const KM_OPT` |
| All UI strings, both languages | `const T` |
| Model list, per-model prompt assembly and notes | `const MODELS` |
| Tips panel copy | `const TIPS` |
| Layout, colours, spacing | the `<x-dc>` template markup |

`build()` is where a model's final prompt string is assembled — that's the function to
touch when a model changes its preferred syntax.

**Do not hand-edit `public/support.js`.** It is generated from the dc runtime source; the
header comment in the file says as much. Replace it wholesale when you re-export.

### Why React is vendored

`support.js` normally pulls React 18.3.1 and ReactDOM from unpkg at runtime. Its
`loadReactUmd()` returns early when `window.React` and `window.ReactDOM` already exist, so
`index.html` loads local copies from `public/vendor/` first and the page never reaches out
to unpkg. Both files were byte-verified against the SRI digests baked into `support.js`.

If you swap in a newer `support.js`, re-check the React version it expects and refresh
`public/vendor/` to match:

```bash
curl -sSL -o public/vendor/react.production.min.js \
  https://unpkg.com/react@18.3.1/umd/react.production.min.js
curl -sSL -o public/vendor/react-dom.production.min.js \
  https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js
# then confirm each digest matches REACT_SRI / REACT_DOM_SRI in support.js:
openssl dgst -sha384 -binary public/vendor/react.production.min.js | openssl base64 -A
```

Google Fonts (Space Grotesk, IBM Plex Mono, Noto Sans Khmer) are still loaded from the
CDN — Noto Sans Khmer is what makes the Khmer UI render correctly.

## Deployment

Production is `ai.saorin.me` on the EC2 HestiaCP box, behind Cloudflare.

```
Cloudflare (proxied)
  └─ nginx :443            static extensions → /home/alsadmin/web/ai.saorin.me/public_html
       └─ @fallback / "/"  → Apache :8443
            └─ ProxyPass   → http://localhost:4090
                 └─ pm2 "ai-saorin"  →  /var/www/ai-saorin/server.js   (PORT=4090)
```

The split matters: **anything with a file extension is served by nginx off disk**, not by
Express. So a deploy has to update *two* locations — the app directory and the nginx
document root — or you get a new `index.html` served against stale assets.

```bash
ssh ubuntu@news.saorin.me
cd /var/www/ai-saorin
git fetch origin && git reset --hard origin/main
npm ci --omit=dev              # better-sqlite3 builds/downloads a native binding here
pm2 restart ai-saorin && pm2 save
```

Secrets live in `/var/www/ai-saorin/.env` (untracked — see `.env.example`), and
`data/app.db` is the SQLite store. **Neither is touched by a deploy**, so accounts and
captured prompts survive `git reset --hard`. Back the database up before anything
destructive:

```bash
sqlite3 /var/www/ai-saorin/data/app.db ".backup '/var/www/_backups/app-$(date +%F).db'"
```

nginx sets `expires max` on static files, so give changed assets new filenames or purge
the Cloudflare cache after deploying. `/` is never cached (`cf-cache-status: DYNAMIC`).

Health check: `curl https://ai.saorin.me/api/health`
