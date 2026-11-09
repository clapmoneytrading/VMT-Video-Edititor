const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const root = __dirname;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Only the built editor assets are public; server.js, package.json and node_modules are not served.
const htmlFile = path.join(root, 'editor', 'index.html');
app.get(['/', '/editor'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(htmlFile);
});

// Chunk filenames keep their original hashes even after local patches, so let the browser
// revalidate (ETag) instead of caching them as immutable.
app.use(
  '/_next/static',
  express.static(path.join(root, '_next', 'static'), {
    etag: true,
    maxAge: 0,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
    fallthrough: false,
  })
);
app.get('/logo.svg', (req, res) => {
  res.sendFile(path.join(root, 'logo.svg'));
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).type('text/plain').send(status === 500 ? 'Internal server error' : 'Not found');
});

const server = app.listen(port, host, () => {
  console.log(`Autoeditor local server listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
