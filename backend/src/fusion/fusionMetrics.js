/**
 * Fusion Metrics – Lightweight in-memory counters  (ARCH-CORE-P3)
 *
 * Tracks request volume and decision distribution without external deps.
 * Designed for the /api/governance/fusion/health endpoint and future
 * Prometheus scrape adapter.
 *
 * All counters reset on process restart (stateless by design).
 */

const counters = {
  total_requests: 0,

  // Decision distribution
  decision_allow: 0,
  decision_review: 0,
  decision_block: 0,

  // Staleness distribution
  stale_fresh: 0,
  stale_stale: 0,
  stale_unknown: 0,

  // ML presence
  ml_present: 0,
  ml_absent: 0,

  // Hard-policy blocks (bypassed ML entirely)
  hard_block: 0,

  // Uncertainty guard escalations
  uncertainty_escalation: 0,

  // Errors (validation failures / unexpected throws)
  errors: 0,
};

const _startedAt = new Date().toISOString();

/**
 * Increment a named counter.  Silently ignores unknown keys.
 * @param {string} name
 * @param {number} [amount=1]
 */
export function increment(name, amount = 1) {
  if (name in counters) {
    counters[name] += amount;
  }
}

/**
 * Record a fusion result into the appropriate counters.
 * Call this once per evaluation from the route handler.
 *
 * @param {object} fusionResult - the envelope from evaluate()
 */
export function recordDecision(fusionResult) {
  increment('total_requests');

  // Decision
  const d = fusionResult.decision;
  if (d === 'allow') increment('decision_allow');
  else if (d === 'review') increment('decision_review');
  else if (d === 'block') increment('decision_block');

  // Staleness
  const s = fusionResult.stale_state;
  if (s === 'fresh') increment('stale_fresh');
  else if (s === 'stale') increment('stale_stale');
  else increment('stale_unknown');

  // ML presence
  const src = fusionResult.source ?? '';
  if (src.includes('ml')) increment('ml_present');
  else increment('ml_absent');

  // Hard-block
  if (fusionResult.reason_tags?.includes('HARD_POLICY_BLOCK')) {
    increment('hard_block');
  }

  // Uncertainty guard
  if (fusionResult.reason_tags?.includes('UNCERTAINTY_GUARD_ESCALATION')) {
    increment('uncertainty_escalation');
  }
}

/**
 * Return a read-only snapshot of all current counters.
 * @returns {object}
 */
export function snapshot() {
  return { ...counters, started_at: _startedAt };
}

/**
 * Reset all counters to zero (test helper).
 */
export function resetMetrics() {
  for (const key of Object.keys(counters)) {
    counters[key] = 0;
  }
}
