/**
 * Unit tests for fusionMetrics.js and fusionLogger.js  (ARCH-CORE-P3)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { increment, recordDecision, snapshot, resetMetrics } from './fusionMetrics.js';
import { buildLogEntry, generateRequestId, _resetCounter } from './fusionLogger.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  fusionMetrics
// ═══════════════════════════════════════════════════════════════════════════════

describe('fusionMetrics', () => {

  beforeEach(() => {
    resetMetrics();
  });

  it('starts with all counters at zero', () => {
    const s = snapshot();
    expect(s.total_requests).toBe(0);
    expect(s.decision_allow).toBe(0);
    expect(s.decision_review).toBe(0);
    expect(s.decision_block).toBe(0);
    expect(s.ml_present).toBe(0);
    expect(s.ml_absent).toBe(0);
    expect(s.hard_block).toBe(0);
    expect(s.errors).toBe(0);
  });

  it('increment() increases a named counter', () => {
    increment('total_requests');
    increment('total_requests');
    increment('errors');
    const s = snapshot();
    expect(s.total_requests).toBe(2);
    expect(s.errors).toBe(1);
  });

  it('increment() ignores unknown keys', () => {
    increment('nonexistent_counter');
    const s = snapshot();
    expect(s).not.toHaveProperty('nonexistent_counter');
  });

  it('recordDecision() increments decision_allow for allow', () => {
    recordDecision({ decision: 'allow', stale_state: 'unknown', source: 'policy-only', reason_tags: [] });
    const s = snapshot();
    expect(s.total_requests).toBe(1);
    expect(s.decision_allow).toBe(1);
    expect(s.ml_absent).toBe(1);
    expect(s.stale_unknown).toBe(1);
  });

  it('recordDecision() increments decision_review for review', () => {
    recordDecision({ decision: 'review', stale_state: 'fresh', source: 'policy+ml', reason_tags: [] });
    const s = snapshot();
    expect(s.decision_review).toBe(1);
    expect(s.stale_fresh).toBe(1);
    expect(s.ml_present).toBe(1);
  });

  it('recordDecision() increments decision_block for block', () => {
    recordDecision({ decision: 'block', stale_state: 'stale', source: 'policy+ml(stale)', reason_tags: ['HARD_POLICY_BLOCK'] });
    const s = snapshot();
    expect(s.decision_block).toBe(1);
    expect(s.stale_stale).toBe(1);
    expect(s.ml_present).toBe(1);
    expect(s.hard_block).toBe(1);
  });

  it('recordDecision() tracks uncertainty escalations', () => {
    recordDecision({ decision: 'review', stale_state: 'unknown', source: 'policy-only', reason_tags: ['UNCERTAINTY_GUARD_ESCALATION'] });
    const s = snapshot();
    expect(s.uncertainty_escalation).toBe(1);
  });

  it('snapshot() includes started_at timestamp', () => {
    const s = snapshot();
    expect(typeof s.started_at).toBe('string');
    expect(new Date(s.started_at).getTime()).not.toBeNaN();
  });

  it('resetMetrics() zeroes all counters', () => {
    increment('total_requests', 10);
    increment('errors', 5);
    resetMetrics();
    const s = snapshot();
    expect(s.total_requests).toBe(0);
    expect(s.errors).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  fusionLogger
// ═══════════════════════════════════════════════════════════════════════════════

describe('fusionLogger', () => {

  beforeEach(() => {
    _resetCounter();
  });

  it('generateRequestId() returns fusion-<epoch>-<seq> format', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^fusion-\d+-1$/);
  });

  it('generateRequestId() returns monotonically increasing sequence', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    const seq1 = parseInt(id1.split('-').pop(), 10);
    const seq2 = parseInt(id2.split('-').pop(), 10);
    expect(seq2).toBe(seq1 + 1);
  });

  it('buildLogEntry() returns all required fields', () => {
    const entry = buildLogEntry({
      requestId: 'fusion-1234-1',
      route: '/api/governance/fusion',
      fusionResult: {
        decision: 'allow',
        reason_tags: ['FUSED_RISK_ACCEPTABLE'],
        risk_score: 0.1,
        risk_category: 'low',
        uncertainty: 0.3,
        stale_state: 'unknown',
        source: 'policy-only',
        policy_version: '1.1.0',
        model_version: 'unavailable',
        timestamp: '2026-03-01T00:00:00.000Z',
      },
      durationMs: 5,
    });

    expect(entry.level).toBe('info');
    expect(entry.event).toBe('fusion_decision');
    expect(entry.requestId).toBe('fusion-1234-1');
    expect(entry.route).toBe('/api/governance/fusion');
    expect(entry.decision).toBe('allow');
    expect(entry.reason_tags).toEqual(['FUSED_RISK_ACCEPTABLE']);
    expect(entry.risk_score).toBe(0.1);
    expect(entry.uncertainty).toBe(0.3);
    expect(entry.stale_state).toBe('unknown');
    expect(entry.source).toBe('policy-only');
    expect(entry.policy_version).toBe('1.1.0');
    expect(entry.model_version).toBe('unavailable');
    expect(entry.durationMs).toBe(5);
    expect(entry.timestamp).toBe('2026-03-01T00:00:00.000Z');
  });

  it('buildLogEntry() omits clientIp when not provided', () => {
    const entry = buildLogEntry({
      requestId: 'fusion-1234-1',
      route: '/test',
      fusionResult: { decision: 'allow', reason_tags: [], timestamp: '2026-01-01T00:00:00Z' },
      durationMs: 1,
    });
    expect(entry).not.toHaveProperty('clientIp');
  });

  it('buildLogEntry() includes clientIp when provided', () => {
    const entry = buildLogEntry({
      requestId: 'fusion-1234-1',
      route: '/test',
      fusionResult: { decision: 'allow', reason_tags: [], timestamp: '2026-01-01T00:00:00Z' },
      durationMs: 1,
      clientIp: '127.0.0.1',
    });
    expect(entry.clientIp).toBe('127.0.0.1');
  });
});
