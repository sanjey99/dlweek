import crypto from 'crypto';

function nowIso() {
  return new Date().toISOString();
}

function generateActionId() {
  return `act_${crypto.randomUUID().slice(0, 8)}`;
}

export function createActionLifecycleStore() {
  const actions = new Map();
  const events = [];
  let sequence = 0;
  let ledgerHash = 'GENESIS';

  function hashEventParts(parts) {
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  }

  function appendEvent(actionId, type, details = {}) {
    sequence += 1;
    const ts = nowIso();
    const detailsCopy = JSON.parse(JSON.stringify(details));
    const currentHash = hashEventParts([String(sequence), actionId, type, ts, JSON.stringify(detailsCopy), ledgerHash]);
    const event = Object.freeze({
      id: `evt_${crypto.randomUUID().slice(0, 8)}`,
      seq: sequence,
      actionId,
      type,
      details: Object.freeze(detailsCopy),
      ts,
      prevHash: ledgerHash,
      hash: currentHash,
    });
    ledgerHash = currentHash;
    events.push(event);
    return event;
  }

  function saveProposal({ action, context, policy }) {
    const actionId = generateActionId();
    const status = policy.decision === 'allow'
      ? 'approved_auto'
      : policy.decision === 'review'
        ? 'pending_review'
        : 'blocked';

    const record = Object.freeze({
      actionId,
      action: JSON.parse(JSON.stringify(action)),
      context: JSON.parse(JSON.stringify(context)),
      policy: JSON.parse(JSON.stringify(policy)),
      status,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      resolution: null,
    });
    actions.set(actionId, record);
    appendEvent(actionId, 'policy_evaluated', { decision: policy.decision, status });
    return record;
  }

  function getAction(actionId) {
    return actions.get(actionId) || null;
  }

  function listActions() {
    return [...actions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function resolveAction(actionId, { resolution, actor }) {
    const record = actions.get(actionId);
    if (!record) return null;
    const updated = Object.freeze({
      ...record,
      status: resolution.status,
      resolution: Object.freeze({
        type: resolution.type,
        notes: resolution.notes || null,
        actor: actor || 'human-reviewer',
        ts: nowIso(),
      }),
      updatedAt: nowIso(),
    });
    actions.set(actionId, updated);
    appendEvent(actionId, `action_${resolution.type}`, { status: updated.status, actor: updated.resolution.actor });
    return updated;
  }

  function listEvents(actionId) {
    if (!actionId) return [...events].sort((a, b) => a.seq - b.seq);
    return events.filter((evt) => evt.actionId === actionId).sort((a, b) => a.seq - b.seq);
  }

  function getEventLedgerState() {
    return {
      lastSequence: sequence,
      lastHash: ledgerHash,
      totalEvents: events.length,
    };
  }

  return {
    saveProposal,
    getAction,
    listActions,
    resolveAction,
    listEvents,
    getEventLedgerState,
  };
}

export function validateActionProposalPayload(body) {
  if (!body || typeof body !== 'object') return 'body must be an object';
  if (!body.action || typeof body.action !== 'object') return 'action must be an object';
  if (typeof body.action.type !== 'string' || body.action.type.trim().length === 0) {
    return 'action.type must be a non-empty string';
  }
  if (!body.context || typeof body.context !== 'object') return 'context must be an object';
  return null;
}

export function validateActionResolutionPayload(body) {
  if (!body || typeof body !== 'object') return 'body must be an object';
  if (typeof body.actionId !== 'string' || body.actionId.trim().length === 0) {
    return 'actionId must be a non-empty string';
  }
  return null;
}

