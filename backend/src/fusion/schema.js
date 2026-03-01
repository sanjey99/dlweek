/**
 * Fusion Evaluator – Schema & validation
 * Validates incoming payloads and outgoing envelopes.
 */

const VALID_DECISIONS = ['allow', 'review', 'block'];

const RISK_CATEGORIES = ['low', 'medium', 'high', 'critical'];

const STALE_STATES = ['fresh', 'stale', 'unknown'];

/**
 * Validate a Fusion Evaluator request payload.
 * Returns null when valid, or a human-readable error string.
 */
export function validateFusionPayload(body) {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';

  // -- action --
  if (!body.action || typeof body.action !== 'object') return 'action must be an object';
  if (typeof body.action.type !== 'string' || body.action.type.trim().length === 0) {
    return 'action.type must be a non-empty string';
  }

  // -- context --
  if (!body.context || typeof body.context !== 'object') return 'context must be an object';

  // -- ml_output (optional but typed when present) --
  if (body.ml_output !== undefined) {
    if (typeof body.ml_output !== 'object' || body.ml_output === null) {
      return 'ml_output must be an object when provided';
    }
  }

  return null;
}

/**
 * Shape-check the outgoing Fusion Evaluator response envelope.
 * Used in tests / self-repair assertions.
 */
export function assertFusionResponseShape(resp) {
  const required = ['decision', 'reason_tags', 'risk_category', 'risk_score', 'uncertainty', 'source', 'timestamp', 'stale_state', 'policy_version', 'model_version'];
  const missing = required.filter((k) => !(k in resp));
  if (missing.length) throw new Error(`Fusion response missing fields: ${missing.join(', ')}`);
  if (!VALID_DECISIONS.includes(resp.decision)) throw new Error(`Invalid decision: ${resp.decision}`);
  if (!RISK_CATEGORIES.includes(resp.risk_category)) throw new Error(`Invalid risk_category: ${resp.risk_category}`);
  if (!STALE_STATES.includes(resp.stale_state)) throw new Error(`Invalid stale_state: ${resp.stale_state}`);
  if (!Array.isArray(resp.reason_tags)) throw new Error('reason_tags must be an array');
  if (typeof resp.policy_version !== 'string') throw new Error('policy_version must be a string');
  if (typeof resp.model_version !== 'string') throw new Error('model_version must be a string');
  return true;
}

export { VALID_DECISIONS, RISK_CATEGORIES, STALE_STATES };
