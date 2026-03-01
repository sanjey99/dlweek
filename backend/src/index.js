import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { getMarketSnapshot } from './adapters/marketData.js';
import { inferRegime, runEnsemble } from './engine/ensemble.js';
import { evaluatePolicyGate, validatePolicyGatePayload } from './engine/policyGate.js';
import {
  createActionLifecycleStore,
  validateActionProposalPayload,
  validateActionResolutionPayload,
} from './engine/actionLifecycle.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const ML_URL = process.env.ML_URL || 'http://localhost:8000';
const actionLifecycle = createActionLifecycleStore();

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

function asDecisionContract(policy) {
  return {
    decision: policy.decision,
    reasonTags: policy.reasonTags,
    confidence: policy.confidence,
  };
}

function evaluateActionPolicy(body) {
  return evaluatePolicyGate({ action: body.action, context: body.context });
}

// Primary governance endpoint.
app.post('/api/governance/policy-gate', handlePolicyGate);
// Compatibility aliases during migration from prior route conventions.
app.post('/api/policy/gate', handlePolicyGate);
app.post('/api/risk/gate', handlePolicyGate);

app.post('/api/governance/actions/propose', (req, res) => {
  const validationError = validateActionProposalPayload(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const policy = evaluateActionPolicy(req.body);
  const record = actionLifecycle.saveProposal({
    action: req.body.action,
    context: req.body.context,
    policy,
  });

  return res.json({
    ok: true,
    packetId: 'BE-P2',
    actionId: record.actionId,
    status: record.status,
    ...asDecisionContract(policy),
    policy,
  });
});

function resolveActionFromRequest(req, res, resolution, decisionOverride) {
  const validationError = validateActionResolutionPayload(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }

  const record = actionLifecycle.getAction(req.body.actionId);
  if (!record) {
    return res.status(404).json({ ok: false, error: 'action not found' });
  }

  const actor = typeof req.body.actor === 'string' && req.body.actor.trim().length > 0
    ? req.body.actor.trim()
    : 'human-reviewer';
  const notes = typeof req.body.notes === 'string' ? req.body.notes : null;

  const updated = actionLifecycle.resolveAction(record.actionId, {
    actor,
    resolution: { ...resolution, notes },
  });

  const policyContract = {
    decision: decisionOverride,
    reasonTags: [...record.policy.reasonTags, resolution.reasonTag],
    confidence: record.policy.confidence,
  };

  return res.json({
    ok: true,
    packetId: 'BE-P2',
    actionId: updated.actionId,
    status: updated.status,
    ...policyContract,
    policy: {
      ...record.policy,
      ...policyContract,
    },
    resolution: updated.resolution,
  });
}

app.post('/api/action/approve', (req, res) => {
  return resolveActionFromRequest(
    req,
    res,
    { type: 'approve', status: 'approved_by_human', reasonTag: 'HUMAN_APPROVED' },
    'allow',
  );
});

app.post('/api/action/block', (req, res) => {
  return resolveActionFromRequest(
    req,
    res,
    { type: 'block', status: 'blocked_by_human', reasonTag: 'HUMAN_BLOCKED' },
    'block',
  );
});

app.post('/api/action/escalate', (req, res) => {
  return resolveActionFromRequest(
    req,
    res,
    { type: 'escalate', status: 'escalated', reasonTag: 'ESCALATED_FOR_REVIEW' },
    'review',
  );
});

app.get('/api/governance/actions/:actionId', (req, res) => {
  const record = actionLifecycle.getAction(req.params.actionId);
  if (!record) return res.status(404).json({ ok: false, error: 'action not found' });
  return res.json({
    ok: true,
    action: record,
    events: actionLifecycle.listEvents(record.actionId),
  });
});

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
