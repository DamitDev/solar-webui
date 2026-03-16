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

console.log('[solar-webui] config', {
  port: PORT,
  controlUrl: CONTROL_URL,
  hasControlApiKey: CONTROL_API_KEY.length > 0,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
    target: CONTROL_URL,
    hasControlApiKey: Boolean(CONTROL_API_KEY),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    management_api_key: CONTROL_API_KEY,
  });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(compression());
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: '1h',
    }),
  );

  // Handle SPA routing - using regex to avoid path-to-regexp wildcard issues
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
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

  if (DEBUG_PROXY) {
    console.log('[proxy] upgrade request', {
      url: req.url,
      headers: {
        host: req.headers.host,
        origin: req.headers.origin,
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
