/**
 * Fusion Logger – Structured decision logging  (ARCH-CORE-P3)
 *
 * Emits structured JSON log lines for every fusion evaluation.
 * Designed for grep-ability, downstream ingestion, and audit compliance.
 *
 * Each log entry contains the full decision context — no PII, no raw payloads.
 */

let _requestCounter = 0;

/**
 * Generate a monotonic request ID for correlation.
 * Format: `fusion-<epoch>-<seq>`
 */
export function generateRequestId() {
  _requestCounter += 1;
  return `fusion-${Date.now()}-${_requestCounter}`;
}

/**
 * Reset the internal counter (test helper).
 */
export function _resetCounter() {
  _requestCounter = 0;
}

/**
 * Build a structured log entry from a fusion result + request metadata.
 *
 * @param {object} opts
 * @param {string} opts.requestId
 * @param {string} opts.route           - e.g. '/api/governance/fusion'
 * @param {object} opts.fusionResult    - the envelope returned by evaluate()
 * @param {number} opts.durationMs      - wall-clock evaluation time
 * @param {string} [opts.clientIp]      - optional, for rate-limit correlation
 * @returns {object} structured log entry (not yet serialised)
 */
export function buildLogEntry({ requestId, route, fusionResult, durationMs, clientIp }) {
  return {
    level: 'info',
    event: 'fusion_decision',
    requestId,
    route,
    timestamp: fusionResult.timestamp ?? new Date().toISOString(),
    decision: fusionResult.decision,
    reason_tags: fusionResult.reason_tags,
    risk_score: fusionResult.risk_score,
    risk_category: fusionResult.risk_category,
    uncertainty: fusionResult.uncertainty,
    stale_state: fusionResult.stale_state,
    source: fusionResult.source,
    policy_version: fusionResult.policy_version,
    model_version: fusionResult.model_version,
    durationMs,
    ...(clientIp ? { clientIp } : {}),
  };
}

/**
 * Emit a structured fusion decision log line.
 * Writes to stdout as newline-delimited JSON for container / CloudWatch compatibility.
 */
export function logDecision(opts) {
  const entry = buildLogEntry(opts);
  // Use process.stdout.write to avoid console.log's newline quirks
  process.stdout.write(JSON.stringify(entry) + '\n');
  return entry;
}
