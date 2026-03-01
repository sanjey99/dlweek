import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeIntegrityTracker } from '../src/engine/realtimeIntegrity.js';

test('realtime tracker marks fresh captures as non-stale', async () => {
  let now = 1000;
  const tracker = createRealtimeIntegrityTracker({
    staleAfterMs: 5000,
    nowMs: () => now,
  });

  const frame = await tracker.capture(async () => ({ markets: [1], regime: 'calm' }), 'adapter.marketData');
  assert.equal(frame.stale_state, false);
  assert.equal(frame.source, 'adapter.marketData');
  assert.equal(frame.stale_due_to_age, false);
});

test('realtime tracker marks fetch failures as stale with truthful metadata', async () => {
  let now = 1000;
  const tracker = createRealtimeIntegrityTracker({
    staleAfterMs: 5000,
    nowMs: () => now,
  });

  await tracker.capture(async () => ({ markets: [1], regime: 'calm' }), 'adapter.marketData');
  now = 9000;

  const stale = await tracker.capture(async () => {
    throw new Error('source timeout');
  }, 'adapter.marketData');

  assert.equal(stale.stale_state, true);
  assert.equal(stale.source, 'adapter.marketData');
  assert.equal(stale.stale_due_to_age, true);
  assert.ok(String(stale.stale_reason).includes('FETCH_ERROR'));
});
