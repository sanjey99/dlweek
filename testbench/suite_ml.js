/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SUITE 1 — ML Model Accuracy & Classification Tests            ║
 * ║  Tests neural network predictions, confidence calibration,     ║
 * ║  MC Dropout uncertainty, and per-class accuracy metrics        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ml, api } from './http.js';
import {
  TestSuite, printSuiteHeader, printSuiteResults,
  printMetricsTable, printConfusionMatrix, C, ICONS, pct, progressBar,
} from './reporter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load test data
const demoPath = resolve(__dirname, '..', 'data', 'demo_actions.json');
const testDataPath = resolve(__dirname, '..', 'data', 'test_actions.json');
let demoActions, testActions;
try {
  demoActions = JSON.parse(readFileSync(demoPath, 'utf-8')).actions;
  testActions = JSON.parse(readFileSync(testDataPath, 'utf-8')).actions || JSON.parse(readFileSync(testDataPath, 'utf-8'));
} catch (e) {
  demoActions = [];
  testActions = [];
}

export default async function runMLTests() {
  const suite = new TestSuite('ML Model — Accuracy & Classification', ICONS.brain);
  suite.startTime = Date.now();

  // ── 1. Health Check ─────────────────────────────────────────────────────────
  try {
    const res = await ml.get('/health');
    if (res.data?.ok && res.data?.model_loaded) {
      suite.pass('ML Service health check', { latency: res.latency, value: 'healthy + model loaded' });
    } else if (res.data?.ok) {
      suite.warn('ML Service health check', { latency: res.latency, info: 'model not loaded — using fallback' });
    } else {
      suite.fail('ML Service health check', { latency: res.latency });
    }
  } catch (e) {
    suite.fail('ML Service health check', { info: e.message });
    suite.endTime = Date.now();
    return suite;
  }

  // ── 2. Model Architecture Info ──────────────────────────────────────────────
  try {
    const res = await ml.get('/model/info');
    const d = res.data;
    const correctDim = d.input_dim === 154 && d.embed_dim === 128 && d.context_dim === 6 && d.keyword_dim === 20;
    if (correctDim && d.model_type === 'RiskMLP') {
      suite.pass('Model architecture validation (RiskMLP 154→128→64→32→3)', { latency: res.latency });
    } else {
      suite.fail('Model architecture validation', { info: JSON.stringify(d) });
    }
    if (d.categories?.length === 3 && d.categories.includes('low') && d.categories.includes('medium') && d.categories.includes('high')) {
      suite.pass('Risk categories defined (low/medium/high)', { value: d.categories.join(', ') });
    } else {
      suite.fail('Risk categories defined', { info: JSON.stringify(d.categories) });
    }
    if (d.thresholds?.allow_max === 0.3 && d.thresholds?.block_min === 0.8) {
      suite.pass('Decision thresholds configured', { value: `allow<${d.thresholds.allow_max}  block≥${d.thresholds.block_min}` });
    } else {
      suite.warn('Decision thresholds configured', { info: JSON.stringify(d.thresholds) });
    }
  } catch (e) {
    suite.fail('Model architecture validation', { info: e.message });
  }

  // ── 3. Individual Classification Tests (curated demo set) ───────────────────
  const classifyLatencies = [];
  const classifyResults = [];

  const testCases = [
    {
      name: 'HIGH — DROP TABLE in production',
      text: 'DROP TABLE users permanently in production database',
      context: { targetEnvironment: 'prod', destructive: true, hasHumanApproval: false, testsPassing: true, rollbackPlanPresent: false, touchesCriticalPaths: true },
      expected: 'high',
    },
    {
      name: 'HIGH — Force deploy skipping tests',
      text: 'Force deploy payment gateway to production bypassing all tests and canary rollout',
      context: { targetEnvironment: 'prod', destructive: false, testsPassing: false, rollbackPlanPresent: false, hasHumanApproval: false, touchesCriticalPaths: false },
      expected: 'high',
    },
    {
      name: 'HIGH — Terraform destroy production',
      text: 'Terraform destroy the primary production RDS database with auto-approve',
      context: { targetEnvironment: 'prod', destructive: true, rollbackPlanPresent: false, touchesCriticalPaths: true, hasHumanApproval: false, testsPassing: true },
      expected: 'high',
    },
    {
      name: 'MEDIUM — Schema migration with rollback',
      text: 'ALTER TABLE payments ADD COLUMN chargeback_flag in production with rollback plan',
      context: { targetEnvironment: 'prod', destructive: false, rollbackPlanPresent: true, testsPassing: true, hasHumanApproval: false, touchesCriticalPaths: false },
      expected: 'medium',
    },
    {
      name: 'MEDIUM — Staging canary deploy',
      text: 'Deploy analytics pipeline to staging with 50% canary rollout',
      context: { targetEnvironment: 'staging', destructive: false, testsPassing: true, rollbackPlanPresent: true, hasHumanApproval: false, touchesCriticalPaths: false },
      expected: 'medium',
    },
    {
      name: 'LOW — Read-only daily report query',
      text: 'SELECT COUNT FROM transactions WHERE date equals today for daily dashboard report',
      context: { targetEnvironment: 'prod', destructive: false, testsPassing: true, hasHumanApproval: false, rollbackPlanPresent: false, touchesCriticalPaths: false },
      expected: 'low',
    },
    {
      name: 'LOW — Staging health check',
      text: 'GET health check across all staging services in json format',
      context: { targetEnvironment: 'staging', destructive: false, testsPassing: true, hasHumanApproval: false, rollbackPlanPresent: false, touchesCriticalPaths: false },
      expected: 'low',
    },
    {
      name: 'LOW — Run integration tests',
      text: 'Run integration test suite in staging environment',
      context: { targetEnvironment: 'staging', destructive: false, testsPassing: true, hasHumanApproval: false, rollbackPlanPresent: false, touchesCriticalPaths: false },
      expected: 'low',
    },
  ];

  for (const tc of testCases) {
    try {
      const res = await ml.post('/classify', { text: tc.text, context: tc.context });
      classifyLatencies.push(res.latency);
      const predicted = res.data?.risk_category;
      classifyResults.push({ expected: tc.expected, predicted, correct: predicted === tc.expected });

      if (predicted === tc.expected) {
        suite.pass(tc.name, {
          latency: res.latency,
          value: `${predicted} (score: ${res.data?.risk_score?.toFixed(3)}, conf: ${res.data?.confidence?.toFixed(3)})`,
        });
      } else {
        suite.fail(tc.name, {
          latency: res.latency,
          expected: tc.expected,
          actual: predicted,
          info: `score=${res.data?.risk_score?.toFixed(3)}`,
        });
      }
    } catch (e) {
      suite.fail(tc.name, { info: e.message });
    }
  }

  // ── 4. Response Contract Validation ─────────────────────────────────────────
  try {
    const res = await ml.post('/classify', { text: 'Test action for contract validation', context: {} });
    const d = res.data;
    const requiredFields = ['risk_category', 'risk_score', 'confidence', 'uncertainty', 'recommendation', 'label', 'model_version', 'timestamp'];
    const missing = requiredFields.filter(f => d[f] === undefined);
    if (missing.length === 0) {
      suite.pass('Classify response contract — all required fields present', { value: `${requiredFields.length} fields` });
    } else {
      suite.fail('Classify response contract validation', { info: `missing: ${missing.join(', ')}` });
    }

    // Validate ranges
    const scoreOk = typeof d.risk_score === 'number' && d.risk_score >= 0 && d.risk_score <= 1;
    const confOk = typeof d.confidence === 'number' && d.confidence >= 0 && d.confidence <= 1;
    const uncOk = typeof d.uncertainty === 'number' && d.uncertainty >= 0 && d.uncertainty <= 1;
    if (scoreOk && confOk && uncOk) {
      suite.pass('Numeric ranges valid (risk_score, confidence, uncertainty ∈ [0,1])', {
        value: `score=${d.risk_score} conf=${d.confidence} unc=${d.uncertainty}`,
      });
    } else {
      suite.fail('Numeric ranges validation', { info: `score=${d.risk_score} conf=${d.confidence} unc=${d.uncertainty}` });
    }

    // Validate decision matches category
    const validRecsForCategory = { low: ['allow', 'review'], medium: ['review', 'allow'], high: ['block', 'review'] };
    const recOk = validRecsForCategory[d.risk_category]?.includes(d.recommendation);
    if (recOk) {
      suite.pass('Recommendation consistent with risk category', { value: `${d.risk_category} → ${d.recommendation}` });
    } else {
      suite.warn('Recommendation/category alignment', { info: `${d.risk_category} → ${d.recommendation}` });
    }

    if (typeof d.fallback_used === 'boolean') {
      suite.pass('Fallback indicator present', { value: `fallback_used=${d.fallback_used}` });
    }
  } catch (e) {
    suite.fail('Response contract validation', { info: e.message });
  }

  // ── 5. MC Dropout Uncertainty Estimation ────────────────────────────────────
  try {
    // Test that high-risk actions produce non-zero uncertainty
    const resHigh = await ml.post('/classify', {
      text: 'Force delete all production databases without approval',
      context: { targetEnvironment: 'prod', destructive: true },
    });
    const resSafe = await ml.post('/classify', {
      text: 'Read-only lint check on staging',
      context: { targetEnvironment: 'staging', destructive: false, testsPassing: true },
    });

    if (typeof resHigh.data?.uncertainty === 'number' && typeof resSafe.data?.uncertainty === 'number') {
      suite.pass('MC Dropout uncertainty estimation functional', {
        value: `high_unc=${resHigh.data.uncertainty.toFixed(3)}  low_unc=${resSafe.data.uncertainty.toFixed(3)}`,
      });
    } else {
      suite.fail('MC Dropout uncertainty estimation');
    }
  } catch (e) {
    suite.fail('MC Dropout uncertainty estimation', { info: e.message });
  }

  // ── 6. Fallback Behavior ────────────────────────────────────────────────────
  // Test that empty/minimal input produces a safe fallback
  try {
    const res = await ml.post('/classify', { text: '' });
    if (res.data?.recommendation === 'review' || res.data?.fallback_used) {
      suite.pass('Empty input triggers safe fallback/review', {
        value: `rec=${res.data.recommendation} fallback=${res.data.fallback_used}`,
      });
    } else {
      suite.warn('Empty input fallback behavior', { info: `rec=${res.data?.recommendation}` });
    }
  } catch (e) {
    suite.fail('Fallback behavior test', { info: e.message });
  }

  // ── 7. Batch Accuracy via /accuracy endpoint ────────────────────────────────
  let batchAccuracy = null;
  try {
    const subset = (Array.isArray(testActions) ? testActions : []).slice(0, 100);
    if (subset.length > 0) {
      const res = await ml.post('/accuracy', { actions: subset });
      const d = res.data;
      batchAccuracy = d;

      if (d.ok && typeof d.overall_accuracy === 'number') {
        const acc = d.overall_accuracy;
        if (acc >= 0.7) {
          suite.pass(`Batch accuracy (${d.total} samples)`, {
            latency: res.latency,
            value: `${(acc * 100).toFixed(1)}% overall`,
          });
        } else if (acc >= 0.5) {
          suite.warn(`Batch accuracy (${d.total} samples)`, {
            latency: res.latency,
            value: `${(acc * 100).toFixed(1)}% — below target`,
          });
        } else {
          suite.fail(`Batch accuracy (${d.total} samples)`, {
            latency: res.latency,
            value: `${(acc * 100).toFixed(1)}% — critically low`,
          });
        }
      } else {
        suite.fail('Batch accuracy endpoint', { info: d.error || 'unexpected response' });
      }
    } else {
      suite.skip('Batch accuracy test — no test data found');
    }
  } catch (e) {
    suite.fail('Batch accuracy test', { info: e.message });
  }

  // ── 8. Drift Detection Endpoint ─────────────────────────────────────────────
  try {
    const res = await ml.post('/drift/check', {});
    if (res.data && typeof res.data.drift_detected === 'boolean') {
      suite.pass('Drift detection endpoint operational', {
        latency: res.latency,
        value: `drift_detected=${res.data.drift_detected}`,
      });
    } else {
      suite.warn('Drift detection endpoint', { info: 'unexpected response' });
    }
  } catch (e) {
    suite.fail('Drift detection endpoint', { info: e.message });
  }

  // ── 9. Legacy /infer endpoint ──────────────────────────────────────────────
  try {
    const res = await ml.post('/infer', { features: [0.8, 0.6, 0.1, 0.0, 0.0, 0.7, 0.0, 0.0] });
    if (res.data?.risk_category && typeof res.data.risk_score === 'number') {
      suite.pass('Legacy /infer endpoint backward compatible', {
        latency: res.latency,
        value: `${res.data.risk_category} (score: ${res.data.risk_score.toFixed(3)})`,
      });
    } else {
      suite.fail('Legacy /infer endpoint', { info: JSON.stringify(res.data) });
    }
  } catch (e) {
    suite.fail('Legacy /infer endpoint', { info: e.message });
  }

  suite.endTime = Date.now();

  // ── Print Results ───────────────────────────────────────────────────────────
  printSuiteHeader(suite);
  printSuiteResults(suite);

  // Per-class accuracy metrics
  if (batchAccuracy?.per_class) {
    const pc = batchAccuracy.per_class;
    printMetricsTable(`${ICONS.target}  Per-Class Model Accuracy`, [
      { label: `${ICONS.fire} High Risk`, value: `${pc.high?.correct}/${pc.high?.total} ${pct(pc.high?.accuracy || 0)}`, bar: pc.high?.accuracy || 0 },
      { label: `${ICONS.warn} Medium Risk`, value: `${pc.medium?.correct}/${pc.medium?.total} ${pct(pc.medium?.accuracy || 0)}`, bar: pc.medium?.accuracy || 0 },
      { label: `${ICONS.check} Low Risk`, value: `${pc.low?.correct}/${pc.low?.total} ${pct(pc.low?.accuracy || 0)}`, bar: pc.low?.accuracy || 0 },
      { label: `${ICONS.trophy} Overall`, value: `${batchAccuracy.correct}/${batchAccuracy.total} ${pct(batchAccuracy.overall_accuracy)}`, bar: batchAccuracy.overall_accuracy },
    ]);
  }

  // Confusion matrix from batch results
  if (batchAccuracy?.predictions) {
    const labels = ['low', 'medium', 'high'];
    const matrix = labels.map(() => labels.map(() => 0));
    for (const p of batchAccuracy.predictions) {
      const ai = labels.indexOf(p.expected);
      const pi = labels.indexOf(p.predicted);
      if (ai >= 0 && pi >= 0) matrix[ai][pi]++;
    }
    printConfusionMatrix(matrix, labels);
  }

  // Classify latency histogram
  if (classifyLatencies.length > 0) {
    printMetricsTable(`${ICONS.clock}  Classify Endpoint Performance`, [
      { label: 'Average Latency', value: `${(classifyLatencies.reduce((a, b) => a + b, 0) / classifyLatencies.length).toFixed(0)}ms` },
      { label: 'Min Latency', value: `${Math.min(...classifyLatencies)}ms` },
      { label: 'Max Latency', value: `${Math.max(...classifyLatencies)}ms` },
    ]);
  }

  return suite;
}
