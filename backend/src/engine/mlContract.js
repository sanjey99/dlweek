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

/**
 * Validate the strict ML contract for /infer and /classify responses.
 * Now accepts the fields that the ML service actually returns:
 *   risk_category, risk_score, confidence, uncertainty, label, timestamp, etc.
 */
export function validateStrictMlContract(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'ml_assessment must be an object' };

  const riskScore = normalizeRisk(raw);
  if (riskScore === null) return { ok: false, error: 'ml_assessment.risk_score must be a finite number' };

  const confidence = normalizeConfidence(raw);
  if (confidence === null) return { ok: false, error: 'ml_assessment.confidence must be a finite number' };

  // Label: accept risk_category OR label
  const label = typeof raw.label === 'string' && raw.label.trim().length > 0
    ? raw.label.trim()
    : typeof raw.risk_category === 'string' && raw.risk_category.trim().length > 0
      ? raw.risk_category.trim()
      : null;
  if (!label) return { ok: false, error: 'ml_assessment.label must be a non-empty string' };

  // Timestamp: accept from ML response or generate now
  let timestamp = normalizeTimestamp(raw);
  if (!timestamp) {
    timestamp = new Date().toISOString();
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
    },
  };
}

/**
 * Validate a /classify response specifically.
 * More lenient than strict contract — used for the action pipeline.
 */
export function validateMlClassifyResponse(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'response must be an object' };
  if (raw.fallback_used === true) return { ok: true, value: raw, fallback: true };

  const riskScore = toFiniteNumber(raw.risk_score);
  if (riskScore === null) return { ok: false, error: 'risk_score must be a number' };

  const category = raw.risk_category;
  if (!['low', 'medium', 'high'].includes(category)) {
    return { ok: false, error: 'risk_category must be low/medium/high' };
  }

  return { ok: true, value: raw, fallback: false };
}

export function buildFallbackMlAssessment({ reason, timestamp, seedRisk, seedConfidence } = {}) {
  const riskCandidate = toFiniteNumber(seedRisk);
  const confidenceCandidate = toFiniteNumber(seedConfidence);
  const riskScore = clamp01(riskCandidate === null ? 0.5 : riskCandidate);
  const confidence = clamp01(confidenceCandidate === null ? 0.35 : confidenceCandidate);
  const label = riskScore >= 0.8 ? 'anomaly' : riskScore >= 0.45 ? 'warning' : 'normal';

  return {
    risk_score: riskScore,
    risk_category: 'medium',
    confidence,
    uncertainty: 1.0,
    label,
    timestamp: isIsoTimestamp(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
    decision_reason: 'Fallback ML assessment due to missing or invalid contract payload.',
    recommendation: 'review',
    reason_tags: [reason || 'ML_CONTRACT_UNAVAILABLE'],
    model_version: 'fallback-v1',
    source: 'fallback',
    stale_state: true,
    fallback_reason: reason || 'ML_CONTRACT_UNAVAILABLE',
    fallback_used: true,
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
