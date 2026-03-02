/**
 * ─── HTTP Helper — zero-dependency fetch wrapper for test suites ─────────────
 */

const BACKEND  = process.env.BACKEND_URL  || 'http://localhost:4000';
const ML_URL   = process.env.ML_URL       || 'http://localhost:8000';

async function request(baseUrl, path, opts = {}) {
  const url = `${baseUrl}${path}`;
  const method = opts.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const body = opts.body ? JSON.stringify(opts.body) : undefined;

  const start = performance.now();
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(15000) });
  const latency = Math.round(performance.now() - start);

  let data;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }

  return { status: res.status, data, latency, ok: res.ok };
}

export const api = {
  get:  (path, opts) => request(BACKEND, path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(BACKEND, path, { ...opts, method: 'POST', body }),
};

export const ml = {
  get:  (path, opts) => request(ML_URL, path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(ML_URL, path, { ...opts, method: 'POST', body }),
};

export { BACKEND, ML_URL };
