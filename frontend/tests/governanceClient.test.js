import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyResolutionToActions,
  isInvalidTransitionError,
  proposeGovernanceAction,
  resolveGovernanceAction,
} from '../src/app/services/governanceClient.js';

function createMockFetch(handler) {
  return async (url, init) => handler({ url, init });
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('approve path calls propose then /api/action/approve and returns backend status', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(({ url, init }) => {
    calls.push({ url, init });
    if (url.endsWith('/api/governance/actions/propose')) {
      return jsonResponse(200, { ok: true, actionId: 'act_backend_1', status: 'pending_review' });
    }
    if (url.endsWith('/api/action/approve')) {
      return jsonResponse(200, { ok: true, status: 'approved_by_human', decision: 'allow' });
    }
    return jsonResponse(404, { ok: false, error: 'not found' });
  });

  const proposed = await proposeGovernanceAction({
    apiBaseUrl: 'http://localhost:4000',
    action: { id: 'ui1', riskScore: 70, environment: 'PROD' },
    fetchImpl,
  });
  assert.equal(proposed.actionId, 'act_backend_1');

  const resolved = await resolveGovernanceAction({
    apiBaseUrl: 'http://localhost:4000',
    actionId: proposed.actionId,
    resolution: 'approve',
    fetchImpl,
  });
  assert.equal(resolved.status, 'approved_by_human');

  assert.equal(calls[0].url, 'http://localhost:4000/api/governance/actions/propose');
  assert.equal(calls[1].url, 'http://localhost:4000/api/action/approve');
});

test('block path calls /api/action/block and updates UI status to HIGH_RISK_BLOCKED', async () => {
  const fetchImpl = createMockFetch(({ url }) => {
    if (url.endsWith('/api/action/block')) {
      return jsonResponse(200, { ok: true, status: 'blocked_by_human', decision: 'block' });
    }
    return jsonResponse(404, { ok: false, error: 'not found' });
  });

  const resolved = await resolveGovernanceAction({
    apiBaseUrl: 'http://localhost:4000',
    actionId: 'act_backend_2',
    resolution: 'block',
    fetchImpl,
  });
  assert.equal(resolved.status, 'blocked_by_human');

  const initialActions = [
    { id: 'uiA', riskStatus: 'HIGH_RISK_PENDING' },
    { id: 'uiB', riskStatus: 'MEDIUM_RISK_PENDING' },
  ];
  const { updated, nextPending } = applyResolutionToActions(initialActions, 'uiA', resolved.status);
  assert.equal(updated[0].riskStatus, 'HIGH_RISK_BLOCKED');
  assert.equal(nextPending.id, 'uiB');
});

test('409 invalid transition is surfaced for explicit UI error handling', async () => {
  const fetchImpl = createMockFetch(() => jsonResponse(409, { ok: false, error: 'invalid transition: status=approved_by_human cannot apply block' }));

  await assert.rejects(
    () => resolveGovernanceAction({
      apiBaseUrl: 'http://localhost:4000',
      actionId: 'act_backend_3',
      resolution: 'block',
      fetchImpl,
    }),
    (error) => {
      assert.equal(isInvalidTransitionError(error), true);
      assert.equal(error.status, 409);
      assert.match(String(error.message), /invalid transition/i);
      return true;
    },
  );
});
