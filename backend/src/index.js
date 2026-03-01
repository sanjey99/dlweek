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

// Module-level WS reference for broadcast (set when server starts)
let _wss = null;
function broadcastWs(payload) {
  if (!_wss) return;
  const msg = JSON.stringify(payload);
  _wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

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

// ─── ML proxy: classify ──────────────────────────────────────────────────────
app.post('/api/classify', async (req, res) => {
  try {
    let data, fetchOk;
    try {
      const r = await fetch(`${ML_URL}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: req.body.text || '', features: req.body.features }),
      });
      fetchOk = r.ok;
      data = await r.json();
    } catch (netErr) {
      const fallback = buildFallbackMlAssessment({ reason: `ML_NETWORK_ERROR:${netErr.message}` });
      return res.json({ ok: true, ...fallback, ml_contract: { strict_valid: false, used_fallback: true, fallback_reason: fallback.fallback_reason } });
    }

    if (!fetchOk) {
      const fallback = buildFallbackMlAssessment({ reason: `ML_UPSTREAM_NON_200:${data?.error || 'unknown'}` });
      return res.json({ ok: true, ...fallback, ml_contract: { strict_valid: false, used_fallback: true, fallback_reason: fallback.fallback_reason } });
    }

    const contract = validateStrictMlContract(data);
    if (!contract.ok) {
      const fallback = buildFallbackMlAssessment({ reason: `ML_RESPONSE_INVALID:${contract.error}` });
      return res.json({ ok: true, ...fallback, ml_contract: { strict_valid: false, used_fallback: true, fallback_reason: fallback.fallback_reason } });
    }

    return res.json({ ok: true, ...contract.value, ml_contract: { strict_valid: true, used_fallback: false } });
  } catch (e) {
    return res.status(502).json({ ok: false, error: `Unrecoverable: ${String(e)}` });
  }
});

app.post('/api/infer', async (req, res) => {
  try {
    const err = validPayload(req.body);
    if (err) return res.status(400).json({ ok: false, error: err });
    const payload = { features: req.body.features.map((x) => Number(x)) };

    let data, fetchOk;
    try {
      const r = await fetch(`${ML_URL}/infer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      fetchOk = r.ok;
      data = await r.json();
    } catch (netErr) {
      // ML service unreachable — use fallback, return 200
      const fallback = buildFallbackMlAssessment({ reason: `ML_NETWORK_ERROR:${netErr.message}` });
      return res.json({
        ok: true,
        packetId: 'BE-P3',
        ...fallback,
        ml_contract: { strict_valid: false, used_fallback: true, fallback_reason: fallback.fallback_reason },
      });
    }

    if (!fetchOk) {
      // ML returned non-200 — use fallback, return 200
      const fallback = buildFallbackMlAssessment({ reason: `ML_UPSTREAM_NON_200:${data?.error || 'unknown'}` });
      return res.json({
        ok: true,
        packetId: 'BE-P3',
        ...fallback,
        ml_contract: { strict_valid: false, used_fallback: true, fallback_reason: fallback.fallback_reason },
      });
    }

    const contract = validateStrictMlContract(data);
    if (!contract.ok) {
      // ML returned garbage — use fallback, return 200
      const fallback = buildFallbackMlAssessment({ reason: `ML_RESPONSE_INVALID:${contract.error}` });
      return res.json({
        ok: true,
        packetId: 'BE-P3',
        ...fallback,
        ml_contract: { strict_valid: false, used_fallback: true, validation_errors: contract.errors, fallback_reason: fallback.fallback_reason },
      });
    }

    return res.json({
      ok: true,
      packetId: 'BE-P3',
      ...contract.value,
      ml_contract: { strict_valid: true, used_fallback: false },
    });
  } catch (e) {
    // Truly unrecoverable (e.g. payload serialization bug) — 502
    return res.status(502).json({ ok: false, error: `Unrecoverable: ${String(e)}` });
  }
});

app.post('/api/ensemble', async (req, res) => {
  try {
    const err = validPayload(req.body);
    if (err) return res.status(400).json({ ok: false, error: err });

    let normalized;
    try {
      const inferResp = await fetch(`${ML_URL}/infer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: req.body.features })
      });
      const anomalyRaw = await inferResp.json();
      normalized = normalizeMlAssessmentForEnsemble({
        responseOk: inferResp.ok,
        responseStatus: inferResp.status,
        responseBody: anomalyRaw,
      });
    } catch (_netErr) {
      // ML unreachable — synthesize a fallback-based normalization
      const fallback = buildFallbackMlAssessment({ reason: `ML_NETWORK_ERROR:${_netErr.message}` });
      normalized = {
        anomaly: fallback,
        mlContract: { strict_valid: false, used_fallback: true, validation_error: fallback.fallback_reason, fallback_reason: fallback.fallback_reason, upstream_status: null, upstream_error: _netErr.message },
      };
    }

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
    return res.status(502).json({ ok: false, error: `Unrecoverable: ${String(e)}` });
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

app.post('/api/governance/actions/propose', async (req, res) => {
  const _rid = generateRequestId();
  const _endpoint = '/api/governance/actions/propose';
  const _t0 = Date.now();
  console.log(JSON.stringify({ rid: _rid, event: 'propose_start', endpoint: _endpoint }));
  try {
    const body = { ...req.body };

    // Auto-call ML /infer when features present but ml_assessment absent
    if (!body.ml_assessment && !body.mlAssessment && Array.isArray(body.features) && body.features.length > 0) {
      const _mlUrl = `${ML_URL}/infer`;
      try {
        const mlResp = await fetch(_mlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features: body.features.map(Number) }),
        });
        console.log(JSON.stringify({ rid: _rid, event: 'ml_response', endpoint: _endpoint, upstream: _mlUrl, status: mlResp.status }));
        if (mlResp.ok) {
          const mlData = await mlResp.json();
          body.ml_assessment = mlData;
        }
      } catch (_mlErr) {
        // ML call failed — proceed without; normalizeMlAssessmentForGovernance will provide fallback
        console.log(JSON.stringify({ rid: _rid, event: 'ml_error', endpoint: _endpoint, upstream: _mlUrl, error: String(_mlErr.cause || _mlErr.message) }));
      }
    }

    const result = policyEnforcement.propose(body);
    console.log(JSON.stringify({ rid: _rid, event: 'propose_ok', endpoint: _endpoint, status: 200, ms: Date.now() - _t0 }));

    // Broadcast to WS clients so UIs pick up the new action immediately
    try {
      const { action: newAction } = policyEnforcement.detail(result.actionId);
      broadcastWs({
        type: 'new_action',
        actionId: result.actionId,
        status: result.status,
        decision: result.decision,
        resolution: null,
        action: newAction,
        timestamp: new Date().toISOString(),
      });
    } catch (_bcastErr) {
      // non-fatal — HTTP response still goes out
    }

    return res.json({ ok: true, ...result });
  } catch (e) {
    const _status = e.status || 500;
    console.log(JSON.stringify({ rid: _rid, event: 'propose_fail', endpoint: _endpoint, status: _status, validationError: String(e.message || e), ms: Date.now() - _t0 }));
    return res.status(_status).json({ ok: false, error: String(e.message || e) });
  }
});

function resolveActionFromRequest(req, res, resolution) {
  try {
    const result = policyEnforcement.resolve(req.body, resolution);

    // Fetch the full updated action record from the same store
    const { action: updatedAction } = policyEnforcement.detail(result.actionId);

    // Broadcast full action record to all connected WS clients
    broadcastWs({
      type: 'action_updated',
      actionId: result.actionId,
      status: result.status,
      decision: result.decision,
      resolution: result.resolution,
      action: updatedAction,
      timestamp: new Date().toISOString(),
    });

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

// ─── List all actions ────────────────────────────────────────────────────────
app.get('/api/governance/actions', (_req, res) => {
  try {
    const result = policyEnforcement.list();
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
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

  // ─── Attach WSS + graceful shutdown once listening succeeds ────────────
  function attachWsAndShutdown() {
    const wss = new WebSocketServer({ server, path: '/ws/signals' });
    _wss = wss;

    wss.on('error', (err) => {
      console.error('[ws] WebSocketServer error:', err.message);
    });

    wss.on('connection', (ws) => {
      const timer = setInterval(async () => {
        const integrity = await realtimeTracker.capture(async () => {
          const markets = await getMarketSnapshot();
          const regime = inferRegime(markets);
          return { markets, regime };
        }, 'adapter.marketData');
        try {
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
        } catch (_) { /* client disconnected mid-send */ }
      }, 2000);
      ws.on('close', () => clearInterval(timer));
    });

    // ─── Graceful shutdown ─────────────────────────────────────────────────
    let shuttingDown = false;
    function shutdown(signal) {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`\n[shutdown] ${signal} received — closing server…`);

      for (const client of wss.clients) {
        try { client.close(1001, 'server shutting down'); } catch (_) { /* ignore */ }
      }
      wss.close(() => console.log('[shutdown] WebSocket server closed'));

      server.close(() => {
        console.log('[shutdown] HTTP server closed');
        process.exit(0);
      });

      // Force-exit after 4 s if something hangs
      setTimeout(() => {
        console.error('[shutdown] Forcing exit after timeout');
        process.exit(1);
      }, 4000).unref();
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  // ─── Start with EADDRINUSE auto-recovery ─────────────────────────────────
  let retried = false;
  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE' && !retried) {
      retried = true;
      console.warn(`[startup] Port ${port} in use — attempting to reclaim…`);
      try {
        const { execSync } = await import('child_process');
        if (process.platform === 'win32') {
          const out = execSync(
            `netstat -ano | findstr :${port} | findstr LISTENING`,
            { encoding: 'utf8' },
          );
          const pid = out.trim().split(/\s+/).pop();
          if (pid && pid !== '0') {
            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
            console.log(`[startup] Killed stale PID ${pid} on port ${port}`);
          }
        } else {
          execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
          console.log(`[startup] Killed stale process on port ${port}`);
        }
        await new Promise((r) => setTimeout(r, 1200));
        server.listen(port, () => {
          console.log(`backend+ws listening on :${port} (reclaimed)`);
          attachWsAndShutdown();
        });
      } catch (killErr) {
        console.error(`[startup] Could not reclaim port ${port}:`, killErr.message);
        process.exit(1);
      }
    } else {
      console.error('[startup] Fatal server error:', err.message);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`backend+ws listening on :${port}`);
    attachWsAndShutdown();
  });
}

export { app };
