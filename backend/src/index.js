import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { getMarketSnapshot } from './adapters/marketData.js';
import { inferRegime, runEnsemble } from './engine/ensemble.js';
import { evaluatePolicyGate, validatePolicyGatePayload } from './engine/policyGate.js';
import { evaluate as fusionEvaluate } from './fusion/fusionEvaluator.js';
import { validateFusionPayload } from './fusion/schema.js';
import { legacyPolicyGateToFusion, fusionToLegacyPolicyGate } from './fusion/compatAdapter.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const ML_URL = process.env.ML_URL || 'http://localhost:8000';

const DEMO_CASES = [
  { name: 'normal_profile', features: [0.12, 0.08, -0.1, 0.03, 0.15, -0.06, 0.02, 0.01] },
  { name: 'suspicious_profile', features: [1.2, 0.95, -0.45, 0.3, 0.1, 1.1, 0.2, 0.5] },
  { name: 'portfolio_stress', features: [0.6, 0.7, -0.3, 0.5, -0.4, 0.9, -0.2, 0.1] },
];

function validPayload(body) {
  if (!body || !Array.isArray(body.features)) return 'features must be an array';
  if (body.features.length < 1 || body.features.length > 64) return 'features length must be 1..64';
  if (!body.features.every((x) => Number.isFinite(Number(x)))) return 'features must contain only numbers';
  return null;
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'backend' }));
app.get('/api/demo-cases', (_req, res) => res.json({ ok: true, cases: DEMO_CASES }));

app.get('/api/model-info', async (_req, res) => {
  try {
    const r = await fetch(`${ML_URL}/model/info`);
    const data = await r.json();
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get('/api/markets/snapshot', async (_req, res) => {
  const markets = await getMarketSnapshot();
  return res.json({ ok: true, markets });
});

app.get('/api/simulate', async (_req, res) => {
  try {
    const r = await fetch(`${ML_URL}/simulate`);
    const data = await r.json();
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/infer', async (req, res) => {
  try {
    const err = validPayload(req.body);
    if (err) return res.status(400).json({ ok: false, error: err });
    const payload = { features: req.body.features.map((x) => Number(x)) };
    const r = await fetch(`${ML_URL}/infer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, ...data });
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/ensemble', async (req, res) => {
  try {
    const err = validPayload(req.body);
    if (err) return res.status(400).json({ ok: false, error: err });

    const inferResp = await fetch(`${ML_URL}/infer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: req.body.features })
    });
    const anomaly = await inferResp.json();

    const markets = await getMarketSnapshot();
    const regime = inferRegime(markets);
    const ensemble = runEnsemble({ anomaly, regime });

    return res.json({ ok: true, markets, ...ensemble });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/scenario/run', async (req, res) => {
  const scenario = req.body?.scenario || 'volatility-spike';
  const markets = await getMarketSnapshot();
  const shock = scenario === 'rate-hike' ? 1.15 : scenario === 'liquidity-crunch' ? 1.25 : 1.35;
  const stressed = markets.map((m) => ({ ...m, changePct: +(m.changePct * shock).toFixed(2) }));
  const regime = inferRegime(stressed);
  return res.json({ ok: true, scenario, before: markets, after: stressed, regime });
});

function handlePolicyGate(req, res) {
  const validationError = validatePolicyGatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const verdict = evaluatePolicyGate(req.body);
  return res.json({
    ok: true,
    packetId: 'BE-P1',
    evaluatedAt: new Date().toISOString(),
    ...verdict,
    migration: {
      strategy: 'revamp',
      notes: 'Endpoint added alongside existing routes; no destructive rewrites.',
    },
  });
}

// Primary governance endpoint.
app.post('/api/governance/policy-gate', handlePolicyGate);
// Compatibility aliases during migration from prior route conventions.
app.post('/api/policy/gate', handlePolicyGate);
app.post('/api/risk/gate', handlePolicyGate);

// ─── Fusion Evaluator (ARCH-CORE v2) ────────────────────────────────────────
// Decision source-of-truth: merges policy rules + ML output into a single verdict.
function handleFusionEvaluate(req, res) {
  const validationError = validateFusionPayload(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const fusionResult = fusionEvaluate(req.body);
  return res.json({ ok: true, ...fusionResult });
}

app.post('/api/governance/fusion', handleFusionEvaluate);

// ─── Compatibility Adapters (Fusion-backed legacy routes) ────────────────────
// These re-route old policy/risk gate calls through the fusion evaluator
// and shape the response back to the legacy contract.
function handleLegacyViaFusion(req, res) {
  // Validate using the original policy-gate validator for backward compat
  const validationError = validatePolicyGatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const fusionInput = legacyPolicyGateToFusion(req.body);
  const fusionResult = fusionEvaluate(fusionInput);
  const legacyShape = fusionToLegacyPolicyGate(fusionResult);
  return res.json({
    ok: true,
    packetId: 'BE-P1',
    evaluatedAt: fusionResult.timestamp,
    ...legacyShape,
    migration: {
      strategy: 'fusion-compat',
      notes: 'Legacy route now backed by Fusion Evaluator. Response shape preserved.',
      fusionSource: fusionResult.source,
    },
  });
}

// Legacy aliases now route through fusion (non-breaking: same response shape)
app.post('/api/governance/policy-gate/v2', handleLegacyViaFusion);
app.post('/api/policy/gate/v2', handleLegacyViaFusion);
app.post('/api/risk/gate/v2', handleLegacyViaFusion);

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/signals' });

wss.on('connection', (ws) => {
  const timer = setInterval(async () => {
    const markets = await getMarketSnapshot();
    const regime = inferRegime(markets);
    ws.send(JSON.stringify({ type: 'tick', markets, regime, ts: new Date().toISOString() }));
  }, 2000);
  ws.on('close', () => clearInterval(timer));
});

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`backend+ws listening on :${port}`));
