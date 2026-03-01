/**
 * Fusion Evaluator – Core engine
 *
 * Decision source-of-truth: merges deterministic policy rules with ML output
 * to produce a single governance verdict.
 *
 * Input  : { action, context, ml_output? }
 * Output : { decision, reason_tags, risk_category, risk_score, uncertainty,
 *            source, timestamp, stale_state }
 */

import { evaluatePolicyGate } from '../engine/policyGate.js';
import { VALID_DECISIONS, RISK_CATEGORIES } from './schema.js';

// ─── helpers ───────────────────────────────────────────────────────────────────

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function riskCategory(score) {
  if (score >= 0.8) return 'critical';
  if (score >= 0.55) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function pushReason(arr, tag) {
  if (!arr.includes(tag)) arr.push(tag);
}

const DEFAULT_STALE_THRESHOLD_MS = Number(process.env.FUSION_STALE_THRESHOLD_MS ?? 60_000);

function parseIsoMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Returns: { state: 'fresh'|'stale'|'unknown', ageMs: number|null }
 */
function getFreshnessState(mlOutput, thresholdMs = DEFAULT_STALE_THRESHOLD_MS) {
  const ts = parseIsoMs(mlOutput?.timestamp);
  if (ts == null) return { state: 'unknown', ageMs: null };

  const ageMs = Date.now() - ts;
  if (!Number.isFinite(ageMs)) return { state: 'unknown', ageMs: null };

  return {
    state: ageMs > thresholdMs ? 'stale' : 'fresh',
    ageMs,
  };
}

// ─── source attribution ────────────────────────────────────────────────────────

function resolveSource(hasPolicy, hasMl, mlStale) {
  if (hasPolicy && hasMl && !mlStale) return 'policy+ml';
  if (hasPolicy && hasMl && mlStale) return 'policy+ml(stale)';
  if (hasPolicy) return 'policy-only';
  return 'ml-only';
}

// ─── main evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate a governance decision by fusing policy rules and ML output.
 *
 * @param {{ action: object, context: object, ml_output?: object }} input
 * @returns {object} Fusion envelope
 */
export function evaluate(input) {
  const { action, context, ml_output: mlRaw } = input;
  const reasons = [];

  // ── 1. Policy-gate evaluation ─────────────────────────────────────────────
  const policyResult = evaluatePolicyGate({ action, context });

  // ── 2. ML-side signals ────────────────────────────────────────────────────
  const mlProvided = mlRaw != null && typeof mlRaw === 'object';
  const freshness = mlProvided ? getFreshnessState(mlRaw) : { state: 'unknown', ageMs: null };
  const mlStale = freshness.state === 'stale' || freshness.state === 'unknown';

  const mlRiskScore = mlProvided ? clamp01(Number(mlRaw.risk_score ?? mlRaw.riskScore ?? 0)) : 0;
  const mlUncertainty = mlProvided ? clamp01(Number(mlRaw.uncertainty ?? 0.5)) : 1;
  const mlDecisionHint = mlProvided && VALID_DECISIONS.includes(mlRaw.decision) ? mlRaw.decision : null;
  const mlLabel = mlProvided ? (mlRaw.label ?? mlRaw.anomaly?.label ?? null) : null;

  // ── 3. Fuse risk scores ───────────────────────────────────────────────────
  //    Weight policy 60%, ML 40%.  When ML is stale, policy weight rises.
  const policyWeight = mlStale ? 0.85 : 0.60;
  const mlWeight = 1 - policyWeight;

  const fusedRisk = clamp01(
    policyResult.risk.score * policyWeight + mlRiskScore * mlWeight,
  );

  // ── 4. Determine uncertainty ──────────────────────────────────────────────
  //    Base: policy confidence + ML uncertainty, penalise staleness.
  let uncertainty = clamp01(
    (1 - policyResult.confidence.decision) * 0.5 + mlUncertainty * 0.3 + (mlStale ? 0.2 : 0),
  );
  // If ML and policy disagree on direction, boost uncertainty
  if (mlDecisionHint && mlDecisionHint !== policyResult.decision) {
    uncertainty = clamp01(uncertainty + 0.15);
    pushReason(reasons, 'POLICY_ML_DISAGREEMENT');
  }

  // ── 5. Final decision ─────────────────────────────────────────────────────
  let decision;
  if (fusedRisk >= 0.8) {
    decision = 'block';
  } else if (fusedRisk >= 0.45) {
    decision = 'review';
  } else {
    decision = 'allow';
  }

  // If ML says anomaly and policy said allow, escalate to review
  if (mlLabel === 'anomaly' && decision === 'allow') {
    decision = 'review';
    pushReason(reasons, 'ML_ANOMALY_ESCALATION');
  }

  // Human approval override (cannot override critical blocks)
  if (decision !== 'allow' && context.hasHumanApproval === true && fusedRisk < 0.85) {
    decision = 'review';
    pushReason(reasons, 'HUMAN_APPROVAL_OVERRIDE');
  }

  // ── 6. Collect reason tags ────────────────────────────────────────────────
  // Inherit from policy gate
  if (policyResult.reasonTags) policyResult.reasonTags.forEach((t) => pushReason(reasons, t));

  // Add fusion-specific reasons
  if (freshness.state === 'stale') pushReason(reasons, 'ML_DATA_STALE');
  if (freshness.state === 'unknown') pushReason(reasons, 'ML_DATA_UNKNOWN');
  if (!mlProvided) pushReason(reasons, 'ML_OUTPUT_ABSENT');
  if (decision === 'allow') pushReason(reasons, 'FUSED_RISK_ACCEPTABLE');
  if (decision === 'review') pushReason(reasons, 'FUSED_REVIEW_REQUIRED');
  if (decision === 'block') pushReason(reasons, 'FUSED_BLOCK_THRESHOLD');

  // ── 7. Build envelope ─────────────────────────────────────────────────────
  const source = resolveSource(true, mlProvided, mlStale);
  const timestamp = new Date().toISOString();

  return {
    decision,
    reason_tags: reasons,
    risk_category: riskCategory(fusedRisk),
    risk_score: +fusedRisk.toFixed(4),
    uncertainty: +uncertainty.toFixed(4),
    source,
    timestamp,
    stale_state: freshness.state, // tri-state: fresh | stale | unknown
    threshold_ms: DEFAULT_STALE_THRESHOLD_MS,
    // backward compat boolean
    stale: freshness.state !== 'fresh',
    // Extended detail (non-breaking additions)
    detail: {
      policy: {
        decision: policyResult.decision,
        risk_score: policyResult.risk.score,
        rule_risk: policyResult.risk.ruleScore,
        model_risk: policyResult.risk.modelScore,
        confidence: policyResult.confidence,
        action_type: policyResult.actionType,
        reason_tags: policyResult.reasonTags,
      },
      ml: mlProvided
        ? {
            risk_score: mlRiskScore,
            uncertainty: mlUncertainty,
            label: mlLabel,
            decision_hint: mlDecisionHint,
            stale_state: freshness.state,
            raw_timestamp: mlRaw.timestamp ?? null,
            age_ms: freshness.ageMs,
          }
        : null,
      weights: { policy: policyWeight, ml: mlWeight },
    },
  };
}
