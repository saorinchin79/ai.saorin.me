const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const pkg = require('./package.json');
const config = require('./src/config');
const otp = require('./src/otp');
const { attachIdentity } = require('./src/auth');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');
// Apache proxies to http://localhost:4090, so loopback-only is enough in
// production and keeps the origin (and its X-Forwarded-For headers) untrusted
// from the outside. Override with HOST=0.0.0.0 if that ever changes.
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
// Cloudflare → nginx → Apache → here: three hops in front of us.
app.set('trust proxy', 3);

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

/* ------------------------------------------------------------------- API */

app.use('/api', attachIdentity);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'ai-generator-template', uptime: process.uptime() });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/prompts', require('./src/routes/prompts'));
app.use('/api/admin', require('./src/routes/admin'));

/* --------------------------------------------------------------- statics */

/* Our assets have unversioned filenames, and Cloudflare's zone-level Browser
   Cache TTL overrides the origin's Cache-Control, so no-cache alone can leave
   visitors on a stale account.js or admin bundle for hours. Both HTML shells
   therefore carry ?v=<version> on their asset URLs: bumping the version in
   package.json busts every one of them at once, independent of CDN settings. */
const shells = new Map();
function sendShell(res, ...segments) {
  const file = path.join(PUBLIC_DIR, ...segments);
  if (!shells.has(file)) {
    shells.set(file, fs.readFileSync(file, 'utf8').split('__V__').join(pkg.version));
  }
  res.type('html').send(shells.get(file));
}

// Canonical paths, so nobody reaches the raw on-disk shells with __V__ unreplaced.
app.get('/index.html', (_req, res) => res.redirect(301, '/'));
app.get('/admin/index.html', (_req, res) => res.redirect(301, '/admin'));

/* The console is a static shell that asks /api/auth/me who you are and renders
   either the sign-in form or the dashboard. Nothing sensitive lives in the
   shell — every byte of data comes from /api/admin/*, which requires a
   superadmin session. */
app.get(['/admin', '/admin/'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  sendShell(res, 'admin', 'index.html');
});

app.use(
  express.static(PUBLIC_DIR, {
    // "/" must reach sendShell() below, not be answered with the raw on-disk
    // index.html (which still has __V__ in its asset URLs).
    index: false,
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      // The console ships unversioned filenames, so a long TTL would strand
      // admins on a stale build.
      if (filePath.includes(`${path.sep}admin${path.sep}`)) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (base === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}vendor${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })
);

// Single-page app: unknown *navigation* paths render the generator. Anything
// carrying a file extension is an asset request — those must 404 rather than
// silently resolve to the HTML shell and report a phantom 200.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || path.extname(req.path)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  sendShell(res, 'index.html');
});

app.use((req, res) => {
  res.status(404);
  res.setHeader('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/')) return res.json({ error: 'not found' });
  res.type('txt').send('404 Not Found');
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong' });
});

/* --------------------------------------------------------------- startup */

otp.prune();
setInterval(otp.prune, 6 * 60 * 60 * 1000).unref();

app.listen(config.port, HOST, () => {
  console.log(`\n  ✦  AI Generator Template`);
  console.log(`     http://${HOST}:${config.port}`);
  console.log(
    `     email OTP: ${config.smtp.enabled ? 'on' : 'off'} · telegram OTP: ${
      config.telegram.enabled ? 'on' : 'off'
    } · superadmins: ${config.superadmins.length || 'none configured'}\n`
  );
});
