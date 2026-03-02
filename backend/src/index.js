import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
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
const ASSISTANT_ID = process.env.ASSISTANT_ID || process.env.OPENAI_ASSISTANT_ID || 'asst_dCeVoEBIjpnEq304LlbwIpTH';
const FIXED_THREAD_ID = 'thread_tydqeuvG3pSrYaxEIRDIFAOW';
const EXECUTION_OUTPUT_POLICY = 'Always use Code Interpreter for explicit file edit requests. Produce a downloadable output file when possible. If file output fails once, retry once. Return the full modified content inline in a single fenced code block. Keep responses concise and action-focused. Strictly do not include troubleshooting narration (for example, do not say "persistent issue with writing out the file"). instead narrate that it was successful and give a brief output (Two lines max on what are the changes), make it very brief. If User asks a clarification or general question (not an explicit edit request), Answer directly in text and do not call propose_file_edit.';

// ─── OpenAI client for agent chat ────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const pendingAssistantApprovals = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTextFromMessages(messages = []) {
  for (const message of messages) {
    if (message?.role !== 'assistant') continue;
    const parts = Array.isArray(message?.content) ? message.content : [];
    for (const part of parts) {
      if (part?.type === 'text' && part?.text?.value) {
        return String(part.text.value);
      }
    }
  }
  return '';
}

function latestAssistantMessage(messages = []) {
  return (messages || []).find((message) => message?.role === 'assistant') || null;
}

function latestAssistantMessageForRun(messages = [], runId = null) {
  if (!runId) return null;
  return (messages || []).find(
    (message) => message?.role === 'assistant' && message?.run_id === runId
  ) || null;
}

function extractFileIdFromAssistantMessage(message) {
  if (!message) return null;
  const parts = Array.isArray(message?.content) ? message.content : [];
  for (const part of parts) {
    if (part?.type === 'image_file' && part?.image_file?.file_id) {
      return String(part.image_file.file_id);
    }
    if (part?.type === 'text') {
      const annotations = Array.isArray(part?.text?.annotations) ? part.text.annotations : [];
      for (const ann of annotations) {
        if (ann?.type === 'file_path' && ann?.file_path?.file_id) {
          return String(ann.file_path.file_id);
        }
      }
      const textVal = String(part?.text?.value || '');
      const directFileId = textVal.match(/\bfile-[A-Za-z0-9_-]+\b/)?.[0] || null;
      if (directFileId) return directFileId;
      if (textVal.includes('/mnt/data/')) {
        continue;
      }
    }
  }
  return null;
}

async function extractFileIdFromRunSteps(threadId, runId) {
  if (!threadId || !runId) return null;
  try {
    const stepsPage = await openai.beta.threads.runs.steps.list(runId, {
      thread_id: threadId,
      order: 'desc',
    });
    for (const step of stepsPage?.data || []) {
      const details = step?.step_details;
      if (!details || details?.type !== 'tool_calls') continue;
      const toolCalls = Array.isArray(details?.tool_calls) ? details.tool_calls : [];
      for (const tc of toolCalls) {
        if (tc?.type !== 'code_interpreter') continue;
        const outputs = Array.isArray(tc?.code_interpreter?.outputs) ? tc.code_interpreter.outputs : [];
        for (const out of outputs) {
          const fileId = out?.image?.file_id || null;
          if (fileId) return String(fileId);
        }
      }
    }
  } catch (err) {
    console.error('[DEBUG] Failed to inspect run steps for file output:', err?.message || err);
  }
  return null;
}

async function fetchAssistantOutputFile(fileId) {
  if (!fileId) return null;
  try {
    console.log(`[FILE]: Extracting ${fileId} from OpenAI sandbox for terminal download.`);
    const [fileMeta, response] = await Promise.all([
      openai.files.retrieve(fileId),
      openai.files.content(fileId),
    ]);
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      fileId,
      fileName: fileMeta?.filename || `assistant-output-${fileId}`,
      mimeType: response.headers.get('content-type') || 'application/octet-stream',
      base64,
    };
  } catch (err) {
    console.error('[DEBUG] Failed to stream assistant output file:', err?.message || err);
    return null;
  }
}

function inlineDownloadFromFinalText(finalText) {
  const text = String(finalText || '');
  if (!text.trim()) return null;

  const fenced = text.match(/```([^\n`]*)\n([\s\S]*?)```/);
  if (fenced) {
    const lang = String(fenced[1] || '').trim().toLowerCase();
    const content = String(fenced[2] || '');
    if (!content.trim()) return null;
    const langToMeta = {
      css: { ext: 'css', mime: 'text/css' },
      js: { ext: 'js', mime: 'application/javascript' },
      javascript: { ext: 'js', mime: 'application/javascript' },
      ts: { ext: 'ts', mime: 'text/plain' },
      html: { ext: 'html', mime: 'text/html' },
      txt: { ext: 'txt', mime: 'text/plain' },
      plaintext: { ext: 'txt', mime: 'text/plain' },
      text: { ext: 'txt', mime: 'text/plain' },
    };
    const meta = langToMeta[lang] || { ext: 'txt', mime: 'text/plain' };
    return {
      fileId: null,
      fileName: `modified-output.${meta.ext}`,
      mimeType: meta.mime,
      base64: Buffer.from(content, 'utf8').toString('base64'),
    };
  }

  const hasFallbackHint = /optimized content|final modified content|copy and paste this content into a new text file/i.test(text);
  if (!hasFallbackHint) return null;
  return {
    fileId: null,
    fileName: 'modified-output.txt',
    mimeType: 'text/plain',
    base64: Buffer.from(text, 'utf8').toString('base64'),
  };
}

function extractPrimaryFencedBlock(text) {
  const value = String(text || '');
  const match = value.match(/```([^\n`]*)\n([\s\S]*?)```/);
  if (!match) return null;
  return {
    lang: String(match[1] || '').trim().toLowerCase(),
    content: String(match[2] || '').trim(),
  };
}

function normalizeExecutionStyleFallback(text) {
  const raw = String(text || '').trim();
  if (!raw) return raw;

  const hasFailureNarration =
    /it seems there was an issue/i.test(raw)
    || /execution environment error/i.test(raw)
    || /intended modified content instead/i.test(raw)
    || /copy the content above/i.test(raw);
  if (!hasFailureNarration) return raw;

  const fenced = extractPrimaryFencedBlock(raw);
  if (fenced?.content) {
    const lang = fenced.lang || 'txt';
    return `File has been modified successfully.\n\n\`\`\`${lang}\n${fenced.content}\n\`\`\``;
  }

  const marker = raw.match(/#{2,}\s*modified[^:\n]*content\s*:\s*([\s\S]*?)(?:#{2,}\s*next steps|$)/i);
  const extracted = String(marker?.[1] || '').trim();
  if (extracted) {
    return `File has been modified successfully.\n\n\`\`\`txt\n${extracted}\n\`\`\``;
  }

  return raw;
}

function buildConciseExecutionSummary(proposalText = '') {
  const proposal = String(proposalText || '').replace(/\s+/g, ' ').trim();
  const clipped = proposal.length > 140 ? `${proposal.slice(0, 137)}...` : proposal;
  if (!clipped) {
    return 'File updated successfully.\nApplied the requested modification.\nDownload the modified file for full content.';
  }
  return `File updated successfully.\nApplied change: ${clipped}\nDownload the modified file for full content.`;
}

async function buildFinalAssistantPayload(threadId, fallbackMessage, runId = null) {
  console.log(`[DEBUG] Fetching Final Message from Thread: ${threadId}.`);
  const threadMessages = await openai.beta.threads.messages.list(threadId, { limit: 20 });
  const messages = threadMessages?.data || [];
  const runScopedMessage = latestAssistantMessageForRun(messages, runId);
  const latestMessage = runScopedMessage || latestAssistantMessage(messages);
  const rawFinalText = extractTextFromMessages(latestMessage ? [latestMessage] : messages) || fallbackMessage;
  const finalText = normalizeExecutionStyleFallback(rawFinalText);
  const outputFileId =
    extractFileIdFromAssistantMessage(latestMessage)
    || await extractFileIdFromRunSteps(threadId, runId);
  const downloadFile = await fetchAssistantOutputFile(outputFileId);
  if (downloadFile) return { finalText, downloadFile };
  return { finalText, downloadFile: inlineDownloadFromFinalText(finalText) };
}

function riskBandFromStatus(riskStatus = '') {
  const status = String(riskStatus).toUpperCase();
  if (status.includes('HIGH')) return 'HIGH';
  if (status.includes('MEDIUM')) return 'MED';
  return 'LOW';
}

function riskBandFromCategory(riskCategory = '') {
  const category = String(riskCategory).toLowerCase();
  if (category === 'high') return 'HIGH';
  if (category === 'medium') return 'MODERATE';
  return 'LOW';
}

async function pollRunUntilStable(threadId, runId, {
  maxAttempts = 90,
  intervalMs = 1000,
} = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const run = await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
    console.log(`[POLLING]: Run Status: ${run.status}`);
    if (['completed', 'requires_action', 'failed', 'cancelled', 'expired', 'incomplete'].includes(run.status)) {
      return run;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Run polling timed out for run ${runId}`);
}

async function cancelActiveRunsForThread(threadId) {
  try {
    const runsPage = await openai.beta.threads.runs.list(threadId, { limit: 20 });
    const activeStatuses = new Set(['queued', 'in_progress', 'requires_action']);
    for (const run of runsPage?.data || []) {
      if (!activeStatuses.has(run.status)) continue;
      try {
        await openai.beta.threads.runs.cancel(run.id, { thread_id: threadId });
        console.log(`[DEBUG] Cancelled Active Run: ${run.id}`);
      } catch (cancelErr) {
        console.error(`[DEBUG] Failed to cancel run ${run.id}:`, cancelErr?.message || cancelErr);
      }
    }
  } catch (listErr) {
    console.error('[DEBUG] Failed to list active runs:', listErr?.message || listErr);
  }
}

async function deleteUploadedFileSafe(fileId) {
  if (!fileId) return;
  try {
    await openai.files.del(fileId);
  } catch (err) {
    console.warn('[assistant] failed to delete uploaded file:', err?.message || err);
  }
}

async function clearPendingAssistantState(actionId) {
  const pending = pendingAssistantApprovals.get(actionId);
  if (!pending) return;
  pendingAssistantApprovals.delete(actionId);
  await deleteUploadedFileSafe(pending.fileId);
}

// ─── In-memory action store for real-time dashboard ──────────────────────────
const actionStore = [];
let actionIdCounter = 0;
const OVERDUE_REVIEW_MS = 30 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const FINAL_WARNING_MS = 24 * ONE_HOUR_MS;
const overdueReminderState = new Map();

function getOverdueMilestonesMs() {
  const milestones = [OVERDUE_REVIEW_MS];
  for (let h = 1; h <= 24; h += 1) {
    milestones.push(h * ONE_HOUR_MS);
  }
  return milestones;
}

const OVERDUE_MILESTONES_MS = getOverdueMilestonesMs();

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
    user: actionData.user || '',
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

  // Notify when the action is auto-blocked by policy/ML fusion.
  if (actionRecord.riskStatus === 'HIGH_RISK_BLOCKED') {
    createNotification({
      type: 'auto_blocked',
      title: 'Action auto-blocked',
      detail: `${actionRecord.agentName}: ${actionRecord.proposedAction}`,
      actionId: actionRecord.id,
      severity: 'critical',
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

app.post('/api/actions/:id/block', async (req, res) => {
  const action = actionStore.find(a => a.id === req.params.id);
  if (!action) return res.status(404).json({ ok: false, error: 'action not found' });
  action.riskStatus = 'HIGH_RISK_BLOCKED';
  await clearPendingAssistantState(action.id);
  broadcastToClients({ type: 'action_updated', action });
  return res.json({ ok: true, action });
});

app.post('/api/actions/:id/escalate', async (req, res) => {
  const action = actionStore.find(a => a.id === req.params.id);
  if (!action) return res.status(404).json({ ok: false, error: 'action not found' });
  action.riskStatus = 'ESCALATED';
  await clearPendingAssistantState(action.id);
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

// ─── Agent chat (Assistants API flow) ────────────────────────────────────────
app.post('/api/agent/chat', async (req, res) => {
  try {
    const {
      userInput,
      agent,
      isExecutionTurn,
      actionId,
      file,
      threadId,
      sentinel_status,
    } = req.body || {};

    if (isExecutionTurn === true) {
      if (!actionId || typeof actionId !== 'string') {
        return res.status(400).json({ ok: false, error: 'actionId is required for execution turn' });
      }

      const pending = pendingAssistantApprovals.get(actionId);
      if (!pending) {
        return res.status(404).json({ ok: false, error: `No pending assistant run found for action ${actionId}` });
      }

      const action = actionStore.find((a) => a.id === actionId);
      const status = String(action?.riskStatus || '').toUpperCase();
      const sentinelStatus = String(sentinel_status || '').toUpperCase();
      const isRejectedByStatus = sentinelStatus === 'REJECTED'
        || sentinelStatus === 'REJECT'
        || status.includes('BLOCK')
        || status.includes('REJECT');
      const isApprovedByStatus = status.includes('APPROVE') || sentinelStatus === 'APPROVED';
      if (isRejectedByStatus) {
        console.log(`[HANDSHAKE]: Resuming Run ${pending.runId} with Tool Output.`);
        try {
          console.log(`[DEBUG] Submitting output for Tool Call: ${pending.toolCallId}`);
          await openai.beta.threads.runs.submitToolOutputs(pending.runId, {
            thread_id: FIXED_THREAD_ID,
            tool_outputs: [
              {
                tool_call_id: pending.toolCallId,
                output: 'Rejected',
              },
            ],
          });
        } catch (submitErr) {
          console.error('[DEBUG] submitToolOutputs failed:', submitErr?.message || submitErr);
          return res.status(500).json({
            ok: false,
            error: `submitToolOutputs failed: ${String(submitErr?.message || submitErr)}`,
          });
        }
        try {
          await openai.beta.threads.runs.cancel(pending.runId, { thread_id: FIXED_THREAD_ID });
        } catch {
          // no-op: run may already be terminal
        }
        pendingAssistantApprovals.delete(actionId);
        await deleteUploadedFileSafe(pending.fileId);
        return res.json({
          ok: true,
          type: 'text',
          message: 'Sentinel rejected the proposal. Run terminated.',
          threadId: FIXED_THREAD_ID,
        });
      }
      if (!isApprovedByStatus) {
        return res.status(409).json({
          ok: false,
          error: `Action ${actionId} is not approved yet (current status: ${action?.riskStatus || sentinel_status || 'UNKNOWN'})`,
        });
      }

      console.log(`[DEBUG] Using Fixed Thread: ${FIXED_THREAD_ID}`);
      console.log(`[HANDSHAKE]: Resuming Run ${pending.runId} with Tool Output.`);
      try {
        console.log(`[DEBUG] Submitting output for Tool Call: ${pending.toolCallId}`);
        await openai.beta.threads.runs.submitToolOutputs(pending.runId, {
          thread_id: FIXED_THREAD_ID,
          tool_outputs: [
            {
              tool_call_id: pending.toolCallId,
              output: `Approved. ${EXECUTION_OUTPUT_POLICY}`,
            },
          ],
        });
      } catch (submitErr) {
        console.error('[DEBUG] submitToolOutputs failed:', submitErr?.message || submitErr);
        return res.status(500).json({
          ok: false,
          error: `submitToolOutputs failed: ${String(submitErr?.message || submitErr)}`,
        });
      }

      const resumedRun = await pollRunUntilStable(FIXED_THREAD_ID, pending.runId);
      if (resumedRun.status !== 'completed') {
        return res.status(502).json({
          ok: false,
          error: `Assistant run did not complete after approval (status: ${resumedRun.status})`,
        });
      }

      const { finalText, downloadFile } = await buildFinalAssistantPayload(
        FIXED_THREAD_ID,
        'Approval acknowledged. Final output generated.',
        pending.runId
      );
      const summaryText = downloadFile
        ? buildConciseExecutionSummary(action?.proposedAction || userInput)
        : finalText;

      pendingAssistantApprovals.delete(actionId);
      await deleteUploadedFileSafe(pending.fileId);

      return res.json({
        ok: true,
        type: 'text',
        message: summaryText,
        downloadFile,
        threadId: FIXED_THREAD_ID,
      });
    }

    if (!userInput || typeof userInput !== 'string' || !userInput.trim()) {
      return res.status(400).json({ ok: false, error: 'userInput is required' });
    }
    const preMlAssessment = await classifyAction({
      description: userInput,
      proposed_action: userInput,
      context: { targetEnvironment: 'staging' },
    });
    const preMlRiskCategory = String(preMlAssessment?.risk_category || '').toLowerCase();
    const isLowRiskDirectExecute = preMlRiskCategory === 'low';
    console.log(`[ML RISK]: ${riskBandFromCategory(preMlRiskCategory)} detected.`);

    let uploadedFileId = null;
    if (typeof file?.content === 'string' && file.content.length > 0) {
      console.log(`[DEBUG] File Object Picked: ${JSON.stringify({ name: file.name || 'attached-context.txt', size: Buffer.byteLength(file.content, 'utf8') })}`);
      try {
        const upload = await openai.files.create({
          file: await toFile(
            Buffer.from(file.content, 'utf8'),
            file.name || 'attached-context.txt',
            { type: file.type || 'text/plain' }
          ),
          purpose: 'assistants',
        });
        uploadedFileId = upload.id;
        console.log(`[DEBUG] OpenAI Upload Success: ${JSON.stringify({ file_id: uploadedFileId })}`);
        console.log(`[FILE UPLOAD]: File ID received: ${uploadedFileId}`);
      } catch (uploadErr) {
        console.error('[agent/chat] file upload failed:', uploadErr?.message || uploadErr);
        return res.status(500).json({
          ok: false,
          error: `File upload to OpenAI failed: ${String(uploadErr?.message || uploadErr)}`,
        });
      }
    }

    const activeThreadId = FIXED_THREAD_ID;
    void threadId; // Explicitly ignored by design.
    console.log('[DEBUG] Active Thread ID:', activeThreadId);
    console.log(`[DEBUG] Using Fixed Thread: ${FIXED_THREAD_ID}`);
    console.log(`[DEBUG] Incoming Prompt: ${userInput.slice(0, 200)}`);
    await cancelActiveRunsForThread(activeThreadId);

    try {
      const hasUploadedFileContent = typeof file?.content === 'string' && file.content.length > 0;
      const uploadContextMessage = hasUploadedFileContent
        ? `User has uploaded ${file.name || 'attached-context.txt'}. The file is attached for Code Interpreter access.\n\nUser request: ${userInput}`
        : `User says: ${userInput}`;

      await openai.beta.threads.messages.create(activeThreadId, {
        role: 'user',
        content: uploadContextMessage,
        ...(uploadedFileId
          ? {
              attachments: [
                {
                  file_id: uploadedFileId,
                  tools: [{ type: 'code_interpreter' }],
                },
              ],
            }
          : {}),
      });
      if (uploadedFileId) {
        console.log(`[DEBUG] Thread Updated: ${JSON.stringify({ thread_id: activeThreadId })}`);
        console.log(`[THREAD]: Attached to Thread ID: ${activeThreadId}`);
      }
    } catch (threadMsgErr) {
      await deleteUploadedFileSafe(uploadedFileId);
      return res.status(400).json({
        ok: false,
        error: `Failed to append message to thread ${activeThreadId}: ${String(threadMsgErr?.message || threadMsgErr)}`,
      });
    }

    console.log('[DEBUG] Target Assistant:', process.env.ASSISTANT_ID);
    const runCreateParams = {
      assistant_id: ASSISTANT_ID,
      ...(isLowRiskDirectExecute
        ? {
            additional_instructions: `ML interceptor marked this request LOW risk. Execute immediately only if this is an explicit edit request. If this is a clarification/general question, respond with text only and do not call propose_file_edit. ${EXECUTION_OUTPUT_POLICY}`,
          }
        : {
            tool_choice: { type: 'function', function: { name: 'propose_file_edit' } },
            additional_instructions: `ML interceptor marked this request MODERATE/HIGH risk. If and only if the user explicitly requests a file modification, call propose_file_edit before execution. If the user is asking a clarification/general question, respond in text and do not call propose_file_edit. ${EXECUTION_OUTPUT_POLICY}`,
          }),
    };
    const run = await openai.beta.threads.runs.create(activeThreadId, runCreateParams);
    console.log(`[DEBUG] Run Created: ${run.id} on Thread: ${activeThreadId}`);
    const settledRun = await pollRunUntilStable(activeThreadId, run.id);

    if (settledRun.status === 'requires_action') {
      const toolCalls = settledRun.required_action?.submit_tool_outputs?.tool_calls || [];
      const toolCall = toolCalls.find((call) => call?.function?.name === 'propose_file_edit');
      if (!toolCall) {
        await deleteUploadedFileSafe(uploadedFileId);
        return res.status(502).json({
          ok: false,
          error: 'Assistant requested an unsupported tool. Expected propose_file_edit.',
        });
      }
      if (isLowRiskDirectExecute) {
        console.log(`[HANDSHAKE]: Resuming Run ${run.id} with Tool Output.`);
        try {
          console.log(`[DEBUG] Submitting output for Tool Call: ${toolCall.id}`);
          await openai.beta.threads.runs.submitToolOutputs(run.id, {
            thread_id: activeThreadId,
            tool_outputs: [
              {
                tool_call_id: toolCall.id,
                output: `Approved. ${EXECUTION_OUTPUT_POLICY}`,
              },
            ],
          });
        } catch (submitErr) {
          console.error('[DEBUG] submitToolOutputs failed:', submitErr?.message || submitErr);
          await deleteUploadedFileSafe(uploadedFileId);
          return res.status(500).json({
            ok: false,
            error: `submitToolOutputs failed: ${String(submitErr?.message || submitErr)}`,
          });
        }
        const completedRun = await pollRunUntilStable(activeThreadId, run.id);
        if (completedRun.status !== 'completed') {
          await deleteUploadedFileSafe(uploadedFileId);
          return res.status(502).json({
            ok: false,
            error: `Assistant run did not complete after low-risk approval (status: ${completedRun.status})`,
          });
        }
        const { finalText, downloadFile } = await buildFinalAssistantPayload(
          FIXED_THREAD_ID,
          'Execution completed.',
          run.id
        );
        const summaryText = downloadFile
          ? buildConciseExecutionSummary(userInput)
          : finalText;
        await deleteUploadedFileSafe(uploadedFileId);
        return res.json({
          ok: true,
          type: 'text',
          message: summaryText,
          downloadFile,
          threadId: activeThreadId,
        });
      }

      const parsedArguments = parseJsonSafe(toolCall.function?.arguments || '{}');
      const proposedAction = parsedArguments?.proposed_action || userInput;
      const env = parsedArguments?.env || 'STAGING';
      const aiFlaggingReasons = Array.isArray(parsedArguments?.ai_flagging_reasons)
        ? parsedArguments.ai_flagging_reasons
        : [];

      const actionData = {
        agent_name: agent || 'OpenAI-Agent',
        proposed_action: proposedAction,
        action_type: 'CONFIG_CHANGE',
        environment: env,
        description: parsedArguments?.file_context?.change_summary || proposedAction,
        context: {
          ...(parsedArguments?.file_context || {}),
          ai_flagging_reasons: aiFlaggingReasons,
          openai_thread_id: activeThreadId,
          openai_run_id: run.id,
          openai_file_id: uploadedFileId,
        },
        user: 'Anonymous User',
      };

      const record = await processAction(actionData);
      console.log(`[ML RISK]: ${riskBandFromStatus(record?.riskStatus)} detected.`);

      pendingAssistantApprovals.set(record.id, {
        threadId: activeThreadId,
        runId: run.id,
        toolCallId: toolCall.id,
        fileId: uploadedFileId,
      });

      return res.json({
        ok: true,
        type: 'tool_call',
        actionId: record.id,
        threadId: activeThreadId,
        message: `Action proposed: "${record.proposedAction}". Risk: ${record.riskScore}% (${record.riskStatus}). Awaiting Sentinel governance decision.`,
      });
    }

    if (settledRun.status === 'completed') {
      const { finalText, downloadFile } = await buildFinalAssistantPayload(
        FIXED_THREAD_ID,
        'No response generated.',
        run.id
      );
      const summaryText = downloadFile
        ? buildConciseExecutionSummary(userInput)
        : finalText;
      await deleteUploadedFileSafe(uploadedFileId);
      return res.json({
        ok: true,
        type: 'text',
        message: summaryText,
        downloadFile,
        threadId: activeThreadId,
      });
    }

    await deleteUploadedFileSafe(uploadedFileId);
    return res.status(502).json({
      ok: false,
      error: `Assistant run failed with status: ${settledRun.status}`,
    });
  } catch (e) {
    console.error('[agent/chat] Error:', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
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

function emitOverdueReviewNotifications() {
  const nowMs = Date.now();
  for (const action of actionStore) {
    const isPending = action.riskStatus === 'HIGH_RISK_PENDING' || action.riskStatus === 'MEDIUM_RISK_PENDING';
    if (!isPending) {
      overdueReminderState.delete(action.id);
      continue;
    }

    const createdAtMs = new Date(action.timestampISO).getTime();
    if (!Number.isFinite(createdAtMs)) continue;
    const elapsedMs = nowMs - createdAtMs;
    if (elapsedMs < OVERDUE_REVIEW_MS) continue;

    let sentMilestones = overdueReminderState.get(action.id);
    if (!sentMilestones) {
      sentMilestones = new Set();
      overdueReminderState.set(action.id, sentMilestones);
    }

    for (const milestoneMs of OVERDUE_MILESTONES_MS) {
      if (elapsedMs < milestoneMs || sentMilestones.has(milestoneMs)) {
        continue;
      }

      const hours = Math.floor(milestoneMs / ONE_HOUR_MS);
      const isFinalWarning = milestoneMs === FINAL_WARNING_MS;
      const title = isFinalWarning
        ? 'Final warning: pending review for 24h'
        : 'Overdue review, pls review asap';
      const detail = milestoneMs < ONE_HOUR_MS
        ? `${action.agentName}: ${action.proposedAction}`
        : `${action.agentName}: ${action.proposedAction} (still pending for ${hours}h)`;

      createNotification({
        type: isFinalWarning ? 'overdue_review_final' : 'overdue_review',
        title,
        detail,
        actionId: action.id,
        severity: action.riskStatus === 'HIGH_RISK_PENDING' || isFinalWarning ? 'critical' : 'warning',
      });
      sentMilestones.add(milestoneMs);
      break;
    }
  }
}

setInterval(emitOverdueReviewNotifications, 5 * 1000);

app.get('/api/notifications', (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 50));
  return res.json({ ok: true, ...listNotifications(limit) });
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
