import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { getMarketSnapshot } from './adapters/marketData.js';
import { inferRegime, runEnsemble } from './engine/ensemble.js';
import { evaluatePolicyGate, validatePolicyGatePayload } from './engine/policyGate.js';
import { createPolicyEnforcementService } from './engine/policyEnforcementService.js';
import { createRealtimeIntegrityTracker } from './engine/realtimeIntegrity.js';
import {
  buildFallbackMlAssessment,
  normalizeMlAssessmentForEnsemble,
  validateStrictMlContract,
} from './engine/mlContract.js';
import { evaluate as fusionEvaluate, POLICY_VERSION } from './fusion/fusionEvaluator.js';
import { validateFusionPayload } from './fusion/schema.js';
import { legacyPolicyGateToFusion, fusionToLegacyPolicyGate, legacyFinanceToFusion } from './fusion/compatAdapter.js';
import { generateRequestId, logDecision } from './fusion/fusionLogger.js';
import { recordDecision, increment as metricsIncrement, snapshot as metricsSnapshot } from './fusion/fusionMetrics.js';
import { auditStore } from './fusion/fusionAuditStore.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const ML_URL = process.env.ML_URL || 'http://localhost:8000';
const policyEnforcement = createPolicyEnforcementService();
const realtimeTracker = createRealtimeIntegrityTracker({ staleAfterMs: 7000 });

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

    const contract = validateStrictMlContract(data);
    if (!contract.ok) {
      const fallback = buildFallbackMlAssessment({
        reason: `ML_RESPONSE_INVALID:${contract.error}`,
      });
      return res.status(502).json({
        ok: false,
        packetId: 'BE-P3',
        error: contract.error,
        fallback,
      });
    }

    return res.json({
      ok: true,
      packetId: 'BE-P3',
      ...contract.value,
      ml_contract: { strict_valid: true },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/ml/classify', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const featuresRaw = Array.isArray(req.body?.features) ? req.body.features : [];
    const features = featuresRaw
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x))
      .slice(0, 128);

    const payload = { text, features };
    const r = await fetch(`${ML_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: data?.detail || 'ML classify failed' });
    }

    const requiredKeys = [
      'risk_category',
      'risk_score',
      'uncertainty',
      'recommendation',
      'reason_tags',
      'model_version',
      'fallback_used',
    ];
    const missing = requiredKeys.filter((k) => !(k in data));
    if (missing.length > 0) {
      return res.status(502).json({
        ok: false,
        error: `ML response missing keys: ${missing.join(', ')}`,
      });
    }

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
    const anomalyRaw = await inferResp.json();
    const normalized = normalizeMlAssessmentForEnsemble({
      responseOk: inferResp.ok,
      responseStatus: inferResp.status,
      responseBody: anomalyRaw,
    });

    const markets = await getMarketSnapshot();
    const regime = inferRegime(markets);
    const ensemble = runEnsemble({ anomaly: normalized.anomaly, regime });

    return res.json({
      ok: true,
      packetId: 'BE-P3',
      markets,
      ...ensemble,
      ml_contract: normalized.mlContract,
    });
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

// ─── Fusion Evaluator routes (ARCH-CORE + P3 observability + P4 audit) ──────

function handleFusionEvaluate(req, res) {
  const requestId = generateRequestId();
  const t0 = Date.now();

  const validationError = validateFusionPayload(req.body);
  if (validationError) {
    metricsIncrement('errors');
    return res.status(400).json({ ok: false, error: validationError });
  }

  const result = fusionEvaluate(req.body);
  const durationMs = Date.now() - t0;

  // P3: structured logging + metrics
  recordDecision(result);
  logDecision({ requestId, route: req.path, fusionResult: result, durationMs, clientIp: req.ip });

  // P4: audit trail
  auditStore.append({
    request_id: requestId, decision: result.decision, reason_tags: result.reason_tags,
    risk_score: result.risk_score, uncertainty: result.uncertainty, stale_state: result.stale_state,
    source: result.source, policy_version: result.policy_version, model_version: result.model_version,
    timestamp: result.timestamp, route: req.path,
  });

  return res.json({ ok: true, ...result, _requestId: requestId });
}

function handleLegacyViaFusion(req, res) {
  const requestId = generateRequestId();
  const t0 = Date.now();

  const fusionInput = legacyPolicyGateToFusion(req.body);
  const validationError = validateFusionPayload(fusionInput);
  if (validationError) {
    metricsIncrement('errors');
    return res.status(400).json({ ok: false, error: validationError });
  }

  const fusionResult = fusionEvaluate(fusionInput);
  const durationMs = Date.now() - t0;

  // P3: structured logging + metrics
  recordDecision(fusionResult);
  logDecision({ requestId, route: req.path, fusionResult, durationMs, clientIp: req.ip });

  // P4: audit trail
  auditStore.append({
    request_id: requestId, decision: fusionResult.decision, reason_tags: fusionResult.reason_tags,
    risk_score: fusionResult.risk_score, uncertainty: fusionResult.uncertainty, stale_state: fusionResult.stale_state,
    source: fusionResult.source, policy_version: fusionResult.policy_version, model_version: fusionResult.model_version,
    timestamp: fusionResult.timestamp, route: req.path,
  });

  const legacy = fusionToLegacyPolicyGate(fusionResult);
  return res.json({
    ok: true,
    packetId: 'BE-P1',
    evaluatedAt: new Date().toISOString(),
    ...legacy,
    migration: {
      strategy: 'fusion-compat',
      fusionSource: fusionResult.source,
      notes: 'Endpoint added alongside existing routes; no destructive rewrites.',
    },
  });
}

// Primary governance endpoint.
app.post('/api/governance/policy-gate', handlePolicyGate);
// Compatibility aliases during migration from prior route conventions.
app.post('/api/policy/gate', handlePolicyGate);
app.post('/api/risk/gate', handlePolicyGate);

// Fusion evaluator endpoints.
app.post('/api/governance/fusion', handleFusionEvaluate);
app.post('/api/governance/policy-gate/v2', handleLegacyViaFusion);
app.post('/api/policy/gate/v2', handleLegacyViaFusion);
app.post('/api/risk/gate/v2', handleLegacyViaFusion);

app.post('/api/governance/actions/propose', (req, res) => {
  try {
    const result = policyEnforcement.propose(req.body);
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/governance/actions', (_req, res) => {
  try {
    const result = policyEnforcement.list();
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
  }
});

function resolveActionFromRequest(req, res, resolution) {
  try {
    const result = policyEnforcement.resolve(req.body, resolution);
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
  }
}

app.post('/api/action/approve', (req, res) => {
  return resolveActionFromRequest(
    req,
    res,
    'approve',
  );
});

app.post('/api/action/block', (req, res) => {
  return resolveActionFromRequest(
    req,
    res,
    'block',
  );
});

app.post('/api/action/escalate', (req, res) => {
  return resolveActionFromRequest(
    req,
    res,
    'escalate',
  );
});

app.get('/api/governance/actions/:actionId', (req, res) => {
  try {
    const result = policyEnforcement.detail(req.params.actionId);
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
  }
});

// ─── Finance legacy adapter (ARCH-CORE-DP1) ─────────────────────────────────
// Accepts old finance-style payloads, converts to fusion input, returns fusion
// envelope.  Logs a deprecation warning for migration visibility.
app.post('/api/governance/fusion/finance', (req, res) => {
  const requestId = generateRequestId();
  const t0 = Date.now();
  const { fusionInput, deprecated } = legacyFinanceToFusion(req.body);

  if (!fusionInput) return handleFusionEvaluate(req, res);

  const validationError = validateFusionPayload(fusionInput);
  if (validationError) {
    metricsIncrement('errors');
    return res.status(400).json({ ok: false, error: validationError });
  }

  const fusionResult = fusionEvaluate(fusionInput);
  const durationMs = Date.now() - t0;

  // P3: structured logging + metrics
  recordDecision(fusionResult);
  logDecision({ requestId, route: req.path, fusionResult, durationMs, clientIp: req.ip });

  // P4: audit trail
  auditStore.append({
    request_id: requestId, decision: fusionResult.decision, reason_tags: fusionResult.reason_tags,
    risk_score: fusionResult.risk_score, uncertainty: fusionResult.uncertainty, stale_state: fusionResult.stale_state,
    source: fusionResult.source, policy_version: fusionResult.policy_version, model_version: fusionResult.model_version,
    timestamp: fusionResult.timestamp, route: req.path,
  });

  return res.json({
    ok: true,
    ...fusionResult,
    _requestId: requestId,
    _deprecated: deprecated,
    _migration_note: 'Migrate to POST /api/governance/fusion with { action, context, ml_output } shape.',
  });
});

// ─── Fusion audit trail endpoints (ARCH-CORE-P4) ────────────────────────────
app.get('/api/governance/fusion/audit', (req, res) => {
  const limit = Math.max(1, Math.min(5000, parseInt(req.query.limit, 10) || 50));
  return res.json({
    ok: true,
    count: auditStore.size(),
    capacity: auditStore.capacity(),
    records: auditStore.list(limit),
  });
});

app.get('/api/governance/fusion/audit/:request_id', (req, res) => {
  const record = auditStore.findById(req.params.request_id);
  if (!record) {
    return res.status(404).json({ ok: false, error: `Audit record not found: ${req.params.request_id}` });
  }
  return res.json({ ok: true, record });
});

// ─── Fusion health / metrics endpoint (ARCH-CORE-P3) ────────────────────────
app.get('/api/governance/fusion/health', (_req, res) => {
  return res.json({
    ok: true,
    policy_version: POLICY_VERSION,
    model_version_support: true,
    metrics: metricsSnapshot(),
  });
});

const port = process.env.PORT || 4000;
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

if (!isTestEnv) {
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/signals' });

  wss.on('connection', (ws) => {
    const timer = setInterval(async () => {
      const integrity = await realtimeTracker.capture(async () => {
        const markets = await getMarketSnapshot();
        const regime = inferRegime(markets);
        return { markets, regime };
      }, 'adapter.marketData');
      ws.send(JSON.stringify({
        type: 'tick',
        source: integrity.source,
        timestamp: integrity.timestamp,
        stale_state: integrity.stale_state,
        stale_reason: integrity.stale_reason,
        age_ms: integrity.age_ms,
        markets: integrity.payload?.markets || [],
        regime: integrity.payload?.regime || 'unknown',
      }));
    }, 2000);
    ws.on('close', () => clearInterval(timer));
  });

  server.listen(port, () => console.log(`backend+ws listening on :${port}`));
}

export { app };

