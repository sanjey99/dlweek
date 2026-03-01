/**
 * Fusion Audit Store – Append-only in-memory decision trail  (ARCH-CORE-P4)
 *
 * Stores every fusion evaluation for later retrieval via API.
 * Designed as a persistence-ready abstraction — swap the backing store
 * to Postgres / Redis later without changing the public interface.
 *
 * Safety: capped at FUSION_AUDIT_MAX records; oldest-drop when full.
 */

const DEFAULT_MAX = 5000;

export function createAuditStore(maxRecords = Number(process.env.FUSION_AUDIT_MAX ?? DEFAULT_MAX)) {
  /** @type {Array<object>} */
  const records = [];

  /**
   * Append an audit record.  Drops oldest if at capacity.
   *
   * @param {object} opts
   * @param {string} opts.request_id
   * @param {string} opts.decision
   * @param {string[]} opts.reason_tags
   * @param {number} opts.risk_score
   * @param {number} opts.uncertainty
   * @param {string} opts.stale_state
   * @param {string} opts.source
   * @param {string} opts.policy_version
   * @param {string} opts.model_version
   * @param {string} opts.timestamp
   * @param {string} opts.route
   * @returns {object} the stored record
   */
  function append(opts) {
    const record = {
      request_id: opts.request_id,
      decision: opts.decision,
      reason_tags: opts.reason_tags,
      risk_score: opts.risk_score,
      uncertainty: opts.uncertainty,
      stale_state: opts.stale_state,
      source: opts.source,
      policy_version: opts.policy_version,
      model_version: opts.model_version,
      timestamp: opts.timestamp,
      route: opts.route,
      stored_at: new Date().toISOString(),
    };

    if (records.length >= maxRecords) {
      records.shift(); // drop oldest
    }
    records.push(record);
    return record;
  }

  /**
   * Retrieve recent audit records, newest-first.
   *
   * @param {number} [limit=50]
   * @returns {object[]}
   */
  function list(limit = 50) {
    const clamped = Math.max(1, Math.min(limit, records.length));
    return records.slice(-clamped).reverse();
  }

  /**
   * Look up a single audit record by request_id.
   *
   * @param {string} requestId
   * @returns {object|null}
   */
  function findById(requestId) {
    // Search backwards — most recent matches are most likely
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].request_id === requestId) return records[i];
    }
    return null;
  }

  /**
   * Current record count.
   * @returns {number}
   */
  function size() {
    return records.length;
  }

  /**
   * Max capacity.
   * @returns {number}
   */
  function capacity() {
    return maxRecords;
  }

  /**
   * Clear all records (test helper).
   */
  function clear() {
    records.length = 0;
  }

  return { append, list, findById, size, capacity, clear };
}

/** Singleton store instance used by the app */
export const auditStore = createAuditStore();
