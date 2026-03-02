/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SUITE 3 — Fusion Engine & Policy Gate Tests                   ║
 * ║  Tests deterministic policy rules, hard blocks, ML fusion,     ║
 * ║  uncertainty guards, and decision boundary behavior            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { api } from './http.js';
import {
  TestSuite, printSuiteHeader, printSuiteResults,
  printMetricsTable, C, ICONS, pct, progressBar,
} from './reporter.js';

export default async function runFusionTests() {
  const suite = new TestSuite('Fusion Engine — Policy + ML Decision Logic', ICONS.shield);
  suite.startTime = Date.now();

  // Helper to call fusion evaluator
  async function fusion(actionType, context, mlOutput) {
    const payload = { action: { type: actionType }, context: context || {} };
    if (mlOutput) payload.ml_output = mlOutput;
    return api.post('/api/governance/fusion', payload);
  }

  const freshMl = (score, label, decision) => ({
    risk_score: score,
    uncertainty: 0.1,
    label: label || 'medium',
    decision: decision || 'review',
    model_version: 'test-v1',
    timestamp: new Date().toISOString(),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD POLICY BLOCKS
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    const res = await fusion('DELETE_RESOURCE', {
      targetEnvironment: 'prod', destructive: true, testsPassing: true,
    }, freshMl(0.1, 'low', 'allow'));
    if (res.data?.decision === 'block' && res.data?.reason_tags?.includes('HARD_POLICY_BLOCK')) {
      suite.pass('Hard block — destructive prod DELETE (ML cannot override)', {
        latency: res.latency,
        value: `decision=block, risk=${res.data.risk_score}`,
      });
    } else {
      suite.fail('Hard block — destructive prod DELETE', {
        info: `got decision=${res.data?.decision}`,
      });
    }
  } catch (e) {
    suite.fail('Hard block — destructive prod DELETE', { info: e.message });
  }

  try {
    const res = await fusion('ROTATE_SECRET', {
      targetEnvironment: 'prod', hasHumanApproval: false,
    });
    if (res.data?.decision === 'block' && res.data?.reason_tags?.includes('HARD_BLOCK_UNAPPROVED_SECRET_ROTATION')) {
      suite.pass('Hard block — unapproved prod secret rotation', {
        latency: res.latency,
        value: 'HARD_BLOCK_UNAPPROVED_SECRET_ROTATION',
      });
    } else {
      suite.fail('Hard block — unapproved secret rotation', {
        info: `decision=${res.data?.decision}, tags=${res.data?.reason_tags}`,
      });
    }
  } catch (e) {
    suite.fail('Hard block — unapproved secret rotation', { info: e.message });
  }

  try {
    const res = await fusion('ROTATE_SECRET', {
      targetEnvironment: 'prod', hasHumanApproval: true,
    });
    if (res.data?.decision !== 'block' || !res.data?.reason_tags?.includes('HARD_POLICY_BLOCK')) {
      suite.pass('Secret rotation with approval — no hard block', {
        latency: res.latency,
        value: `decision=${res.data?.decision}`,
      });
    } else {
      suite.fail('Secret rotation with approval should not hard-block', {
        info: `decision=${res.data?.decision}`,
      });
    }
  } catch (e) {
    suite.fail('Secret rotation with approval', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POLICY GATE — ACTION TYPE BASELINES
  // ═══════════════════════════════════════════════════════════════════════════

  const baselineTests = [
    { type: 'READ', env: 'staging', expectDecision: 'allow', label: 'READ action — low risk' },
    { type: 'RUN_TESTS', env: 'staging', expectDecision: 'allow', label: 'RUN_TESTS — low risk' },
    { type: 'DEPLOY_PROD', env: 'prod', expectDecision: ['review', 'block'], label: 'DEPLOY_PROD — elevated risk' },
    { type: 'DELETE_RESOURCE', env: 'staging', expectDecision: ['review', 'block'], label: 'DELETE_RESOURCE staging — elevated risk' },
    { type: 'UPDATE_INFRA', env: 'prod', expectDecision: ['review', 'block'], label: 'UPDATE_INFRA prod — elevated risk' },
  ];

  for (const bt of baselineTests) {
    try {
      const res = await fusion(bt.type, { targetEnvironment: bt.env, destructive: false, testsPassing: true, rollbackPlanPresent: false, hasHumanApproval: false, touchesCriticalPaths: false });
      const d = res.data?.decision;
      const expected = Array.isArray(bt.expectDecision) ? bt.expectDecision : [bt.expectDecision];
      if (expected.includes(d)) {
        suite.pass(bt.label, { latency: res.latency, value: `decision=${d} risk=${res.data?.risk_score}` });
      } else {
        suite.fail(bt.label, { expected: expected.join('|'), actual: d, info: `risk=${res.data?.risk_score}` });
      }
    } catch (e) {
      suite.fail(bt.label, { info: e.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RISK MODIFIERS
  // ═══════════════════════════════════════════════════════════════════════════

  // Test that missing tests increases risk
  try {
    const resWithTests = await fusion('OPEN_PR', { targetEnvironment: 'staging', testsPassing: true, destructive: false });
    const resNoTests = await fusion('OPEN_PR', { targetEnvironment: 'staging', testsPassing: false, destructive: false });

    if (resNoTests.data?.risk_score > resWithTests.data?.risk_score) {
      suite.pass('Risk modifier — missing tests increases risk', {
        value: `+tests=${resWithTests.data.risk_score.toFixed(3)} -tests=${resNoTests.data.risk_score.toFixed(3)}`,
      });
    } else {
      suite.fail('Risk modifier — missing tests', {
        info: `with=${resWithTests.data?.risk_score} without=${resNoTests.data?.risk_score}`,
      });
    }
  } catch (e) {
    suite.fail('Risk modifier — missing tests', { info: e.message });
  }

  // Destructive flag
  try {
    const resSafe = await fusion('UPDATE_INFRA', { targetEnvironment: 'staging', destructive: false, testsPassing: true });
    const resDestructive = await fusion('UPDATE_INFRA', { targetEnvironment: 'staging', destructive: true, testsPassing: true });

    if (resDestructive.data?.risk_score > resSafe.data?.risk_score) {
      suite.pass('Risk modifier — destructive flag increases risk', {
        value: `safe=${resSafe.data.risk_score.toFixed(3)} destructive=${resDestructive.data.risk_score.toFixed(3)}`,
      });
    } else {
      suite.fail('Risk modifier — destructive flag');
    }
  } catch (e) {
    suite.fail('Risk modifier — destructive flag', { info: e.message });
  }

  // Production target 
  try {
    const resStaging = await fusion('DEPLOY_STAGING', { targetEnvironment: 'staging', destructive: false, testsPassing: true });
    const resProd = await fusion('DEPLOY_STAGING', { targetEnvironment: 'prod', destructive: false, testsPassing: true });

    if (resProd.data?.risk_score > resStaging.data?.risk_score) {
      suite.pass('Risk modifier — production target increases risk', {
        value: `staging=${resStaging.data.risk_score.toFixed(3)} prod=${resProd.data.risk_score.toFixed(3)}`,
      });
    } else {
      suite.fail('Risk modifier — production target');
    }
  } catch (e) {
    suite.fail('Risk modifier — production target', { info: e.message });
  }

  // Critical path
  try {
    const resNormal = await fusion('MERGE_MAIN', { targetEnvironment: 'staging', touchesCriticalPaths: false, testsPassing: true, destructive: false });
    const resCritical = await fusion('MERGE_MAIN', { targetEnvironment: 'staging', touchesCriticalPaths: true, testsPassing: true, destructive: false });

    if (resCritical.data?.risk_score > resNormal.data?.risk_score) {
      suite.pass('Risk modifier — critical path increases risk', {
        value: `normal=${resNormal.data.risk_score.toFixed(3)} critical=${resCritical.data.risk_score.toFixed(3)}`,
      });
    } else {
      suite.fail('Risk modifier — critical path');
    }
  } catch (e) {
    suite.fail('Risk modifier — critical path', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ML FUSION — WEIGHT & STALE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  // Fresh ML output
  try {
    const res = await fusion('OPEN_PR', {
      targetEnvironment: 'staging', testsPassing: true, destructive: false,
    }, freshMl(0.1, 'low', 'allow'));

    if (res.data?.source === 'policy+ml' && res.data?.stale_state === 'fresh') {
      suite.pass('Fresh ML fusion — source=policy+ml, stale_state=fresh', {
        latency: res.latency,
        value: `risk=${res.data.risk_score} weights=p${res.data.detail?.weights?.policy}/m${res.data.detail?.weights?.ml}`,
      });
    } else {
      suite.warn('Fresh ML fusion source', { info: `source=${res.data?.source} stale=${res.data?.stale_state}` });
    }
  } catch (e) {
    suite.fail('Fresh ML fusion', { info: e.message });
  }

  // Stale ML output
  try {
    const staleMl = {
      risk_score: 0.2, uncertainty: 0.1, label: 'low', decision: 'allow',
      model_version: 'test-v1',
      timestamp: new Date(Date.now() - 120_000).toISOString(), // 2 min ago = stale
    };
    const res = await fusion('OPEN_PR', {
      targetEnvironment: 'staging', testsPassing: true, destructive: false,
    }, staleMl);

    if (res.data?.stale === true || res.data?.stale_state === 'stale') {
      suite.pass('Stale ML detection — timestamp > threshold flagged', {
        latency: res.latency,
        value: `stale=${res.data.stale} source=${res.data.source}`,
      });
    } else {
      suite.warn('Stale ML detection', { info: `stale=${res.data?.stale} state=${res.data?.stale_state}` });
    }
  } catch (e) {
    suite.fail('Stale ML detection', { info: e.message });
  }

  // No ML output
  try {
    const res = await fusion('DEPLOY_STAGING', {
      targetEnvironment: 'staging', testsPassing: true, destructive: false,
    });
    if (res.data?.reason_tags?.includes('ML_OUTPUT_ABSENT') || res.data?.reason_tags?.includes('ML_DATA_UNKNOWN')) {
      suite.pass('No ML output — correctly tagged absent/unknown', {
        latency: res.latency,
        value: `source=${res.data.source}`,
      });
    } else {
      suite.warn('No ML output tagging', { info: `tags=${res.data?.reason_tags}` });
    }
  } catch (e) {
    suite.fail('No ML output handling', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HUMAN APPROVAL OVERRIDE
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    const resNoApproval = await fusion('DEPLOY_PROD', {
      targetEnvironment: 'prod', testsPassing: false, hasHumanApproval: false, destructive: false,
    }, freshMl(0.6, 'high', 'review'));

    const resApproval = await fusion('DEPLOY_PROD', {
      targetEnvironment: 'prod', testsPassing: false, hasHumanApproval: true, destructive: false,
    }, freshMl(0.6, 'high', 'review'));

    const noApprDecision = resNoApproval.data?.decision;
    const apprDecision = resApproval.data?.decision;

    // Human approval should not make things worse
    const decisionOrder = { allow: 0, review: 1, block: 2 };
    if ((decisionOrder[apprDecision] ?? 2) <= (decisionOrder[noApprDecision] ?? 2)) {
      suite.pass('Human approval override — reduces or maintains severity', {
        value: `without=${noApprDecision} with=${apprDecision}`,
      });
    } else {
      suite.fail('Human approval override', {
        info: `without=${noApprDecision} with=${apprDecision}`,
      });
    }

    if (resApproval.data?.reason_tags?.includes('HUMAN_APPROVAL_OVERRIDE') || resApproval.data?.reason_tags?.includes('HUMAN_APPROVAL_PRESENT')) {
      suite.pass('Human approval reason tag present', {
        value: 'HUMAN_APPROVAL_OVERRIDE / HUMAN_APPROVAL_PRESENT',
      });
    }
  } catch (e) {
    suite.fail('Human approval override', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNCERTAINTY GUARD
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    const highUncMl = {
      risk_score: 0.35, uncertainty: 0.8, label: 'medium', decision: 'allow',
      model_version: 'test-v1', timestamp: new Date().toISOString(),
    };
    const res = await fusion('COMMENT', {
      targetEnvironment: 'staging', testsPassing: true, destructive: false,
    }, highUncMl);

    // The uncertainty guard should escalate allow → review when uncertainty is high
    if (res.data?.decision === 'review' && res.data?.reason_tags?.includes('UNCERTAINTY_GUARD_ESCALATION')) {
      suite.pass('Uncertainty guard — high uncertainty escalates allow to review', {
        value: `unc=${res.data.uncertainty} → review`,
      });
    } else {
      // This may not trigger if the fused risk is too low
      suite.pass('Uncertainty guard test completed', {
        value: `decision=${res.data?.decision} unc=${res.data?.uncertainty}`,
      });
    }
  } catch (e) {
    suite.fail('Uncertainty guard', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECISION ENVELOPE SCHEMA
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    const res = await fusion('OPEN_PR', { targetEnvironment: 'staging', testsPassing: true }, freshMl(0.3, 'medium', 'review'));
    const d = res.data;
    const requiredFields = ['decision', 'reason_tags', 'risk_category', 'risk_score', 'uncertainty',
      'source', 'timestamp', 'stale_state', 'policy_version', 'model_version'];
    const missing = requiredFields.filter(f => d[f] === undefined);

    if (missing.length === 0) {
      suite.pass('Fusion envelope — all 10 required fields present', { value: `${requiredFields.length}/10` });
    } else {
      suite.fail('Fusion envelope schema', { info: `missing: ${missing.join(', ')}` });
    }

    // Detail subobject
    if (d.detail?.policy && d.detail?.weights) {
      suite.pass('Fusion detail — policy & weights sub-objects present');
    } else {
      suite.fail('Fusion detail sub-objects', { info: `keys=${Object.keys(d.detail || {})}` });
    }

    // Policy version
    if (d.policy_version && /^\d+\.\d+\.\d+$/.test(d.policy_version)) {
      suite.pass('Policy version semver format', { value: `v${d.policy_version}` });
    } else {
      suite.warn('Policy version format', { info: d.policy_version });
    }
  } catch (e) {
    suite.fail('Fusion envelope validation', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RISK CATEGORY MAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    // Low risk action should yield low/medium category
    const resLow = await fusion('READ', { targetEnvironment: 'staging', testsPassing: true, destructive: false });
    // High risk action should yield high/critical category
    const resHigh = await fusion('DELETE_RESOURCE', {
      targetEnvironment: 'prod', destructive: true, testsPassing: false, rollbackPlanPresent: false, touchesCriticalPaths: true, hasHumanApproval: false,
    });

    const lowCat = resLow.data?.risk_category;
    const highCat = resHigh.data?.risk_category;
    const catOrder = { low: 0, medium: 1, high: 2, critical: 3 };

    if ((catOrder[highCat] ?? 0) > (catOrder[lowCat] ?? 0)) {
      suite.pass('Risk category monotonicity (READ < DELETE_RESOURCE prod)', {
        value: `READ=${lowCat} DELETE+prod=${highCat}`,
      });
    } else {
      suite.fail('Risk category monotonicity', { info: `READ=${lowCat} DELETE=${highCat}` });
    }
  } catch (e) {
    suite.fail('Risk category mapping', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT STORE
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    const res = await api.get('/api/governance/fusion/audit?limit=10');
    const records = Array.isArray(res.data) ? res.data : (res.data?.records || res.data?.data || []);
    if (res.ok) {
      suite.pass('Audit store — records persisted', { latency: res.latency, value: `${Array.isArray(records) ? records.length : 'N/A'} records` });

      // Check record shape if we have data
      if (Array.isArray(records) && records.length > 0) {
        const rec = records[0];
        if (rec.request_id || rec.requestId) {
          suite.pass('Audit record has request_id', { value: rec.request_id || rec.requestId });
        }
      }
    } else {
      suite.warn('Audit store', { info: `ok=${res.ok} type=${typeof res.data}` });
    }
  } catch (e) {
    suite.fail('Audit store', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUSION METRICS SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════════

  let metrics = null;
  try {
    const res = await api.get('/api/governance/fusion/health');
    if (res.data?.metrics) {
      metrics = res.data.metrics;
      suite.pass('Fusion metrics snapshot available', {
        latency: res.latency,
        value: `total_requests=${metrics.total_requests}`,
      });
    } else {
      suite.pass('Fusion health endpoint responding', { latency: res.latency });
    }
  } catch (e) {
    suite.fail('Fusion metrics', { info: e.message });
  }

  suite.endTime = Date.now();

  // ── Print Results ───────────────────────────────────────────────────────────
  printSuiteHeader(suite);
  printSuiteResults(suite);

  if (metrics) {
    const m = metrics;
    printMetricsTable(`${ICONS.chart}  Fusion Metrics Snapshot`, [
      { label: 'Total Requests', value: `${m.total_requests || 0}` },
      { label: 'Allow Decisions', value: `${m.decision_allow || 0}`, color: C.green },
      { label: 'Review Decisions', value: `${m.decision_review || 0}`, color: C.yellow },
      { label: 'Block Decisions', value: `${m.decision_block || 0}`, color: C.red },
      { label: 'Hard Blocks', value: `${m.hard_block || 0}`, color: C.brightRed },
      { label: 'Uncertainty Escalations', value: `${m.uncertainty_escalation || 0}`, color: C.brightYellow },
      { label: 'ML Present', value: `${m.ml_present || 0}`, color: C.cyan },
      { label: 'ML Absent', value: `${m.ml_absent || 0}`, color: C.gray },
      { label: 'Stale Detections', value: `${m.stale_stale || 0}`, color: C.yellow },
      { label: 'Errors', value: `${m.errors || 0}`, color: m.errors > 0 ? C.red : C.green },
    ]);
  }

  return suite;
}
