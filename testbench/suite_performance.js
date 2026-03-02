/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SUITE 4 — Performance & Reliability Benchmarks                ║
 * ║  Tests throughput, latency percentiles, concurrent load,       ║
 * ║  and pipeline end-to-end timing                                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { api, ml } from './http.js';
import {
  TestSuite, printSuiteHeader, printSuiteResults,
  printMetricsTable, printLatencyHistogram, C, ICONS, pct, percentile,
} from './reporter.js';

async function timeRequest(fn) {
  const start = performance.now();
  const result = await fn();
  return { ...result, elapsed: Math.round(performance.now() - start) };
}

export default async function runPerformanceTests() {
  const suite = new TestSuite('Performance & Reliability Benchmarks', ICONS.rocket);
  suite.startTime = Date.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // ML CLASSIFY THROUGHPUT
  // ═══════════════════════════════════════════════════════════════════════════

  const mlLatencies = [];
  const ML_ITERATIONS = 20;

  try {
    const testTexts = [
      'DROP TABLE users in production database permanently',
      'Run integration test suite in staging environment',
      'Deploy analytics pipeline to staging with canary rollout',
      'Read-only query for daily dashboard metrics',
      'Force deploy payment gateway bypassing all tests',
      'Export user PII data to public S3 bucket',
      'ALTER TABLE payments ADD COLUMN in production',
      'RESTART auth service in production during peak',
      'Terraform destroy primary RDS database auto-approve',
      'Copy archived data to analytics bucket staging',
    ];

    for (let i = 0; i < ML_ITERATIONS; i++) {
      const text = testTexts[i % testTexts.length];
      const start = performance.now();
      await ml.post('/classify', { text, context: { targetEnvironment: 'staging', testsPassing: true } });
      mlLatencies.push(Math.round(performance.now() - start));
    }

    const avg = mlLatencies.reduce((a, b) => a + b, 0) / mlLatencies.length;
    const p95 = percentile(mlLatencies, 95);
    const p99 = percentile(mlLatencies, 99);

    if (avg < 500) {
      suite.pass(`ML classify throughput (${ML_ITERATIONS} requests)`, {
        value: `avg=${avg.toFixed(0)}ms p95=${p95.toFixed(0)}ms`,
      });
    } else if (avg < 2000) {
      suite.warn(`ML classify throughput (${ML_ITERATIONS} requests)`, {
        value: `avg=${avg.toFixed(0)}ms p95=${p95.toFixed(0)}ms — slower than ideal`,
      });
    } else {
      suite.fail(`ML classify throughput`, { info: `avg=${avg.toFixed(0)}ms — too slow` });
    }
  } catch (e) {
    suite.fail('ML classify throughput', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUSION EVALUATOR THROUGHPUT
  // ═══════════════════════════════════════════════════════════════════════════

  const fusionLatencies = [];
  const FUSION_ITERATIONS = 20;

  try {
    const fusionPayloads = [
      { type: 'READ', ctx: { targetEnvironment: 'staging', testsPassing: true, destructive: false } },
      { type: 'DEPLOY_PROD', ctx: { targetEnvironment: 'prod', testsPassing: false, destructive: false } },
      { type: 'DELETE_RESOURCE', ctx: { targetEnvironment: 'prod', destructive: true, touchesCriticalPaths: true } },
      { type: 'UPDATE_INFRA', ctx: { targetEnvironment: 'prod', testsPassing: true, rollbackPlanPresent: true } },
      { type: 'RUN_TESTS', ctx: { targetEnvironment: 'staging', testsPassing: true } },
    ];

    for (let i = 0; i < FUSION_ITERATIONS; i++) {
      const p = fusionPayloads[i % fusionPayloads.length];
      const start = performance.now();
      await api.post('/api/governance/fusion', {
        action: { type: p.type },
        context: p.ctx,
        ml_output: { risk_score: 0.3, uncertainty: 0.15, label: 'medium', decision: 'review', model_version: 'test', timestamp: new Date().toISOString() },
      });
      fusionLatencies.push(Math.round(performance.now() - start));
    }

    const avg = fusionLatencies.reduce((a, b) => a + b, 0) / fusionLatencies.length;
    const p95 = percentile(fusionLatencies, 95);

    if (avg < 100) {
      suite.pass(`Fusion evaluator throughput (${FUSION_ITERATIONS} requests)`, {
        value: `avg=${avg.toFixed(0)}ms p95=${p95.toFixed(0)}ms`,
      });
    } else if (avg < 500) {
      suite.warn(`Fusion evaluator throughput (${FUSION_ITERATIONS} requests)`, {
        value: `avg=${avg.toFixed(0)}ms p95=${p95.toFixed(0)}ms`,
      });
    } else {
      suite.fail('Fusion evaluator throughput', { info: `avg=${avg.toFixed(0)}ms` });
    }
  } catch (e) {
    suite.fail('Fusion evaluator throughput', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // END-TO-END PIPELINE (submit action → full classification)
  // ═══════════════════════════════════════════════════════════════════════════

  const e2eLatencies = [];
  const E2E_ITERATIONS = 5;

  try {
    for (let i = 0; i < E2E_ITERATIONS; i++) {
      const payload = {
        agent_name: `perf-agent-${i}`,
        proposed_action: 'Deploy service to staging with tests',
        environment: 'STAGING',
        action_type: 'DEPLOY_STAGING',
        description: 'Performance test action submission through full pipeline',
        user: 'PerfBench',
        context: {
          destructive: false, targetEnvironment: 'staging',
          testsPassing: true, rollbackPlanPresent: true,
          hasHumanApproval: false, touchesCriticalPaths: false,
        },
      };
      const start = performance.now();
      await api.post('/api/actions/submit', payload);
      e2eLatencies.push(Math.round(performance.now() - start));
    }

    const avg = e2eLatencies.reduce((a, b) => a + b, 0) / e2eLatencies.length;
    const p95 = percentile(e2eLatencies, 95);

    if (avg < 1000) {
      suite.pass(`E2E pipeline latency (${E2E_ITERATIONS} submissions)`, {
        value: `avg=${avg.toFixed(0)}ms p95=${p95.toFixed(0)}ms`,
      });
    } else if (avg < 3000) {
      suite.warn(`E2E pipeline latency (${E2E_ITERATIONS} submissions)`, {
        value: `avg=${avg.toFixed(0)}ms p95=${p95.toFixed(0)}ms`,
      });
    } else {
      suite.fail('E2E pipeline latency', { info: `avg=${avg.toFixed(0)}ms` });
    }
  } catch (e) {
    suite.fail('E2E pipeline latency', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENT REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    const CONCURRENT = 10;
    const promises = [];
    const start = performance.now();

    for (let i = 0; i < CONCURRENT; i++) {
      promises.push(
        api.post('/api/governance/fusion', {
          action: { type: 'READ' },
          context: { targetEnvironment: 'staging', testsPassing: true, destructive: false },
        })
      );
    }

    const results = await Promise.all(promises);
    const wallTime = Math.round(performance.now() - start);
    const allOk = results.every(r => r.ok);
    const avgLatency = results.reduce((s, r) => s + r.latency, 0) / results.length;

    if (allOk && wallTime < 2000) {
      suite.pass(`Concurrent load (${CONCURRENT} parallel requests)`, {
        value: `wall=${wallTime}ms avg=${avgLatency.toFixed(0)}ms all_ok=${allOk}`,
      });
    } else if (allOk) {
      suite.warn(`Concurrent load (${CONCURRENT} parallel)`, {
        value: `wall=${wallTime}ms — slower under load`,
      });
    } else {
      const failed = results.filter(r => !r.ok).length;
      suite.fail(`Concurrent load`, { info: `${failed}/${CONCURRENT} failed` });
    }
  } catch (e) {
    suite.fail('Concurrent load test', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESPONSE CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    // Same input should yield same classification (deterministic)
    const payload = { text: 'Deploy to staging with canary rollout and monitoring', context: { targetEnvironment: 'staging', testsPassing: true } };
    const r1 = await ml.post('/classify', payload);
    const r2 = await ml.post('/classify', payload);

    // Categories should be the same (model is deterministic after eval mode... but MC dropout may differ)
    // Check risk_category matches
    if (r1.data?.risk_category === r2.data?.risk_category) {
      suite.pass('Classification consistency — same input yields same category', {
        value: `${r1.data.risk_category} == ${r2.data.risk_category}`,
      });
    } else {
      suite.warn('Classification consistency — MC Dropout variance detected', {
        info: `${r1.data?.risk_category} vs ${r2.data?.risk_category}`,
      });
    }

    // Risk scores should be close
    const diff = Math.abs((r1.data?.risk_score || 0) - (r2.data?.risk_score || 0));
    if (diff < 0.1) {
      suite.pass('Score stability — risk scores within 0.1 tolerance', {
        value: `Δ=${diff.toFixed(4)}`,
      });
    } else {
      suite.warn('Score stability', { info: `Δ=${diff.toFixed(4)}` });
    }
  } catch (e) {
    suite.fail('Response consistency', { info: e.message });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE UPTIME
  // ═══════════════════════════════════════════════════════════════════════════

  try {
    const checks = await Promise.all([
      api.get('/health'),
      ml.get('/health'),
      api.get('/api/governance/fusion/health'),
    ]);

    const allUp = checks.every(c => c.ok);
    if (allUp) {
      suite.pass('All services healthy after load tests', {
        value: `backend=${checks[0].latency}ms  ml=${checks[1].latency}ms  fusion=${checks[2].latency}ms`,
      });
    } else {
      suite.fail('Service health post-load', { info: 'some services not responding' });
    }
  } catch (e) {
    suite.fail('Post-load health check', { info: e.message });
  }

  suite.endTime = Date.now();

  // ── Print Results ───────────────────────────────────────────────────────────
  printSuiteHeader(suite);
  printSuiteResults(suite);

  // Latency tables
  if (mlLatencies.length > 0) {
    printLatencyHistogram(mlLatencies, `${ICONS.brain}  ML Classify Latency Distribution (${ML_ITERATIONS} calls)`);
  }
  if (fusionLatencies.length > 0) {
    printLatencyHistogram(fusionLatencies, `${ICONS.shield}  Fusion Evaluator Latency Distribution (${FUSION_ITERATIONS} calls)`);
  }
  if (e2eLatencies.length > 0) {
    printLatencyHistogram(e2eLatencies, `${ICONS.rocket}  End-to-End Pipeline Latency (${E2E_ITERATIONS} submissions)`);
  }

  // Summary metrics
  const allLatencies = [...mlLatencies, ...fusionLatencies, ...e2eLatencies];
  if (allLatencies.length > 0) {
    const totalReqs = allLatencies.length;
    const avgAll = allLatencies.reduce((a, b) => a + b, 0) / totalReqs;
    const throughput = (totalReqs / ((suite.endTime - suite.startTime) / 1000)).toFixed(1);

    printMetricsTable(`${ICONS.chart}  Performance Summary`, [
      { label: 'Total Requests Made', value: `${totalReqs}` },
      { label: 'Global Avg Latency', value: `${avgAll.toFixed(0)}ms` },
      { label: 'Effective Throughput', value: `${throughput} req/s` },
      { label: 'ML p50 / p95', value: mlLatencies.length > 0 ? `${percentile(mlLatencies, 50).toFixed(0)}ms / ${percentile(mlLatencies, 95).toFixed(0)}ms` : 'N/A' },
      { label: 'Fusion p50 / p95', value: fusionLatencies.length > 0 ? `${percentile(fusionLatencies, 50).toFixed(0)}ms / ${percentile(fusionLatencies, 95).toFixed(0)}ms` : 'N/A' },
      { label: 'E2E p50 / p95', value: e2eLatencies.length > 0 ? `${percentile(e2eLatencies, 50).toFixed(0)}ms / ${percentile(e2eLatencies, 95).toFixed(0)}ms` : 'N/A' },
    ]);
  }

  return suite;
}
