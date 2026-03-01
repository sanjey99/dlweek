/**
 * Compatibility adapters for the Fusion Evaluator.
 *
 * Maps legacy request shapes to the Fusion Evaluator input format,
 * and maps the Fusion Evaluator output back to legacy response shapes,
 * so that existing consumers (frontend, ML pipeline, CI) keep working.
 */

/**
 * Convert an old-style policy-gate request into a fusion request.
 * Legacy callers may not send `ml_output`, so we leave it undefined.
 */
export function legacyPolicyGateToFusion(body) {
  return {
    action: body.action,
    context: body.context ?? {},
    ml_output: body.ml_output ?? body.mlOutput ?? undefined,
  };
}

/**
 * Convert the fusion response envelope to the old policy-gate shape,
 * so `/api/policy/gate` and `/api/risk/gate` keep returning the same format.
 */
export function fusionToLegacyPolicyGate(fusion) {
  return {
    decision: fusion.decision,
    reasonTags: fusion.reason_tags,
    confidence: fusion.detail?.policy?.confidence ?? {
      decision: 1 - fusion.uncertainty,
      policy: 1 - fusion.uncertainty,
      model: 0,
    },
    risk: {
      score: fusion.risk_score,
      ruleScore: fusion.detail?.policy?.rule_risk ?? fusion.risk_score,
      modelScore: fusion.detail?.policy?.model_risk ?? 0,
    },
    actionType: fusion.detail?.policy?.action_type ?? 'UNKNOWN',
  };
}
