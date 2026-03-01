const VALID_DECISIONS = ['allow', 'review', 'block'];

const ACTION_RISK_BASELINE = {
  READ: 0.15,
  COMMENT: 0.2,
  OPEN_PR: 0.35,
  RUN_TESTS: 0.25,
  MERGE_MAIN: 0.65,
  DEPLOY_STAGING: 0.55,
  DEPLOY_PROD: 0.85,
  UPDATE_INFRA: 0.78,
  DELETE_RESOURCE: 0.92,
  ROTATE_SECRET: 0.88,
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeActionType(actionType) {
  if (typeof actionType !== 'string' || actionType.trim().length === 0) return 'UNKNOWN';
  return actionType.trim().toUpperCase().replaceAll('-', '_');
}

function pushReason(reasons, tag) {
  if (!reasons.includes(tag)) reasons.push(tag);
}

export function validatePolicyGatePayload(body) {
  if (!body || typeof body !== 'object') return 'body must be an object';
  if (!body.action || typeof body.action !== 'object') return 'action must be an object';
  if (typeof body.action.type !== 'string' || body.action.type.trim().length === 0) {
    return 'action.type must be a non-empty string';
  }
  if (!body.context || typeof body.context !== 'object') return 'context must be an object';
  return null;
}

export function evaluatePolicyGate(input) {
  const actionType = normalizeActionType(input.action?.type);
  const context = input.context || {};
  const reasons = [];

  const baseRisk = ACTION_RISK_BASELINE[actionType] ?? 0.5;
  const mlRisk = clamp01(Number(context.mlRiskScore ?? context.riskScore ?? 0));
  const mlConfidence = clamp01(Number(context.mlConfidence ?? context.modelConfidence ?? 0.5));
  const testsPassing = context.testsPassing !== false;
  const hasApproval = context.hasHumanApproval === true;
  const touchesCritical = context.touchesCriticalPaths === true;
  const isProdTarget = context.targetEnvironment === 'prod' || context.targetEnvironment === 'production';
  const destructive = context.destructive === true;
  const rollbackReady = context.rollbackPlanPresent === true;

  let ruleRisk = baseRisk;
  if (!testsPassing) {
    ruleRisk += 0.14;
    pushReason(reasons, 'MISSING_TEST_EVIDENCE');
  }
  if (touchesCritical) {
    ruleRisk += 0.12;
    pushReason(reasons, 'CRITICAL_PATH_CHANGE');
  }
  if (isProdTarget) {
    ruleRisk += 0.1;
    pushReason(reasons, 'PRODUCTION_TARGET');
  }
  if (destructive) {
    ruleRisk += 0.2;
    pushReason(reasons, 'DESTRUCTIVE_OPERATION');
  }
  if (!rollbackReady) {
    ruleRisk += 0.08;
    pushReason(reasons, 'NO_ROLLBACK_PLAN');
  }

  const normalizedRuleRisk = clamp01(ruleRisk);
  const finalRisk = clamp01((normalizedRuleRisk * 0.65) + (mlRisk * 0.35));
  const policyConfidence = clamp01(0.55 + ((1 - Math.abs(normalizedRuleRisk - mlRisk)) * 0.45));
  const decisionConfidence = clamp01((policyConfidence * 0.6) + (mlConfidence * 0.4));

  let decision = 'allow';
  if (finalRisk >= 0.8) decision = 'block';
  else if (finalRisk >= 0.45) decision = 'review';

  if (decision !== 'allow' && hasApproval && finalRisk < 0.85) {
    decision = 'review';
    pushReason(reasons, 'HUMAN_APPROVAL_PRESENT');
  }

  if (decision === 'allow') pushReason(reasons, 'RISK_WITHIN_POLICY');
  if (decision === 'review') pushReason(reasons, 'REQUIRES_HUMAN_REVIEW');
  if (decision === 'block') pushReason(reasons, 'POLICY_BLOCK_THRESHOLD');

  return {
    decision: VALID_DECISIONS.includes(decision) ? decision : 'review',
    reasonTags: reasons,
    confidence: {
      decision: +decisionConfidence.toFixed(3),
      policy: +policyConfidence.toFixed(3),
      model: +mlConfidence.toFixed(3),
    },
    risk: {
      score: +finalRisk.toFixed(3),
      ruleScore: +normalizedRuleRisk.toFixed(3),
      modelScore: +mlRisk.toFixed(3),
    },
    actionType,
  };
}
