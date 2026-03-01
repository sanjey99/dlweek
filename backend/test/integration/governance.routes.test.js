import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

// ── Contract keys the frontend expects on each stored action ─────────────────
const ACTION_REQUIRED_KEYS = [
  'actionId', 'action', 'context', 'policy', 'status', 'createdAt', 'updatedAt',
];
const POLICY_REQUIRED_KEYS = ['decision', 'reasonTags', 'confidence'];

describe('GET /api/governance/actions', () => {
  it('returns ok with actions array and ledger', async () => {
    const res = await request(app).get('/api/governance/actions');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.ledger).toBeDefined();
    expect(typeof res.body.ledger.lastSequence).toBe('number');
  });
});

describe('POST /api/governance/actions/propose', () => {
  it('rejects missing action/context with 400', async () => {
    const res = await request(app)
      .post('/api/governance/actions/propose')
      .send({ foo: 'bar' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('proposes with explicit ml_assessment and returns full contract', async () => {
    const res = await request(app)
      .post('/api/governance/actions/propose')
      .send({
        action: { type: 'DEPLOY_PROD', target: 'payments-svc' },
        context: { environment: 'PROD', riskScore: 0.7, mlConfidence: 0.85 },
        ml_assessment: {
          risk_score: 0.7,
          confidence: 0.85,
          label: 'high',
          timestamp: new Date().toISOString(),
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.actionId).toBe('string');
    expect(['allow', 'review', 'block']).toContain(res.body.decision);
    expect(typeof res.body.status).toBe('string');
    // ml_contract metadata
    expect(res.body.ml_contract).toBeDefined();
    expect(res.body.ml_contract.strict_valid).toBe(true);
    expect(res.body.ml_contract.used_fallback).toBe(false);
  });

  it('auto-falls back when features present but ML unreachable', async () => {
    // ML is not running in test — features trigger fetch which fails,
    // then normalizeMlAssessmentForGovernance provides fallback
    const res = await request(app)
      .post('/api/governance/actions/propose')
      .send({
        action: { type: 'DEPLOY_STAGING', target: 'auth-svc' },
        context: { environment: 'STAGING' },
        features: [0.12, 0.08, -0.1, 0.03, 0.15, -0.06, 0.02, 0.01],
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.actionId).toBe('string');
    // Fallback kicked in since ML is not running
    expect(res.body.ml_contract.used_fallback).toBe(true);
  });
});

describe('Full propose → list → approve cycle', () => {
  let actionId;

  it('Step 1: propose an action that requires review', async () => {
    // MERGE_MAIN baseline=0.65, riskScore=0.3 → finalRisk≈0.53 → review
    const res = await request(app)
      .post('/api/governance/actions/propose')
      .send({
        action: { type: 'MERGE_MAIN', target: 'risk-engine' },
        context: {
          riskScore: 0.3,
          mlConfidence: 0.8,
          testsPassing: true,
          rollbackPlanPresent: true,
        },
        ml_assessment: {
          risk_score: 0.3,
          confidence: 0.8,
          label: 'medium',
          timestamp: new Date().toISOString(),
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.decision).toBe('review');
    expect(res.body.status).toBe('pending_review');
    actionId = res.body.actionId;
  });

  it('Step 2: list actions — proposed action appears with full policy shape', async () => {
    const res = await request(app).get('/api/governance/actions');
    expect(res.status).toBe(200);
    const found = res.body.actions.find((a) => a.actionId === actionId);
    expect(found).toBeDefined();

    // Frontend-required keys on the stored record
    for (const key of ACTION_REQUIRED_KEYS) {
      expect(found[key]).toBeDefined();
    }
    // policy sub-object has the fields the frontend reads
    for (const key of POLICY_REQUIRED_KEYS) {
      expect(found.policy[key]).toBeDefined();
    }
    expect(found.status).toBe('pending_review');
    expect(found.resolution).toBeNull();
  });

  it('Step 3: approve the action', async () => {
    const res = await request(app)
      .post('/api/action/approve')
      .send({ actionId, actor: 'test-reviewer' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('approved_by_human');
    expect(res.body.decision).toBe('allow');
    expect(res.body.resolution).toBeDefined();
    expect(res.body.resolution.actor).toBe('test-reviewer');
  });

  it('Step 4: list again — action shows resolved status', async () => {
    const res = await request(app).get('/api/governance/actions');
    const found = res.body.actions.find((a) => a.actionId === actionId);
    expect(found.status).toBe('approved_by_human');
    expect(found.resolution).not.toBeNull();
    expect(found.resolution.type).toBe('approve');
  });

  it('Step 5: cannot approve again (idempotency guard)', async () => {
    const res = await request(app)
      .post('/api/action/approve')
      .send({ actionId, actor: 'another-reviewer' });
    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
  });
});

describe('Block and escalation paths', () => {
  it('block path returns correct contract', async () => {
    // MERGE_MAIN baseline=0.65, riskScore=0.3 → review
    const propose = await request(app)
      .post('/api/governance/actions/propose')
      .send({
        action: { type: 'MERGE_MAIN', target: 'db-migrator' },
        context: { riskScore: 0.3, mlConfidence: 0.75, testsPassing: true, rollbackPlanPresent: true },
        ml_assessment: { risk_score: 0.3, confidence: 0.75, label: 'medium', timestamp: new Date().toISOString() },
      });
    expect(propose.body.status).toBe('pending_review');

    const res = await request(app)
      .post('/api/action/block')
      .send({ actionId: propose.body.actionId, actor: 'sec-team' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('blocked_by_human');
    expect(res.body.decision).toBe('block');
  });

  it('escalate path returns correct contract', async () => {
    // DEPLOY_STAGING baseline=0.55, riskScore=0.3 → review
    const propose = await request(app)
      .post('/api/governance/actions/propose')
      .send({
        action: { type: 'DEPLOY_STAGING', target: 'cache-cluster' },
        context: { riskScore: 0.3, mlConfidence: 0.75, testsPassing: true, rollbackPlanPresent: true },
        ml_assessment: { risk_score: 0.3, confidence: 0.75, label: 'low', timestamp: new Date().toISOString() },
      });
    expect(propose.body.status).toBe('pending_review');

    const res = await request(app)
      .post('/api/action/escalate')
      .send({ actionId: propose.body.actionId, actor: 'team-lead' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('escalated');
    expect(res.body.decision).toBe('review');
  });
});
