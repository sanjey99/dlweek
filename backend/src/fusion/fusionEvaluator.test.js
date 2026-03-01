import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluate } from './fusionEvaluator.js';

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
