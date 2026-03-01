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

export function validateStrictMlContract(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'ml_assessment must be an object' };
  const riskScore = normalizeRisk(raw);
  if (riskScore === null) return { ok: false, error: 'ml_assessment.risk_score must be a finite number' };
  const confidence = normalizeConfidence(raw);
  if (confidence === null) return { ok: false, error: 'ml_assessment.confidence must be a finite number' };
  const label = typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : null;
  if (!label) return { ok: false, error: 'ml_assessment.label must be a non-empty string' };
  const timestamp = normalizeTimestamp(raw);
  if (!timestamp) return { ok: false, error: 'ml_assessment.timestamp must be ISO-8601' };

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
