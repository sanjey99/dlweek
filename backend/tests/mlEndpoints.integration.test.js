import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import net from 'node:net';

async function getFreePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForHealthy(baseUrl, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`backend did not become healthy at ${baseUrl}`);
}

async function readJson(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

test('upstream non-200 is explicit in /api/infer and clear fallback reason in /api/ensemble', async (t) => {
  const mlPort = await getFreePort();
  const backendPort = await getFreePort();
  const mlUrl = `http://127.0.0.1:${mlPort}`;
  const backendUrl = `http://127.0.0.1:${backendPort}`;

  const mlServer = createServer((req, res) => {
    if (req.url === '/infer') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'model unavailable' }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  mlServer.listen(mlPort, '127.0.0.1');
  await once(mlServer, 'listening');
  t.after(async () => {
    mlServer.close();
    await once(mlServer, 'close');
  });

  const backend = spawn('node', ['src/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(backendPort),
      ML_URL: mlUrl,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  t.after(async () => {
    backend.kill('SIGTERM');
    await once(backend, 'exit');
  });

  await waitForHealthy(backendUrl);

  const input = {
    features: [0.1, 0.4, 0.2, 0.3, 0.8, 0.2, 0.5, 0.9],
  };

  const inferRes = await fetch(`${backendUrl}/api/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(inferRes.status, 503);
  const inferBody = await readJson(inferRes);
  assert.equal(inferBody.ok, false);
  assert.equal(inferBody.error, 'model unavailable');

  const ensembleRes = await fetch(`${backendUrl}/api/ensemble`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(ensembleRes.status, 200);
  const ensembleBody = await readJson(ensembleRes);
  assert.equal(ensembleBody.ok, true);
  assert.equal(ensembleBody.ml_contract.used_fallback, true);
  assert.equal(ensembleBody.ml_contract.validation_error, 'ML_UPSTREAM_NON_200:503');
  assert.equal(ensembleBody.ml_contract.fallback_reason, 'ML_UPSTREAM_NON_200:503');
  assert.equal(ensembleBody.ml_contract.upstream_status, 503);
  assert.equal(ensembleBody.ml_contract.upstream_error, 'model unavailable');
  assert.equal(ensembleBody.anomaly.fallback_reason, 'ML_UPSTREAM_NON_200:503');
});
