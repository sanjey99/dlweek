import { evaluatePolicyGate } from './policyGate.js';
import {
  createActionLifecycleStore,
  validateActionProposalPayload,
  validateActionResolutionPayload,
} from './actionLifecycle.js';
import { normalizeMlAssessmentForGovernance } from './mlContract.js';

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

const ALLOWED_TRANSITIONS = {
  pending_review: new Set(['approve', 'block', 'escalate']),
  blocked: new Set([]),
  approved_auto: new Set([]),
  approved_by_human: new Set([]),
  blocked_by_human: new Set([]),
  escalated: new Set(['approve', 'block']),
};

export function createPolicyEnforcementService(store = createActionLifecycleStore()) {
  function propose(payload) {
    const validationError = validateActionProposalPayload(payload);
    if (validationError) throw toError(400, validationError);

    const ml = normalizeMlAssessmentForGovernance(payload);
    const mergedContext = {
      ...payload.context,
      riskScore: ml.mlAssessment.risk_score,
      mlConfidence: ml.mlAssessment.confidence,
    };
    const policy = evaluatePolicyGate({ action: payload.action, context: mergedContext });
    const policyWithFallbackTags = {
      ...policy,
      reasonTags: ml.usedFallback
        ? [...policy.reasonTags, 'ML_CONTRACT_FALLBACK_USED']
        : [...policy.reasonTags],
    };
    const record = store.saveProposal({
      action: payload.action,
      context: mergedContext,
      policy: policyWithFallbackTags,
    });

    return {
      packetId: 'BE-P3',
      actionId: record.actionId,
      status: record.status,
      ...asDecisionContract(policyWithFallbackTags),
      policy: policyWithFallbackTags,
      ml_contract: {
        strict_valid: ml.strictContractValid,
        used_fallback: ml.usedFallback,
        validation_error: ml.validationError,
      },
      realtime: {
        source: ml.mlAssessment.source,
        timestamp: ml.mlAssessment.timestamp,
        stale_state: ml.mlAssessment.stale_state,
      },
    };
  }

  function resolve(payload, resolutionKind) {
    const config = RESOLUTION_CONFIG[resolutionKind];
    if (!config) throw toError(400, 'invalid resolution type');

    const validationError = validateActionResolutionPayload(payload);
    if (validationError) throw toError(400, validationError);

    const record = store.getAction(payload.actionId);
    if (!record) throw toError(404, 'action not found');
    const allowedTransitions = ALLOWED_TRANSITIONS[record.status] || new Set();
    if (!allowedTransitions.has(resolutionKind)) {
      throw toError(409, `invalid transition: status=${record.status} cannot apply ${resolutionKind}`);
    }

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
      packetId: 'BE-P3',
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
    return {
      action: record,
      events: store.listEvents(actionId),
      ledger: store.getEventLedgerState(),
    };
  }

  return {
    propose,
    resolve,
    detail,
  };
}
