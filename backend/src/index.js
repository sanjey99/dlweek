import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { evaluatePolicyGate, validatePolicyGatePayload } from './engine/policyGate.js';
import { createPolicyEnforcementService } from './engine/policyEnforcementService.js';
import {
  buildFallbackMlAssessment,
  normalizeMlAssessmentForEnsemble,
  validateMlClassifyResponse,
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
app.use(express.json({ limit: '10mb' }));

const ML_URL = process.env.ML_URL || 'http://localhost:8000';
const policyEnforcement = createPolicyEnforcementService();

// ─── In-memory action store for real-time dashboard ──────────────────────────
const actionStore = [];
let actionIdCounter = 0;

// ─── WebSocket client tracking ───────────────────────────────────────────────
const wsClients = new Set();

function broadcastToClients(message) {
  const payload = JSON.stringify(message);
  for (const ws of wsClients) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(payload);
    }
  }
}

// ─── Map ML risk category to frontend risk status ────────────────────────────
function mapToRiskStatus(riskCategory, recommendation) {
  if (riskCategory === 'high' || recommendation === 'block') {
    return recommendation === 'block' ? 'HIGH_RISK_BLOCKED' : 'HIGH_RISK_PENDING';
  }
  if (riskCategory === 'medium' || recommendation === 'review') {
    return 'MEDIUM_RISK_PENDING';
  }
  return 'LOW_RISK';
}

function riskScoreTo100(score01) {
  return Math.round(score01 * 100);
}

// ─── Core: classify an action via ML service ─────────────────────────────────
async function classifyAction(actionData) {
  const text = (actionData.description || '') + ' ' + (actionData.proposed_action || actionData.proposedAction || '');
  const context = actionData.context || null;

  try {
    const mlResp = await fetch(`${ML_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context }),
    });
    const mlData = await mlResp.json();

    if (!mlResp.ok || mlData.fallback_used) {
      return buildFallbackMlAssessment({ reason: 'ML_CLASSIFY_FAILED' });
    }

    return mlData;
  } catch (e) {
    console.error('[classifyAction] ML service error:', e.message);
    return buildFallbackMlAssessment({ reason: 'ML_SERVICE_UNREACHABLE' });
  }
}

// ─── Core: process a single action through the full pipeline ─────────────────
async function processAction(actionData) {
  // 1. Classify via ML
  const mlResult = await classifyAction(actionData);

  // 2. Run fusion evaluator (policy + ML)
  const fusionInput = {
    action: { type: actionData.action_type || actionData.actionType || 'UNKNOWN' },
    context: {
      ...(actionData.context || {}),
      targetEnvironment: actionData.context?.targetEnvironment || actionData.environment?.toLowerCase() || 'staging',
      riskScore: mlResult.risk_score,
      mlConfidence: mlResult.confidence,
    },
    ml_output: {
      risk_score: mlResult.risk_score,
      confidence: mlResult.confidence,
      uncertainty: mlResult.uncertainty,
      label: mlResult.label || mlResult.risk_category,
      recommendation: mlResult.recommendation,
      model_version: mlResult.model_version,
      timestamp: mlResult.timestamp || new Date().toISOString(),
    },
  };

  const fusionResult = fusionEvaluate(fusionInput);

  // 3. Build the action record for the dashboard
  actionIdCounter += 1;
  const now = new Date();
  const actionRecord = {
    id: `act-${String(actionIdCounter).padStart(4, '0')}`,
    timestamp: now.toTimeString().slice(0, 8),
    timestampISO: now.toISOString(),
    agentName: actionData.agent_name || actionData.agentName || 'unknown-agent',
    proposedAction: actionData.proposed_action || actionData.proposedAction || '',
    environment: (actionData.environment || 'STAGING').toUpperCase(),
    riskStatus: mapToRiskStatus(mlResult.risk_category, fusionResult.decision),
    riskScore: riskScoreTo100(fusionResult.risk_score),
    source: `${mlResult.model_version} · ${fusionResult.source}`,
    flagReasons: fusionResult.reason_tags.filter(t =>
      !['FUSED_RISK_ACCEPTABLE', 'RISK_WITHIN_POLICY'].includes(t)
    ),
    description: actionData.description || '',
    mlResult: {
      risk_category: mlResult.risk_category,
      risk_score: mlResult.risk_score,
      confidence: mlResult.confidence,
      uncertainty: mlResult.uncertainty,
      recommendation: mlResult.recommendation,
    },
    fusionResult: {
      decision: fusionResult.decision,
      risk_score: fusionResult.risk_score,
      risk_category: fusionResult.risk_category,
      uncertainty: fusionResult.uncertainty,
    },
  };

  // Notify only when human review is required.
  if (actionRecord.riskStatus === 'HIGH_RISK_PENDING' || actionRecord.riskStatus === 'MEDIUM_RISK_PENDING') {
    createNotification({
      type: 'new_pending',
      title: 'New action requires review',
      detail: `${actionRecord.agentName}: ${actionRecord.proposedAction}`,
      actionId: actionRecord.id,
      severity: actionRecord.riskStatus === 'HIGH_RISK_PENDING' ? 'critical' : 'warning',
    });
  }

  // 4. Store and audit
  actionStore.unshift(actionRecord); // newest first
  if (actionStore.length > 500) actionStore.pop(); // cap

  const requestId = generateRequestId();
  recordDecision(fusionResult);
  logDecision({ requestId, route: '/api/actions/submit', fusionResult, durationMs: 0, clientIp: 'internal' });
  auditStore.append({
    request_id: requestId, decision: fusionResult.decision, reason_tags: fusionResult.reason_tags,
    risk_score: fusionResult.risk_score, uncertainty: fusionResult.uncertainty, stale_state: fusionResult.stale_state,
    source: fusionResult.source, policy_version: fusionResult.policy_version, model_version: fusionResult.model_version,
    timestamp: fusionResult.timestamp, route: '/api/actions/submit',
  });

  // 5. Broadcast to WebSocket clients
  broadcastToClients({ type: 'new_action', action: actionRecord });

  return actionRecord;
}

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, service: 'backend' }));

// ─── ML service proxy ────────────────────────────────────────────────────────
app.get('/api/model-info', async (_req, res) => {
  try {
    const r = await fetch(`${ML_URL}/model/info`);
    const data = await r.json();
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/api/classify', async (req, res) => {
  try {
    const { text, features } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text must be a non-empty string' });
    }
    const r = await fetch(`${ML_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, features }),
    });
    const data = await r.json();
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── Action submission (single) ──────────────────────────────────────────────
app.post('/api/actions/submit', async (req, res) => {
  try {
    const actionData = req.body;
    if (!actionData || typeof actionData !== 'object') {
      return res.status(400).json({ ok: false, error: 'body must be a JSON object' });
    }
    if (!actionData.proposed_action && !actionData.proposedAction) {
      return res.status(400).json({ ok: false, error: 'proposed_action is required' });
    }

    const record = await processAction(actionData);
    return res.json({ ok: true, action: record });
  } catch (e) {
    console.error('[submit]', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── Batch upload with simulated delay ───────────────────────────────────────
// Accepts { actions: [...], delay_ms?: number }
// Processes each action with delay, broadcasting each via WebSocket
const uploadSessions = new Map();

app.post('/api/actions/upload', async (req, res) => {
  try {
    const { actions, delay_ms = 2000 } = req.body;
    if (!Array.isArray(actions) || actions.length === 0) {
      return res.status(400).json({ ok: false, error: 'actions must be a non-empty array' });
    }

    const sessionId = `upload_${Date.now()}`;
    const delay = Math.max(500, Math.min(10000, Number(delay_ms) || 2000));

    // Return immediately with session info
    res.json({
      ok: true,
      sessionId,
      total: actions.length,
      delay_ms: delay,
      message: `Processing ${actions.length} actions with ${delay}ms delay each`,
    });

    // Process actions in background with delay
    uploadSessions.set(sessionId, { total: actions.length, processed: 0, status: 'running' });

    for (let i = 0; i < actions.length; i++) {
      await processAction(actions[i]);
      uploadSessions.get(sessionId).processed = i + 1;

      // Broadcast progress
      broadcastToClients({
        type: 'upload_progress',
        sessionId,
        processed: i + 1,
        total: actions.length,
      });

      // Delay between actions (except after last)
      if (i < actions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    uploadSessions.get(sessionId).status = 'completed';
    broadcastToClients({ type: 'upload_complete', sessionId, total: actions.length });
  } catch (e) {
    console.error('[upload]', e);
    // Response already sent — just log
  }
});

app.get('/api/actions/upload/:sessionId', (req, res) => {
  const session = uploadSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'session not found' });
  return res.json({ ok: true, ...session });
});

// ─── Action list (for frontend polling / initial load) ───────────────────────
app.get('/api/actions', (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  return res.json({
    ok: true,
    total: actionStore.length,
    actions: actionStore.slice(0, limit),
  });
});

// ─── Action resolution (approve / block / escalate) ──────────────────────────
app.post('/api/actions/:id/approve', (req, res) => {
  const action = actionStore.find(a => a.id === req.params.id);
  if (!action) return res.status(404).json({ ok: false, error: 'action not found' });
  action.riskStatus = 'APPROVED';
  broadcastToClients({ type: 'action_updated', action });
  return res.json({ ok: true, action });
});

app.post('/api/actions/:id/block', (req, res) => {
  const action = actionStore.find(a => a.id === req.params.id);
  if (!action) return res.status(404).json({ ok: false, error: 'action not found' });
  action.riskStatus = 'HIGH_RISK_BLOCKED';
  broadcastToClients({ type: 'action_updated', action });
  return res.json({ ok: true, action });
});

app.post('/api/actions/:id/escalate', (req, res) => {
  const action = actionStore.find(a => a.id === req.params.id);
  if (!action) return res.status(404).json({ ok: false, error: 'action not found' });
  action.riskStatus = 'ESCALATED';
  broadcastToClients({ type: 'action_updated', action });
  return res.json({ ok: true, action });
});

// ─── Accuracy test proxy ────────────────────────────────────────────────────
app.post('/api/accuracy', async (req, res) => {
  try {
    const r = await fetch(`${ML_URL}/accuracy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── Policy gate (legacy compatibility) ──────────────────────────────────────
function handlePolicyGate(req, res) {
  const validationError = validatePolicyGatePayload(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: validationError });
  }
  const verdict = evaluatePolicyGate(req.body);
  return res.json({ ok: true, packetId: 'BE-P1', evaluatedAt: new Date().toISOString(), ...verdict });
}

app.post('/api/governance/policy-gate', handlePolicyGate);
app.post('/api/policy/gate', handlePolicyGate);

// ─── Fusion evaluator endpoints ──────────────────────────────────────────────
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
  recordDecision(result);
  logDecision({ requestId, route: req.path, fusionResult: result, durationMs, clientIp: req.ip });
  auditStore.append({
    request_id: requestId, decision: result.decision, reason_tags: result.reason_tags,
    risk_score: result.risk_score, uncertainty: result.uncertainty, stale_state: result.stale_state,
    source: result.source, policy_version: result.policy_version, model_version: result.model_version,
    timestamp: result.timestamp, route: req.path,
  });
  return res.json({ ok: true, ...result, _requestId: requestId });
}

app.post('/api/governance/fusion', handleFusionEvaluate);

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
  recordDecision(fusionResult);
  logDecision({ requestId, route: req.path, fusionResult, durationMs, clientIp: req.ip });
  auditStore.append({
    request_id: requestId, decision: fusionResult.decision, reason_tags: fusionResult.reason_tags,
    risk_score: fusionResult.risk_score, uncertainty: fusionResult.uncertainty, stale_state: fusionResult.stale_state,
    source: fusionResult.source, policy_version: fusionResult.policy_version, model_version: fusionResult.model_version,
    timestamp: fusionResult.timestamp, route: req.path,
  });
  const legacy = fusionToLegacyPolicyGate(fusionResult);
  return res.json({ ok: true, packetId: 'BE-P1', evaluatedAt: new Date().toISOString(), ...legacy });
}

app.post('/api/governance/policy-gate/v2', handleLegacyViaFusion);
app.post('/api/policy/gate/v2', handleLegacyViaFusion);

// ─── Audit trail ─────────────────────────────────────────────────────────────
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

// ─── Fusion health / metrics ─────────────────────────────────────────────────
app.get('/api/governance/fusion/health', (_req, res) => {
  return res.json({
    ok: true,
    policy_version: POLICY_VERSION,
    model_version_support: true,
    metrics: metricsSnapshot(),
  });
});

// ─── Server startup ──────────────────────────────────────────────────────────
const port = process.env.PORT || 4000;
const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

if (!isTestEnv) {
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    wsClients.add(ws);

    // Send current action list on connect
    ws.send(JSON.stringify({
      type: 'init',
      actions: actionStore.slice(0, 50),
      total: actionStore.length,
    }));

    ws.on('close', () => {
      wsClients.delete(ws);
      console.log('[WS] Client disconnected');
    });
  });

  server.listen(port, () => console.log(`[Sentinel] Backend + WebSocket listening on :${port}`));
}

// Notification store (Phase 2, Step 1)
const notifications = [];
const NOTIFICATION_CAPACITY = 500;

function createNotification({
  type,
  title,
  detail,
  actionId = null,
  severity = 'info',
}) {
  const id = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item = {
    id,
    type,
    title,
    detail,
    actionId,
    severity,
    unread: true,
    createdAt: new Date().toISOString(),
  };
  notifications.unshift(item);
  if (notifications.length > NOTIFICATION_CAPACITY) {
    notifications.length = NOTIFICATION_CAPACITY;
  }
  return item;
}

function listNotifications(limit = 50) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
  const rows = notifications.slice(0, safeLimit);
  const unreadCount = notifications.reduce((acc, n) => acc + (n.unread ? 1 : 0), 0);
  return { notifications: rows, unreadCount };
}

function markNotificationRead(id) {
  if (!id) return false;
  const row = notifications.find((n) => n.id === id);
  if (!row) return false;
  row.unread = false;
  return true;
}

function markAllNotificationsRead() {
  let changed = 0;
  for (const row of notifications) {
    if (row.unread) {
      row.unread = false;
      changed += 1;
    }
  }
  return changed;
}

app.get('/api/notifications', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const result = listNotifications(limit);
  return res.json({ ok: true, ...result });
});

app.post('/api/notifications/read', (req, res) => {
  const id = req.body?.id;
  if (typeof id !== 'string' || id.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'id is required' });
  }
  const changed = markNotificationRead(id.trim());
  if (!changed) {
    return res.status(404).json({ ok: false, error: 'notification not found: ' + id });
  }
  return res.json({ ok: true, ...listNotifications(50) });
});

app.post('/api/notifications/read-all', (_req, res) => {
  const changed = markAllNotificationsRead();
  return res.json({ ok: true, changed, ...listNotifications(50) });
});

export { app };
