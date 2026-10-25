// HTTP handler on node:http. No framework, no runtime dependencies.

import { createServer } from 'node:http';
import { containsSecretKey } from '../../../packages/shared/src/index.js';
import { ApiError } from './services/ledger.js';
import { routes } from './routes/v1/index.js';

const MAX_BODY = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'VALIDATION', 'Request body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {{ auth: object, ledger: object, allowedOrigins?: string[], log?: (line: object) => void }} deps
 */
export function createHandler({ auth, ledger, allowedOrigins = [], log = (l) => console.log(JSON.stringify(l)) }) {
  const table = routes({ auth, ledger });

  return async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://local');
    const origin = req.headers.origin;
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(origin && allowedOrigins.includes(origin)
        ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' }
        : {}),
    };
    const send = (status, body) => {
      res.writeHead(status, headers).end(body === undefined ? undefined : JSON.stringify(body));
      log({ t: new Date().toISOString(), method: req.method, path: url.pathname, status, ms: Date.now() - started });
    };

    try {
      if (req.method === 'OPTIONS') return send(204);
      const matches = table.filter(([, re]) => re.test(url.pathname));
      const route = matches.find(([m]) => m === req.method);
      if (!route) throw matches.length ? new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed') : new ApiError(404, 'NOT_FOUND', 'Not found');

      let body;
      if (req.method === 'POST' || req.method === 'PATCH') {
        const raw = await readBody(req);
        // Refuse anything shaped like a secret seed before it is parsed, stored or logged.
        if (containsSecretKey(raw)) throw new ApiError(400, 'SECRET_KEY_REJECTED', 'Never send a Stellar secret key');
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          throw new ApiError(400, 'VALIDATION', 'Body must be JSON');
        }
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'VALIDATION', 'Body must be a JSON object');
      }
      const [status, out] = await route[2]({
        params: route[1].exec(url.pathname).slice(1),
        query: url.searchParams,
        headers: req.headers,
        body,
        principal: auth.principal(req.headers.authorization),
      });
      send(status, out);
    } catch (err) {
      if (err instanceof ApiError) return send(err.status, { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
      log({ t: new Date().toISOString(), level: 'error', path: url.pathname, error: String(err?.code ?? err?.message ?? err).slice(0, 200) });
      const upstream = err?.code === 'HORIZON_UNAVAILABLE' || err?.name === 'TimeoutError';
      send(upstream ? 502 : 500, { error: { code: upstream ? 'UPSTREAM_UNAVAILABLE' : 'INTERNAL', message: upstream ? 'Stellar or the database did not answer' : 'Unexpected error' } });
    }
  };
}

/** Long-running server (local development, containers). Serverless platforms use createHandler directly. */
export const createApp = (deps) => createServer(createHandler(deps));
