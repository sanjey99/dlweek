/**
 * Unit tests for fusionAuditStore.js  (ARCH-CORE-P4)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createAuditStore } from './fusionAuditStore.js';

// Helper: build a minimal valid audit record payload
function makeRecord(id, decision = 'allow') {
  return {
    request_id: id,
    decision,
    reason_tags: ['test'],
    risk_score: 0.42,
    uncertainty: 0.1,
    stale_state: 'fresh',
    source: 'unit-test',
    policy_version: '1.1.0',
    model_version: '3.0',
    timestamp: new Date().toISOString(),
    route: '/test',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  createAuditStore – factory
// ═══════════════════════════════════════════════════════════════════════════════

describe('createAuditStore – factory', () => {
  it('returns an object with the expected interface', () => {
    const store = createAuditStore(10);
    expect(typeof store.append).toBe('function');
    expect(typeof store.list).toBe('function');
    expect(typeof store.findById).toBe('function');
    expect(typeof store.size).toBe('function');
    expect(typeof store.capacity).toBe('function');
    expect(typeof store.clear).toBe('function');
  });

  it('defaults capacity to 5000 when no arg given', () => {
    const store = createAuditStore();
    expect(store.capacity()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  append
// ═══════════════════════════════════════════════════════════════════════════════

describe('append', () => {
  let store;
  beforeEach(() => { store = createAuditStore(10); });

  it('stores a record and increments size', () => {
    store.append(makeRecord('r-1'));
    expect(store.size()).toBe(1);
  });

  it('returned record includes stored_at timestamp', () => {
    const rec = store.append(makeRecord('r-1'));
    expect(rec.stored_at).toBeDefined();
    expect(typeof rec.stored_at).toBe('string');
  });

  it('preserves all fields from input', () => {
    const input = makeRecord('r-2', 'block');
    const rec = store.append(input);
    expect(rec.request_id).toBe('r-2');
    expect(rec.decision).toBe('block');
    expect(rec.reason_tags).toEqual(['test']);
    expect(rec.risk_score).toBe(0.42);
    expect(rec.uncertainty).toBe(0.1);
    expect(rec.stale_state).toBe('fresh');
    expect(rec.source).toBe('unit-test');
    expect(rec.policy_version).toBe('1.1.0');
    expect(rec.model_version).toBe('3.0');
    expect(rec.route).toBe('/test');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  list
// ═══════════════════════════════════════════════════════════════════════════════

describe('list', () => {
  let store;
  beforeEach(() => { store = createAuditStore(100); });

  it('returns empty array when store is empty', () => {
    expect(store.list()).toEqual([]);
  });

  it('returns records newest-first', () => {
    store.append(makeRecord('r-1'));
    store.append(makeRecord('r-2'));
    store.append(makeRecord('r-3'));
    const result = store.list();
    expect(result[0].request_id).toBe('r-3');
    expect(result[2].request_id).toBe('r-1');
  });

  it('defaults to 50 records max', () => {
    for (let i = 0; i < 80; i++) store.append(makeRecord(`r-${i}`));
    expect(store.list().length).toBe(50);
  });

  it('respects custom limit', () => {
    for (let i = 0; i < 20; i++) store.append(makeRecord(`r-${i}`));
    expect(store.list(5).length).toBe(5);
  });

  it('clamps limit to 1 minimum', () => {
    store.append(makeRecord('r-1'));
    store.append(makeRecord('r-2'));
    expect(store.list(0).length).toBe(1);
    expect(store.list(-5).length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  findById
// ═══════════════════════════════════════════════════════════════════════════════

describe('findById', () => {
  let store;
  beforeEach(() => { store = createAuditStore(100); });

  it('returns null when store is empty', () => {
    expect(store.findById('nonexistent')).toBeNull();
  });

  it('returns null for unknown request_id', () => {
    store.append(makeRecord('r-1'));
    expect(store.findById('r-999')).toBeNull();
  });

  it('finds a stored record by request_id', () => {
    store.append(makeRecord('r-1'));
    store.append(makeRecord('r-2'));
    const found = store.findById('r-1');
    expect(found).not.toBeNull();
    expect(found.request_id).toBe('r-1');
  });

  it('returns the most recent match when duplicates exist', () => {
    store.append({ ...makeRecord('dup'), decision: 'allow' });
    store.append({ ...makeRecord('dup'), decision: 'block' });
    // findById scans backwards → gets most recent
    const found = store.findById('dup');
    expect(found.decision).toBe('block');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  safety cap (oldest-drop)
// ═══════════════════════════════════════════════════════════════════════════════

describe('safety cap – oldest-drop policy', () => {
  it('drops oldest record when at capacity', () => {
    const store = createAuditStore(3);
    store.append(makeRecord('r-1'));
    store.append(makeRecord('r-2'));
    store.append(makeRecord('r-3'));
    expect(store.size()).toBe(3);

    // 4th insert should evict r-1
    store.append(makeRecord('r-4'));
    expect(store.size()).toBe(3);
    expect(store.findById('r-1')).toBeNull();
    expect(store.findById('r-4')).not.toBeNull();
  });

  it('maintains correct order after evictions', () => {
    const store = createAuditStore(2);
    store.append(makeRecord('r-1'));
    store.append(makeRecord('r-2'));
    store.append(makeRecord('r-3'));
    const listed = store.list(10);
    expect(listed.length).toBe(2);
    expect(listed[0].request_id).toBe('r-3');
    expect(listed[1].request_id).toBe('r-2');
  });

  it('works with cap of 1', () => {
    const store = createAuditStore(1);
    store.append(makeRecord('r-1'));
    store.append(makeRecord('r-2'));
    expect(store.size()).toBe(1);
    expect(store.findById('r-2')).not.toBeNull();
    expect(store.findById('r-1')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  clear
// ═══════════════════════════════════════════════════════════════════════════════

describe('clear', () => {
  it('removes all records', () => {
    const store = createAuditStore(100);
    store.append(makeRecord('r-1'));
    store.append(makeRecord('r-2'));
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.list()).toEqual([]);
  });
});
