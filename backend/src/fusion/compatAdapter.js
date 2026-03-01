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
 * Convert a legacy finance-style payload into a fusion request.
 *
 * Finance payloads use keys like:
 *   { transaction_type, amount, currency, account_id, risk_flags, ... }
 *
 * This adapter maps them into the standard fusion input shape and
 * logs a deprecation warning so consumers know to migrate.
 *
 * @param {object} body  Legacy finance payload
 * @returns {{ fusionInput: object, deprecated: boolean }}
 */
export function legacyFinanceToFusion(body) {
  const hasFinanceKeys = 'transaction_type' in body || 'amount' in body;
  if (!hasFinanceKeys) return { fusionInput: null, deprecated: false };

  console.warn(
    '[DEPRECATION] Legacy finance payload detected — migrate to { action, context, ml_output } shape. ' +
    'See docs/POLICY_RULES.md for the canonical contract.',
  );

  const txType = body.transaction_type ?? body.transactionType ?? 'UNKNOWN';
  const amount = Number(body.amount ?? 0);
  const riskFlags = body.risk_flags ?? body.riskFlags ?? [];

  return {
    fusionInput: {
      action: { type: txType },
      context: {
        amount,
        currency: body.currency ?? 'USD',
        accountId: body.account_id ?? body.accountId ?? null,
        riskFlags,
        // Map finance-specific context hints
        destructive: riskFlags.includes('irreversible') || amount > 100_000,
        targetEnvironment: body.environment ?? 'prod',
        testsPassing: body.verified !== false,
        rollbackPlanPresent: body.reversible === true,
        hasHumanApproval: body.approved === true,
      },
      ml_output: body.ml_output ?? body.mlOutput ?? undefined,
    },
    deprecated: true,
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
