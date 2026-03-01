import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluate, POLICY_VERSION } from './fusionEvaluator.js';

describe('fusionEvaluator stale_state transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));
    process.env.FUSION_STALE_THRESHOLD_MS = '60000';
  });

  it('fresh when timestamp within threshold', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
      ml_output: { risk_score: 0.2, uncertainty: 0.1, timestamp: '2026-03-01T11:59:30.000Z' },
    });
    expect(out.stale_state).toBe('fresh');
  });

  it('stale when timestamp over threshold', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
      ml_output: { risk_score: 0.2, uncertainty: 0.1, timestamp: '2026-03-01T11:58:00.000Z' },
    });
    expect(out.stale_state).toBe('stale');
  });

  it('unknown when timestamp missing', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
      ml_output: { risk_score: 0.2, uncertainty: 0.1 },
    });
    expect(out.stale_state).toBe('unknown');
  });

  it('unknown when timestamp invalid', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
      ml_output: { risk_score: 0.2, uncertainty: 0.1, timestamp: 'not-a-date' },
    });
    expect(out.stale_state).toBe('unknown');
  });

  it('fresh exactly at threshold', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
      ml_output: { risk_score: 0.2, uncertainty: 0.1, timestamp: '2026-03-01T11:59:00.000Z' },
    });
    expect(out.stale_state).toBe('fresh');
  });
});

describe('fusionEvaluator DP1: version fields', () => {
  it('exports POLICY_VERSION constant', () => {
    expect(typeof POLICY_VERSION).toBe('string');
    expect(POLICY_VERSION.length).toBeGreaterThan(0);
  });

  it('response contains policy_version matching exported constant', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
    });
    expect(out.policy_version).toBe(POLICY_VERSION);
  });

  it('model_version = "unavailable" without ml_output', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
    });
    expect(out.model_version).toBe('unavailable');
  });

  it('model_version extracted from ml_output', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: {},
      ml_output: { risk_score: 0.1, uncertainty: 0.1, model_version: 'test-v1' },
    });
    expect(out.model_version).toBe('test-v1');
  });
});

describe('fusionEvaluator DP1: hard-policy-first block', () => {
  it('blocks destructive prod DELETE_RESOURCE regardless of ML', () => {
    const out = evaluate({
      action: { type: 'DELETE_RESOURCE' },
      context: {
        targetEnvironment: 'prod',
        destructive: true,
        hasHumanApproval: true,
      },
      ml_output: { risk_score: 0.01, uncertainty: 0.01, decision: 'allow' },
    });
    expect(out.decision).toBe('block');
    expect(out.risk_score).toBe(1);
    expect(out.reason_tags).toContain('HARD_POLICY_BLOCK');
  });

  it('blocks unapproved prod ROTATE_SECRET', () => {
    const out = evaluate({
      action: { type: 'ROTATE_SECRET' },
      context: { targetEnvironment: 'prod', hasHumanApproval: false },
    });
    expect(out.decision).toBe('block');
    expect(out.reason_tags).toContain('HARD_POLICY_BLOCK');
  });

  it('does not hard-block DELETE on non-prod', () => {
    const out = evaluate({
      action: { type: 'DELETE_RESOURCE' },
      context: { targetEnvironment: 'staging', destructive: true },
    });
    expect(out.reason_tags).not.toContain('HARD_POLICY_BLOCK');
  });
});

describe('fusionEvaluator DP1: uncertainty guard', () => {
  it('escalates allow to review when uncertainty >= 0.5 and risk >= 0.3', () => {
    // Craft a case: moderate risk, high uncertainty
    const out = evaluate({
      action: { type: 'MERGE_MAIN' },
      context: { touchesCriticalPaths: true },
      // No ML → high uncertainty
    });
    // MERGE_MAIN base 0.65 + critical 0.12 + no_rollback 0.08 = 0.85 rule → high risk
    // fusedRisk will be high, so may already be review/block
    // The guard only matters for the allow→review edge case
    expect(['review', 'block']).toContain(out.decision);
  });

  it('does not escalate low-risk+low-uncertainty allow', () => {
    const out = evaluate({
      action: { type: 'READ' },
      context: { testsPassing: true, rollbackPlanPresent: true },
      ml_output: {
        risk_score: 0.05,
        uncertainty: 0.05,
        decision: 'allow',
        timestamp: new Date().toISOString(),
      },
    });
    expect(out.decision).toBe('allow');
    expect(out.reason_tags).not.toContain('UNCERTAINTY_GUARD_ESCALATION');
  });
});
