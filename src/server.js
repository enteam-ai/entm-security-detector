const http = require('node:http');

const PORT = 47321;
const HOST = '127.0.0.1';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'https://enteam-hiring.com',
  'https://app.enteam.ai',
];

function pickCorsOrigin(requestOrigin) {
  if (!requestOrigin) return '*';
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}

function sendJson(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': pickCorsOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  });
  res.end(JSON.stringify(body));
}

function createLocalServer({ getLastScan, getSessionToken }) {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': pickCorsOrigin(origin),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        app: 'enteam-interview-monitor',
        version: '1.0.0',
        sessionToken: getSessionToken() || null,
      }, origin);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      const scan = getLastScan();
      sendJson(res, 200, {
        ok: true,
        sessionToken: getSessionToken() || null,
        scan: scan || null,
      }, origin);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not_found' }, origin);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[local-server] port ${PORT} already in use — is another detector running?`);
    } else {
      console.error('[local-server] error:', err);
    }
  });

  return {
    start() {
      server.listen(PORT, HOST, () => {
        console.log(`[local-server] listening on http://${HOST}:${PORT}`);
      });
    },
    stop() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createLocalServer, PORT, HOST };
