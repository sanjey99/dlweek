import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyEnforcementService } from '../src/engine/policyEnforcementService.js';

test('propose path enforces BE-P1 decision contract', () => {
  const service = createPolicyEnforcementService();

  const result = service.propose({
    action: { type: 'open-pr' },
    context: {
      riskScore: 0.2,
      mlConfidence: 0.7,
      testsPassing: true,
      rollbackPlanPresent: true,
    },
  });

  assert.equal(typeof result.actionId, 'string');
  assert.ok(['allow', 'review', 'block'].includes(result.decision));
  assert.ok(Array.isArray(result.reasonTags));
  assert.equal(typeof result.confidence.decision, 'number');
});

test('review proposal can be approved with allow contract output', () => {
  const service = createPolicyEnforcementService();

  const proposed = service.propose({
    action: { type: 'merge-main' },
    context: {
      riskScore: 0.58,
      mlConfidence: 0.82,
      testsPassing: true,
      touchesCriticalPaths: true,
      rollbackPlanPresent: true,
    },
  });

  assert.equal(proposed.decision, 'review');

  const approved = service.resolve(
    {
      actionId: proposed.actionId,
      actor: 'qa-lead',
      notes: 'Manual approval after verification',
    },
    'approve',
  );

  assert.equal(approved.decision, 'allow');
  assert.ok(approved.reasonTags.includes('HUMAN_APPROVED'));
  assert.equal(approved.status, 'approved_by_human');
});

test('block path keeps blocked contract and exposes audit events', () => {
  const service = createPolicyEnforcementService();

  const proposed = service.propose({
    action: { type: 'delete-resource' },
    context: {
      riskScore: 0.95,
      mlConfidence: 0.9,
      testsPassing: false,
      targetEnvironment: 'prod',
      destructive: true,
      rollbackPlanPresent: false,
    },
  });
  assert.equal(proposed.decision, 'block');

  const blocked = service.resolve(
    {
      actionId: proposed.actionId,
      actor: 'security-reviewer',
    },
    'block',
  );
  assert.equal(blocked.decision, 'block');
  assert.ok(blocked.reasonTags.includes('HUMAN_BLOCKED'));

  const detail = service.detail(proposed.actionId);
  assert.ok(Array.isArray(detail.events));
  assert.ok(detail.events.some((evt) => evt.type === 'policy_evaluated'));
  assert.ok(detail.events.some((evt) => evt.type === 'action_block'));
});
