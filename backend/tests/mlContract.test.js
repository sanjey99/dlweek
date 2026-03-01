import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackMlAssessment,
  normalizeMlAssessmentForEnsemble,
  normalizeMlAssessmentForGovernance,
  validateStrictMlContract,
} from '../src/engine/mlContract.js';

test('strict ML contract accepts valid payload', () => {
  const validated = validateStrictMlContract({
    risk_score: 0.73,
    confidence: 0.88,
    label: 'anomaly',
    timestamp: '2026-03-01T12:00:00.000Z',
  });
  assert.equal(validated.ok, true);
  assert.equal(validated.value.stale_state, false);
  assert.equal(validated.value.source, 'ml_service');
});

test('governance normalization falls back safely on invalid payload', () => {
  const normalized = normalizeMlAssessmentForGovernance({
    ml_assessment: {
      risk_score: 'not-a-number',
      confidence: 0.8,
      label: 'anomaly',
      timestamp: '2026-03-01T12:00:00.000Z',
    },
    context: { riskScore: 0.2, mlConfidence: 0.4 },
  });

  assert.equal(normalized.strictContractValid, false);
  assert.equal(normalized.usedFallback, true);
  assert.equal(normalized.mlAssessment.source, 'fallback');
  assert.equal(normalized.mlAssessment.stale_state, true);
});

test('fallback assessment always provides bounded values', () => {
  const fallback = buildFallbackMlAssessment({
    reason: 'ML_CONTRACT_MISSING',
    seedRisk: 4.2,
    seedConfidence: -0.3,
  });
  assert.equal(fallback.risk_score, 1);
  assert.equal(fallback.confidence, 0);
  assert.equal(typeof fallback.timestamp, 'string');
});

test('ensemble normalization uses explicit upstream non-200 fallback reason', () => {
  const normalized = normalizeMlAssessmentForEnsemble({
    responseOk: false,
    responseStatus: 503,
    responseBody: { error: 'model unavailable' },
  });

  assert.equal(normalized.mlContract.strict_valid, false);
  assert.equal(normalized.mlContract.used_fallback, true);
  assert.equal(normalized.mlContract.validation_error, 'ML_UPSTREAM_NON_200:503');
  assert.equal(normalized.mlContract.fallback_reason, 'ML_UPSTREAM_NON_200:503');
  assert.equal(normalized.mlContract.upstream_status, 503);
  assert.equal(normalized.mlContract.upstream_error, 'model unavailable');
  assert.equal(normalized.anomaly.fallback_reason, 'ML_UPSTREAM_NON_200:503');
});
