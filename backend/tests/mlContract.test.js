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

// ── Validator: extra keys, all-errors, clear messages ──────────────────────

test('validator preserves extra keys from ML response', () => {
  const result = validateStrictMlContract({
    risk_score: 0.53,
    confidence: 0.92,
    label: 'medium',
    timestamp: '2026-03-01T12:00:00.000Z',
    risk_category: 'medium',
    uncertainty: 0.07,
    model_version: 'legacy-heuristic-v2',
    fallback_used: false,
    reason_tags: [],
  });
  assert.equal(result.ok, true);
  // Extra keys carried through
  assert.equal(result.value.risk_category, 'medium');
  assert.equal(result.value.uncertainty, 0.07);
  assert.equal(result.value.model_version, 'legacy-heuristic-v2');
  assert.equal(result.value.fallback_used, false);
  assert.deepEqual(result.value.reason_tags, []);
  // Required keys still normalized
  assert.equal(result.value.risk_score, 0.53);
  assert.equal(result.value.source, 'ml_service');
});

test('validator collects ALL errors, not just the first', () => {
  const result = validateStrictMlContract({
    risk_score: 'garbage',
    confidence: NaN,
    // label missing
    timestamp: 'not-a-date',
  });
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors), 'errors should be an array');
  assert.equal(result.errors.length, 4, 'should report all 4 failures');
  assert.ok(result.errors[0].startsWith('risk_score:'));
  assert.ok(result.errors[1].startsWith('confidence:'));
  assert.ok(result.errors[2].startsWith('label:'));
  assert.ok(result.errors[3].startsWith('timestamp:'));
  // .error still returns first error for backward compat
  assert.equal(result.error, result.errors[0]);
});

test('validator error messages include received type and value', () => {
  const result = validateStrictMlContract({
    risk_score: 'abc',
    confidence: 0.5,
    label: 'ok',
    timestamp: '2026-03-01T00:00:00Z',
  });
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('"abc"'), 'should include the bad value');
  assert.ok(result.error.includes('string'), 'should include the received type');
});

test('validator accepts minimal valid payload (required keys only)', () => {
  const result = validateStrictMlContract({
    risk_score: 0.0,
    confidence: 1.0,
    label: 'low',
    timestamp: '2026-01-01T00:00:00Z',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.risk_score, 0);
  assert.equal(result.value.confidence, 1);
  assert.equal(result.value.label, 'low');
});

test('validator rejects null, undefined, and non-objects', () => {
  for (const bad of [null, undefined, 42, 'string', true]) {
    const result = validateStrictMlContract(bad);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 1);
  }
});

// ── Fallback safety: contract keys + fallback_used + status semantics ────────

test('buildFallbackMlAssessment satisfies strict contract and marks fallback_used', () => {
  const fb = buildFallbackMlAssessment({ reason: 'ML_DOWN' });

  // All four required contract keys present
  assert.equal(typeof fb.risk_score, 'number');
  assert.ok(Number.isFinite(fb.risk_score));
  assert.ok(fb.risk_score >= 0 && fb.risk_score <= 1);

  assert.equal(typeof fb.confidence, 'number');
  assert.ok(Number.isFinite(fb.confidence));
  assert.ok(fb.confidence >= 0 && fb.confidence <= 1);

  assert.equal(typeof fb.label, 'string');
  assert.ok(fb.label.length > 0);

  assert.equal(typeof fb.timestamp, 'string');
  assert.ok(!Number.isNaN(Date.parse(fb.timestamp)), 'timestamp must be ISO-8601');

  // Fallback markers
  assert.equal(fb.fallback_used, true);
  assert.equal(fb.source, 'fallback');
  assert.equal(fb.stale_state, true);
  assert.equal(fb.fallback_reason, 'ML_DOWN');
});

test('buildFallbackMlAssessment output passes validateStrictMlContract', () => {
  const fb = buildFallbackMlAssessment({ reason: 'TEST_ROUNDTRIP' });
  const result = validateStrictMlContract(fb);
  assert.equal(result.ok, true, `Expected ok but got: ${result.error}`);
  assert.equal(result.value.risk_score, fb.risk_score);
  assert.equal(result.value.label, fb.label);
});

test('normalizeMlAssessmentForGovernance returns fallback with contract keys when ml_assessment missing', () => {
  const n = normalizeMlAssessmentForGovernance({ context: { riskScore: 0.7 } });

  assert.equal(n.usedFallback, true);
  assert.equal(n.strictContractValid, false);

  // The fallback assessment itself must satisfy contract
  const check = validateStrictMlContract(n.mlAssessment);
  assert.equal(check.ok, true, `Fallback failed strict check: ${check.error}`);
  assert.equal(n.mlAssessment.fallback_used, true);
});

test('normalizeMlAssessmentForGovernance returns fallback with contract keys when ml_assessment invalid', () => {
  const n = normalizeMlAssessmentForGovernance({
    ml_assessment: { risk_score: 'bad' },
    context: {},
  });

  assert.equal(n.usedFallback, true);
  const check = validateStrictMlContract(n.mlAssessment);
  assert.equal(check.ok, true, `Fallback failed strict check: ${check.error}`);
  assert.equal(n.mlAssessment.fallback_used, true);
});

test('normalizeMlAssessmentForEnsemble returns fallback with contract keys on non-200', () => {
  const n = normalizeMlAssessmentForEnsemble({
    responseOk: false,
    responseStatus: 500,
    responseBody: { error: 'internal' },
  });

  assert.equal(n.mlContract.used_fallback, true);
  const check = validateStrictMlContract(n.anomaly);
  assert.equal(check.ok, true, `Fallback failed strict check: ${check.error}`);
  assert.equal(n.anomaly.fallback_used, true);
});
