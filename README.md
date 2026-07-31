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
- **History** of recently copied prompts, kept in `localStorage`
- No accounts, no backend state — everything lives in the browser

## Run locally

```bash
npm install
npm start
# → http://localhost:3600      (set PORT to change)
```

## How it's built

The UI is a **dc artifact**: a declarative HTML template plus a logic class, rendered by
the `dc` runtime in [public/support.js](public/support.js). There is no build step — the
browser parses `<x-dc>…</x-dc>` from [public/index.html](public/index.html), and the
`<script type="text/x-dc">` block at the bottom of that same file supplies state and the
values the template binds to.

```
server.js                          Express static server + /api/health
public/index.html                  <head> + the dc template + the logic class
public/support.js                  dc runtime (generated — do not hand-edit)
public/vendor/react*.min.js        React 18.3.1 UMD, self-hosted
public/og-image.webp               social preview image
public/robots.txt, sitemap.xml
```

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

# 1. app dir (Express + "/" requests)
cd /var/www/ai-saorin
git fetch origin && git reset --hard origin/main
npm ci --omit=dev

# 2. nginx document root (every request with a file extension)
sudo rsync -a --delete public/ /home/alsadmin/web/ai.saorin.me/public_html/
sudo chown -R alsadmin:www-data /home/alsadmin/web/ai.saorin.me/public_html/

# 3. restart
pm2 restart ai-saorin && pm2 save
```

nginx sets `expires max` on static files, so give changed assets new filenames or purge
the Cloudflare cache after deploying. `/` is never cached (`cf-cache-status: DYNAMIC`).

Health check: `curl https://ai.saorin.me/api/health`
