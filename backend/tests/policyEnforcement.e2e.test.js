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
    action: { type: 'merge-main' },
    context: {
      riskScore: 0.58,
      mlConfidence: 0.82,
      testsPassing: true,
      touchesCriticalPaths: true,
      rollbackPlanPresent: true,
    },
  });
  assert.equal(proposed.status, 'pending_review');

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
  assert.equal(detail.events[0]?.type, 'policy_evaluated');
  assert.ok(detail.events.some((evt) => evt.type === 'action_block'));
  assert.ok(detail.events.findIndex((evt) => evt.type === 'policy_evaluated') <
    detail.events.findIndex((evt) => evt.type.startsWith('action_')));
});

test('cannot approve after blocked', () => {
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
  assert.equal(proposed.status, 'blocked');

  assert.throws(
    () => service.resolve({ actionId: proposed.actionId, actor: 'qa' }, 'approve'),
    /invalid transition: status=blocked cannot apply approve/,
  );
});

test('cannot resolve twice (approve then block)', () => {
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
  const approved = service.resolve({ actionId: proposed.actionId, actor: 'qa' }, 'approve');
  assert.equal(approved.status, 'approved_by_human');

  assert.throws(
    () => service.resolve({ actionId: proposed.actionId, actor: 'sec' }, 'block'),
    /invalid transition: status=approved_by_human cannot apply block/,
  );
});

test('cannot escalate from blocked or approved states', () => {
  const service = createPolicyEnforcementService();

  const blocked = service.propose({
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
  assert.equal(blocked.status, 'blocked');
  assert.throws(
    () => service.resolve({ actionId: blocked.actionId, actor: 'ops' }, 'escalate'),
    /invalid transition: status=blocked cannot apply escalate/,
  );

  const approvedAuto = service.propose({
    action: { type: 'open-pr' },
    context: {
      riskScore: 0.2,
      mlConfidence: 0.7,
      testsPassing: true,
      rollbackPlanPresent: true,
    },
  });
  assert.equal(approvedAuto.status, 'approved_auto');
  assert.throws(
    () => service.resolve({ actionId: approvedAuto.actionId, actor: 'ops' }, 'escalate'),
    /invalid transition: status=approved_auto cannot apply escalate/,
  );

  const pending = service.propose({
    action: { type: 'merge-main' },
    context: {
      riskScore: 0.58,
      mlConfidence: 0.82,
      testsPassing: true,
      touchesCriticalPaths: true,
      rollbackPlanPresent: true,
    },
  });
  const approvedByHuman = service.resolve({ actionId: pending.actionId, actor: 'qa' }, 'approve');
  assert.equal(approvedByHuman.status, 'approved_by_human');
  assert.throws(
    () => service.resolve({ actionId: pending.actionId, actor: 'ops' }, 'escalate'),
    /invalid transition: status=approved_by_human cannot apply escalate/,
  );
});
