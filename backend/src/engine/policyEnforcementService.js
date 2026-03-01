import { evaluatePolicyGate } from './policyGate.js';
import {
  createActionLifecycleStore,
  validateActionProposalPayload,
  validateActionResolutionPayload,
} from './actionLifecycle.js';

function asDecisionContract(policy) {
  return {
    decision: policy.decision,
    reasonTags: policy.reasonTags,
    confidence: policy.confidence,
  };
}

function toError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const RESOLUTION_CONFIG = {
  approve: { type: 'approve', status: 'approved_by_human', reasonTag: 'HUMAN_APPROVED', decision: 'allow' },
  block: { type: 'block', status: 'blocked_by_human', reasonTag: 'HUMAN_BLOCKED', decision: 'block' },
  escalate: { type: 'escalate', status: 'escalated', reasonTag: 'ESCALATED_FOR_REVIEW', decision: 'review' },
};

export function createPolicyEnforcementService(store = createActionLifecycleStore()) {
  function propose(payload) {
    const validationError = validateActionProposalPayload(payload);
    if (validationError) throw toError(400, validationError);

    const policy = evaluatePolicyGate({ action: payload.action, context: payload.context });
    const record = store.saveProposal({
      action: payload.action,
      context: payload.context,
      policy,
    });

    return {
      packetId: 'BE-P2',
      actionId: record.actionId,
      status: record.status,
      ...asDecisionContract(policy),
      policy,
    };
  }

  function resolve(payload, resolutionKind) {
    const config = RESOLUTION_CONFIG[resolutionKind];
    if (!config) throw toError(400, 'invalid resolution type');

    const validationError = validateActionResolutionPayload(payload);
    if (validationError) throw toError(400, validationError);

    const record = store.getAction(payload.actionId);
    if (!record) throw toError(404, 'action not found');

    const actor = typeof payload.actor === 'string' && payload.actor.trim().length > 0
      ? payload.actor.trim()
      : 'human-reviewer';
    const notes = typeof payload.notes === 'string' ? payload.notes : null;

    const updated = store.resolveAction(record.actionId, {
      actor,
      resolution: { ...config, notes },
    });

    const policyContract = {
      decision: config.decision,
      reasonTags: [...record.policy.reasonTags, config.reasonTag],
      confidence: record.policy.confidence,
    };

    return {
      packetId: 'BE-P2',
      actionId: updated.actionId,
      status: updated.status,
      ...policyContract,
      policy: {
        ...record.policy,
        ...policyContract,
      },
      resolution: updated.resolution,
    };
  }

  function detail(actionId) {
    const record = store.getAction(actionId);
    if (!record) throw toError(404, 'action not found');
    return { action: record, events: store.listEvents(actionId) };
  }

  return {
    propose,
    resolve,
    detail,
  };
}
