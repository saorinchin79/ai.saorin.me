const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3600;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');

/* In production nginx serves everything with a file extension straight off disk
   (see README → Deployment), so Express mostly handles "/" and the health check.
   The cache headers below still matter for local runs and for the nginx @fallback. */
app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      // index.html is the entry point and must never be cached — the dc runtime
      // re-fetches it at boot to recover the un-normalised template source.
      if (path.basename(filePath) === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes(`${path.sep}vendor${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'ai-generator-template', uptime: process.uptime() });
});

// Single-page app: unknown *navigation* paths render the generator. Anything
// carrying a file extension is an asset request — those must 404 rather than
// silently resolve to the HTML shell and report a phantom 200.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || path.extname(req.path)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((req, res) => {
  res.status(404);
  res.setHeader('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/')) return res.json({ error: 'not found' });
  res.type('txt').send('404 Not Found');
});

app.listen(PORT, () => {
  console.log(`\n  ✦  AI Generator Template`);
  console.log(`     running at  http://localhost:${PORT}\n`);
});
