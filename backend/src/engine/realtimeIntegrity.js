function nowIso() {
  return new Date().toISOString();
}

export function createRealtimeIntegrityTracker(options = {}) {
  const staleAfterMs = Number.isFinite(Number(options.staleAfterMs)) ? Number(options.staleAfterMs) : 6000;
  const nowMs = typeof options.nowMs === 'function' ? options.nowMs : () => Date.now();

  let lastSuccessAtMs = null;
  let lastPayload = null;
  let lastSource = null;

  function buildIntegrity({ source, payload, staleState, reason }) {
    const currentMs = nowMs();
    const ageMs = lastSuccessAtMs === null ? null : Math.max(0, currentMs - lastSuccessAtMs);
    return {
      source,
      timestamp: nowIso(),
      stale_state: staleState,
      stale_reason: staleState ? reason || 'SOURCE_UNAVAILABLE' : null,
      last_success_at: lastSuccessAtMs === null ? null : new Date(lastSuccessAtMs).toISOString(),
      age_ms: ageMs,
      stale_due_to_age: ageMs === null ? true : ageMs > staleAfterMs,
      payload,
    };
  }

  function recordFresh({ source, payload }) {
    lastSuccessAtMs = nowMs();
    lastPayload = payload;
    lastSource = source;
    return buildIntegrity({ source, payload, staleState: false, reason: null });
  }

  function recordStale({ source, reason, fallbackPayload }) {
    const payload = fallbackPayload ?? lastPayload;
    return buildIntegrity({
      source: source || lastSource || 'unknown',
      payload,
      staleState: true,
      reason: reason || 'SOURCE_UNAVAILABLE',
    });
  }

  async function capture(fetcher, source = 'adapter.market_data') {
    try {
      const payload = await fetcher();
      return recordFresh({ source, payload });
    } catch (error) {
      return recordStale({
        source,
        reason: `FETCH_ERROR:${String(error.message || error)}`,
      });
    }
  }

  return {
    capture,
    recordFresh,
    recordStale,
  };
}
