import express from 'express';
import compression from 'compression';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

dotenv.config();

const PORT = Number.parseInt(process.env.PORT || process.env.SOLAR_WEBUI_PORT || '8080', 10);
const CONTROL_URL = process.env.SOLAR_CONTROL_URL || 'http://localhost:8000';
const CONTROL_API_KEY = process.env.SOLAR_CONTROL_API_KEY || '';
const LOG_LEVEL = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
const DEBUG_PROXY = process.env.SOLAR_WEBUI_DEBUG === 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
const APP_VERSION = process.env.APP_VERSION || packageJson.version || '0.0.0-dev';

console.log('[solar-webui] config', {
  version: APP_VERSION,
  port: PORT,
  controlUrl: CONTROL_URL,
  hasControlApiKey: CONTROL_API_KEY.length > 0,
});

const DIST_DIR = path.resolve(__dirname, '../dist');

const app = express();
app.disable('x-powered-by');
app.set('etag', false); // Disable ETag generation for proxied requests

// Create HTTP/HTTPS agents with keep-alive for connection reuse
// This significantly reduces latency by reusing TCP connections
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000
});

const controlProxy = createProxyMiddleware({
  target: CONTROL_URL,
  changeOrigin: true,
  ws: true,
  // Use keep-alive agents for connection reuse
  agent: CONTROL_URL.startsWith('https') ? httpsAgent : httpAgent,
  logLevel: LOG_LEVEL,
  pathRewrite: (path) => path.replace(/^\/api\/control/, ''),
  preserveHeaderKeyCase: true,
  // Performance optimizations
  followRedirects: false,
  xfwd: true,
  proxyTimeout: 30000,
  timeout: 30000,
  headers: CONTROL_API_KEY
    ? {
        'X-API-Key': CONTROL_API_KEY,
        Authorization: `Bearer ${CONTROL_API_KEY}`,
      }
    : undefined,
  onProxyReq: (proxyReq, req, res) => {
    const startTime = Date.now();
    req._proxyStartTime = startTime;
    if (DEBUG_PROXY) {
      console.log('[proxy] incoming request', {
        method: req.method,
        url: req.originalUrl,
        hasApiKey: !!req.headers['x-api-key'],
      });
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    const duration = Date.now() - (req._proxyStartTime || 0);
    if (DEBUG_PROXY) {
      console.log('[proxy] response', {
        method: req.method,
        url: req.originalUrl,
        status: proxyRes.statusCode,
        duration: `${duration}ms`
      });
    }
  },
  onError: (err, req, res) => {
    const duration = Date.now() - (req._proxyStartTime || 0);
    console.error(`[proxy] error after ${duration}ms:`, {
      method: req.method,
      url: req.originalUrl,
      error: err.message
    });
  }
});

app.use('/api/control', controlProxy);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: APP_VERSION,
    target: CONTROL_URL,
    hasControlApiKey: Boolean(CONTROL_API_KEY),
  });
});

// Runtime config injection — the standard pattern for SPA + Docker.
// Vite bakes VITE_* env vars at build time, so they're empty in a Docker
// image built without them.  Instead the Express server injects a small
// <script> tag with runtime values into the served index.html.
const buildRuntimeHtml = () => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  const raw = fs.readFileSync(indexPath, 'utf-8');
  const cfg = {
    SOLAR_CONTROL_API_KEY: CONTROL_API_KEY || '',
  };
  const tag = `<script>window.__SOLAR_CONFIG__=${JSON.stringify(cfg)};</script>`;
  return raw.replace('</head>', `${tag}\n</head>`);
};

if (fs.existsSync(DIST_DIR)) {
  const runtimeHtml = buildRuntimeHtml();
  app.use(compression());
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: '1h',
    }),
  );

  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    if (runtimeHtml) {
      res.type('html').send(runtimeHtml);
    } else {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    }
  });
} else {
  app.use((_req, res) => {
    res.status(500).send('Build output missing. Run "npm run build" before starting the server.');
  });
}

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/api/control')) {
    socket.destroy();
    return;
  }

  // http-proxy-middleware's `headers` config only applies to regular HTTP
  // requests, NOT WebSocket upgrades.  Inject auth headers manually so
  // solar-control can authenticate the proxied upgrade.
  if (CONTROL_API_KEY) {
    req.headers['x-api-key'] = CONTROL_API_KEY;
    req.headers['authorization'] = `Bearer ${CONTROL_API_KEY}`;
  }

  if (DEBUG_PROXY) {
    console.log('[proxy] upgrade request', {
      url: req.url,
      headers: {
        host: req.headers.host,
        origin: req.headers.origin,
        hasApiKey: !!req.headers['x-api-key'],
      },
    });
  }
  
  if (typeof controlProxy.upgrade === 'function') {
    controlProxy.upgrade(req, socket, head);
  } else {
    console.warn('[proxy] controlProxy.upgrade is not a function');
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[solar-webui] listening on port ${PORT}`);
  console.log(`[solar-webui] proxying control requests to ${CONTROL_URL}`);
  if (!CONTROL_API_KEY) {
    console.warn('[solar-webui] SOLAR_CONTROL_API_KEY is not set. API requests may fail with 401.');
  }
});
