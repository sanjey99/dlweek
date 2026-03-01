function toFiniteNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return !Number.isNaN(Date.parse(value));
}

function normalizeRisk(raw) {
  const risk = toFiniteNumber(raw?.risk_score ?? raw?.riskScore);
  if (risk === null) return null;
  return clamp01(risk);
}

function normalizeConfidence(raw) {
  const confidence = toFiniteNumber(raw?.confidence ?? raw?.mlConfidence);
  if (confidence === null) return null;
  return clamp01(confidence);
}

function normalizeTimestamp(raw) {
  const ts = raw?.timestamp ?? raw?.evaluated_at ?? raw?.evaluatedAt;
  if (isIsoTimestamp(ts)) return new Date(ts).toISOString();
  return null;
}

/** Required keys and their human-readable expectation (for error messages). */
const REQUIRED_KEYS = ['risk_score', 'confidence', 'label', 'timestamp'];

export function validateStrictMlContract(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'ml_assessment must be a non-null object', errors: ['ml_assessment must be a non-null object'] };
  }

  // ── Validate all required keys, collecting every failure ────────────────
  const errors = [];

  const riskScore = normalizeRisk(raw);
  if (riskScore === null) {
    errors.push(`risk_score: expected finite number, got ${typeof raw.risk_score} (${JSON.stringify(raw.risk_score ?? raw.riskScore)})`);
  }

  const confidence = normalizeConfidence(raw);
  if (confidence === null) {
    errors.push(`confidence: expected finite number 0..1, got ${typeof raw.confidence} (${JSON.stringify(raw.confidence ?? raw.mlConfidence)})`);
  }

  const label = typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : null;
  if (!label) {
    errors.push(`label: expected non-empty string, got ${typeof raw.label} (${JSON.stringify(raw.label)})`);
  }

  const timestamp = normalizeTimestamp(raw);
  if (!timestamp) {
    errors.push(`timestamp: expected ISO-8601 string, got ${typeof (raw.timestamp ?? raw.evaluated_at)} (${JSON.stringify(raw.timestamp ?? raw.evaluated_at ?? raw.evaluatedAt)})`);
  }

  if (errors.length > 0) {
    return { ok: false, error: errors[0], errors };
  }

  // ── Build value: required keys + known optional keys + extra pass-through
  const KNOWN_KEYS = new Set([...REQUIRED_KEYS, 'riskScore', 'mlConfidence', 'evaluated_at', 'evaluatedAt',
    'decision_reason', 'recommendation', 'source', 'stale_state', 'fallback_reason']);

  // Collect extra keys the ML service sent (e.g. risk_category, uncertainty, model_version)
  const extras = {};
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) extras[key] = raw[key];
  }

  return {
    ok: true,
    value: {
      risk_score: riskScore,
      confidence,
      label,
      timestamp,
      decision_reason: typeof raw.decision_reason === 'string' ? raw.decision_reason : null,
      recommendation: typeof raw.recommendation === 'string' ? raw.recommendation : null,
      source: 'ml_service',
      stale_state: false,
      fallback_reason: null,
      ...extras,
    },
  };
}

export function buildFallbackMlAssessment({ reason, timestamp, seedRisk, seedConfidence } = {}) {
  const riskCandidate = toFiniteNumber(seedRisk);
  const confidenceCandidate = toFiniteNumber(seedConfidence);
  const riskScore = clamp01(riskCandidate === null ? 0.5 : riskCandidate);
  const confidence = clamp01(confidenceCandidate === null ? 0.35 : confidenceCandidate);
  const label = riskScore >= 0.8 ? 'anomaly' : riskScore >= 0.45 ? 'warning' : 'normal';

  return {
    risk_score: riskScore,
    confidence,
    label,
    timestamp: isIsoTimestamp(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
    decision_reason: 'Fallback ML assessment due to missing or invalid contract payload.',
    recommendation: 'require review',
    source: 'fallback',
    stale_state: true,
    fallback_used: true,
    fallback_reason: reason || 'ML_CONTRACT_UNAVAILABLE',
  };
}

export function normalizeMlAssessmentForGovernance(payload) {
  const raw = payload?.ml_assessment ?? payload?.mlAssessment ?? null;
  if (raw === null) {
    return {
      mlAssessment: buildFallbackMlAssessment({
        reason: 'ML_CONTRACT_MISSING',
        seedRisk: payload?.context?.riskScore,
        seedConfidence: payload?.context?.mlConfidence,
      }),
      strictContractValid: false,
      usedFallback: true,
      validationError: 'ml_assessment missing',
    };
  }

  const strict = validateStrictMlContract(raw);
  if (!strict.ok) {
    return {
      mlAssessment: buildFallbackMlAssessment({
        reason: 'ML_CONTRACT_INVALID',
        seedRisk: payload?.context?.riskScore,
        seedConfidence: payload?.context?.mlConfidence,
      }),
      strictContractValid: false,
      usedFallback: true,
      validationError: strict.error,
    };
  }

  return {
    mlAssessment: strict.value,
    strictContractValid: true,
    usedFallback: false,
    validationError: null,
  };
}

export function normalizeMlAssessmentForEnsemble({ responseOk, responseStatus, responseBody }) {
  if (!responseOk) {
    const reason = `ML_UPSTREAM_NON_200:${responseStatus}`;
    const fallback = buildFallbackMlAssessment({ reason });
    return {
      anomaly: fallback,
      mlContract: {
        strict_valid: false,
        used_fallback: true,
        validation_error: reason,
        fallback_reason: fallback.fallback_reason,
        upstream_status: responseStatus,
        upstream_error: typeof responseBody?.error === 'string' ? responseBody.error : null,
      },
    };
  }

  const contract = validateStrictMlContract(responseBody);
  if (!contract.ok) {
    const fallback = buildFallbackMlAssessment({ reason: `ML_RESPONSE_INVALID:${contract.error}` });
    return {
      anomaly: fallback,
      mlContract: {
        strict_valid: false,
        used_fallback: true,
        validation_error: contract.error,
        fallback_reason: fallback.fallback_reason,
        upstream_status: null,
        upstream_error: null,
      },
    };
  }

  return {
    anomaly: contract.value,
    mlContract: {
      strict_valid: true,
      used_fallback: false,
      validation_error: null,
      fallback_reason: null,
      upstream_status: null,
      upstream_error: null,
    },
  };
}
