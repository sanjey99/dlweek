import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

// ─── Required fusion envelope fields ────────────────────────────────────────
const FUSION_REQUIRED_FIELDS = [
  'decision',
  'reason_tags',
  'risk_category',
  'risk_score',
  'uncertainty',
  'source',
  'timestamp',
  'stale_state',
];

const VALID_DECISIONS = ['allow', 'review', 'block'];
const VALID_STALE_STATES = ['fresh', 'stale', 'unknown'];
const VALID_RISK_CATEGORIES = ['low', 'medium', 'high', 'critical'];

// ─── Legacy shape fields (v2 compat routes) ─────────────────────────────────
const LEGACY_REQUIRED_FIELDS = [
  'decision',
  'reasonTags',
  'confidence',
  'risk',
  'actionType',
];

// ─── Payloads ────────────────────────────────────────────────────────────────

const PAYLOAD_ALLOW = {
  action: { type: 'READ' },
  context: { testsPassing: true, rollbackPlanPresent: true, targetEnvironment: 'dev' },
};

const PAYLOAD_REVIEW = {
  action: { type: 'DEPLOY_PROD' },
  context: {
    riskScore: 0.5,
    mlConfidence: 0.7,
    testsPassing: true,
    touchesCriticalPaths: true,
    targetEnvironment: 'prod',
    destructive: false,
    rollbackPlanPresent: true,
    hasHumanApproval: false,
  },
  ml_output: {
    risk_score: 0.55,
    uncertainty: 0.3,
    label: 'normal',
    decision: 'review',
    timestamp: new Date().toISOString(), // fresh
  },
};

const PAYLOAD_BLOCK = {
  action: { type: 'DELETE_RESOURCE' },
  context: {
    riskScore: 0.9,
    mlConfidence: 0.85,
    testsPassing: false,
    touchesCriticalPaths: true,
    targetEnvironment: 'prod',
    destructive: true,
    rollbackPlanPresent: false,
    hasHumanApproval: false,
  },
  ml_output: {
    risk_score: 0.92,
    uncertainty: 0.1,
    label: 'anomaly',
    decision: 'block',
    timestamp: new Date().toISOString(),
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  POST /api/governance/fusion
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/governance/fusion', () => {

  // ── Schema contract ───────────────────────────────────────────────────────

  it('returns all required fusion envelope fields', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_ALLOW)
      .expect(200);

    expect(res.body.ok).toBe(true);
    for (const field of FUSION_REQUIRED_FIELDS) {
      expect(res.body).toHaveProperty(field);
    }
  });

  it('decision is one of allow|review|block', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_ALLOW)
      .expect(200);

    expect(VALID_DECISIONS).toContain(res.body.decision);
  });

  it('risk_category is one of low|medium|high|critical', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_REVIEW)
      .expect(200);

    expect(VALID_RISK_CATEGORIES).toContain(res.body.risk_category);
  });

  it('reason_tags is an array of strings', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_ALLOW)
      .expect(200);

    expect(Array.isArray(res.body.reason_tags)).toBe(true);
    res.body.reason_tags.forEach((t) => expect(typeof t).toBe('string'));
  });

  it('risk_score is a number between 0 and 1', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_ALLOW)
      .expect(200);

    expect(res.body.risk_score).toBeGreaterThanOrEqual(0);
    expect(res.body.risk_score).toBeLessThanOrEqual(1);
  });

  it('timestamp is a valid ISO string', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_ALLOW)
      .expect(200);

    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  // ── Allow / Review / Block decisions ──────────────────────────────────────

  it('returns allow for low-risk READ action', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_ALLOW)
      .expect(200);

    expect(res.body.decision).toBe('allow');
    expect(res.body.reason_tags).toContain('FUSED_RISK_ACCEPTABLE');
  });

  it('returns review for moderate prod deploy', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_REVIEW)
      .expect(200);

    expect(res.body.decision).toBe('review');
    expect(res.body.reason_tags).toContain('FUSED_REVIEW_REQUIRED');
  });

  it('returns block for destructive delete with high ML risk', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send(PAYLOAD_BLOCK)
      .expect(200);

    expect(res.body.decision).toBe('block');
    expect(res.body.reason_tags).toContain('FUSED_BLOCK_THRESHOLD');
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('rejects missing action', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({ context: {} })
      .expect(400);

    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('rejects missing context', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({ action: { type: 'READ' } })
      .expect(400);

    expect(res.body.ok).toBe(false);
  });

  it('rejects empty body', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({})
      .expect(400);

    expect(res.body.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Tri-state stale_state at route level
// ═══════════════════════════════════════════════════════════════════════════════

describe('Fusion stale_state tri-state via API', () => {

  it('stale_state = "fresh" when ml_output.timestamp is recent', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({
        action: { type: 'READ' },
        context: {},
        ml_output: {
          risk_score: 0.1,
          uncertainty: 0.1,
          timestamp: new Date().toISOString(), // now → fresh
        },
      })
      .expect(200);

    expect(res.body.stale_state).toBe('fresh');
    expect(res.body.stale).toBe(false);
    expect(res.body.source).toBe('policy+ml');
  });

  it('stale_state = "stale" when ml_output.timestamp is old', async () => {
    const old = new Date(Date.now() - 120_000).toISOString(); // 2 min ago
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({
        action: { type: 'READ' },
        context: {},
        ml_output: { risk_score: 0.1, uncertainty: 0.1, timestamp: old },
      })
      .expect(200);

    expect(res.body.stale_state).toBe('stale');
    expect(res.body.stale).toBe(true);
    expect(res.body.source).toBe('policy+ml(stale)');
    expect(res.body.reason_tags).toContain('ML_DATA_STALE');
  });

  it('stale_state = "unknown" when ml_output has no timestamp', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({
        action: { type: 'READ' },
        context: {},
        ml_output: { risk_score: 0.1, uncertainty: 0.1 },
      })
      .expect(200);

    expect(res.body.stale_state).toBe('unknown');
    expect(res.body.stale).toBe(true);
    expect(res.body.reason_tags).toContain('ML_DATA_UNKNOWN');
  });

  it('stale_state = "unknown" when ml_output.timestamp is garbage', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({
        action: { type: 'READ' },
        context: {},
        ml_output: { risk_score: 0.1, uncertainty: 0.1, timestamp: 'not-a-date' },
      })
      .expect(200);

    expect(res.body.stale_state).toBe('unknown');
    expect(res.body.stale).toBe(true);
  });

  it('stale_state = "unknown" when no ml_output at all (policy-only)', async () => {
    const res = await request(app)
      .post('/api/governance/fusion')
      .send({ action: { type: 'READ' }, context: {} })
      .expect(200);

    expect(res.body.stale_state).toBe('unknown');
    expect(res.body.source).toBe('policy-only');
    expect(res.body.reason_tags).toContain('ML_OUTPUT_ABSENT');
  });

  it('stale_state is always one of fresh|stale|unknown', async () => {
    for (const payload of [PAYLOAD_ALLOW, PAYLOAD_REVIEW, PAYLOAD_BLOCK]) {
      const res = await request(app)
        .post('/api/governance/fusion')
        .send(payload)
        .expect(200);

      expect(VALID_STALE_STATES).toContain(res.body.stale_state);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  v2 Compatibility routes — legacy shape verification
// ═══════════════════════════════════════════════════════════════════════════════

const V2_ROUTES = [
  '/api/governance/policy-gate/v2',
  '/api/policy/gate/v2',
  '/api/risk/gate/v2',
];

const LEGACY_PAYLOAD = {
  action: { type: 'READ' },
  context: { testsPassing: true, rollbackPlanPresent: true },
};

describe('v2 compat routes (legacy shape)', () => {

  for (const route of V2_ROUTES) {
    describe(`POST ${route}`, () => {

      it('returns all legacy-shape fields', async () => {
        const res = await request(app)
          .post(route)
          .send(LEGACY_PAYLOAD)
          .expect(200);

        expect(res.body.ok).toBe(true);
        for (const field of LEGACY_REQUIRED_FIELDS) {
          expect(res.body).toHaveProperty(field);
        }
      });

      it('decision is one of allow|review|block', async () => {
        const res = await request(app)
          .post(route)
          .send(LEGACY_PAYLOAD)
          .expect(200);

        expect(VALID_DECISIONS).toContain(res.body.decision);
      });

      it('has packetId and evaluatedAt for backward compat', async () => {
        const res = await request(app)
          .post(route)
          .send(LEGACY_PAYLOAD)
          .expect(200);

        expect(res.body.packetId).toBe('BE-P1');
        expect(res.body.evaluatedAt).toBeDefined();
        expect(new Date(res.body.evaluatedAt).toISOString()).toBe(res.body.evaluatedAt);
      });

      it('has migration block with fusionSource', async () => {
        const res = await request(app)
          .post(route)
          .send(LEGACY_PAYLOAD)
          .expect(200);

        expect(res.body.migration).toBeDefined();
        expect(res.body.migration.strategy).toBe('fusion-compat');
        expect(res.body.migration.fusionSource).toBeDefined();
      });

      it('confidence has decision/policy/model subfields', async () => {
        const res = await request(app)
          .post(route)
          .send(LEGACY_PAYLOAD)
          .expect(200);

        expect(res.body.confidence).toHaveProperty('decision');
        expect(res.body.confidence).toHaveProperty('policy');
        expect(res.body.confidence).toHaveProperty('model');
      });

      it('risk has score/ruleScore/modelScore subfields', async () => {
        const res = await request(app)
          .post(route)
          .send(LEGACY_PAYLOAD)
          .expect(200);

        expect(res.body.risk).toHaveProperty('score');
        expect(res.body.risk).toHaveProperty('ruleScore');
        expect(res.body.risk).toHaveProperty('modelScore');
      });

      it('rejects missing action', async () => {
        const res = await request(app)
          .post(route)
          .send({ context: {} })
          .expect(400);

        expect(res.body.ok).toBe(false);
      });

      it('does NOT leak fusion-specific fields into legacy shape', async () => {
        const res = await request(app)
          .post(route)
          .send(LEGACY_PAYLOAD)
          .expect(200);

        // These are fusion-envelope fields that should NOT appear at top level
        expect(res.body).not.toHaveProperty('reason_tags');
        expect(res.body).not.toHaveProperty('risk_score');
        expect(res.body).not.toHaveProperty('risk_category');
        expect(res.body).not.toHaveProperty('stale_state');
      });
    });
  }
});
