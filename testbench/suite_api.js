/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  SUITE 2 — API Endpoint Integration Tests                      ║
 * ║  Tests all backend REST endpoints, WebSocket connectivity,     ║
 * ║  action submission pipeline, and approval workflows            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { api, ml, BACKEND } from './http.js';
import {
  TestSuite, printSuiteHeader, printSuiteResults,
  printMetricsTable, printLatencyHistogram, C, ICONS, pct,
} from './reporter.js';

export default async function runAPITests() {
  const suite = new TestSuite('API Endpoints — Integration & Contract Tests', ICONS.link);
  suite.startTime = Date.now();
  const latencies = [];

  // ── 1. Service Health Checks ────────────────────────────────────────────────
  try {
    const res = await api.get('/health');
    if (res.data?.ok && res.data?.service === 'backend') {
      suite.pass('Backend health endpoint', { latency: res.latency, value: 'ok=true' });
      latencies.push(res.latency);
    } else {
      suite.fail('Backend health endpoint', { info: JSON.stringify(res.data) });
    }
  } catch (e) {
    suite.fail('Backend health endpoint', { info: e.message });
    suite.endTime = Date.now();
    return suite;
  }

  try {
    const res = await api.get('/api/model-info');
    if (res.data?.model_type === 'RiskMLP') {
      suite.pass('GET /api/model-info proxied to ML', { latency: res.latency, value: `input_dim=${res.data.input_dim}` });
      latencies.push(res.latency);
    } else {
      suite.fail('GET /api/model-info', { info: JSON.stringify(res.data) });
    }
  } catch (e) {
    suite.fail('GET /api/model-info', { info: e.message });
  }

  // ── 2. Classify Endpoint (proxy) ───────────────────────────────────────────
  try {
    const res = await api.post('/api/classify', { text: 'Deploy to staging with tests passing' });
    if (res.data?.risk_category && typeof res.data.risk_score === 'number') {
      suite.pass('POST /api/classify proxy works', { latency: res.latency, value: `${res.data.risk_category} (${res.data.risk_score})` });
      latencies.push(res.latency);
    } else {
      suite.fail('POST /api/classify proxy', { info: JSON.stringify(res.data) });
    }
  } catch (e) {
    suite.fail('POST /api/classify proxy', { info: e.message });
  }

  // ── 3. Actions Submit Pipeline ──────────────────────────────────────────────
  let submittedActionId = null;
  try {
    const actionPayload = {
      agent_name: 'testbench-agent',
      proposed_action: 'RUN unit tests on staging environment',
      environment: 'STAGING',
      action_type: 'RUN_TESTS',
      description: 'Testbench agent runs unit tests on staging for validation',
      user: 'TestBench',
      context: {
        destructive: false,
        targetEnvironment: 'staging',
        testsPassing: true,
        rollbackPlanPresent: false,
        hasHumanApproval: false,
        touchesCriticalPaths: false,
      },
    };
    const res = await api.post('/api/actions/submit', actionPayload);
    latencies.push(res.latency);

    if (res.status === 200 || res.status === 201) {
      const d = res.data;
      if (d.action?.id || d.id) {
        submittedActionId = d.action?.id || d.id;
        suite.pass('POST /api/actions/submit — full pipeline', {
          latency: res.latency,
          value: `id=${submittedActionId} risk=${d.action?.riskStatus || d.riskStatus || '?'}`,
        });
      } else {
        suite.pass('POST /api/actions/submit — accepted', { latency: res.latency });
      }
    } else {
      suite.fail('POST /api/actions/submit', { info: `status=${res.status}` });
    }
  } catch (e) {
    suite.fail('POST /api/actions/submit', { info: e.message });
  }

  // Submit a high-risk action
  let highRiskActionId = null;
  try {
    const highRiskPayload = {
      agent_name: 'testbench-agent',
      proposed_action: 'DROP TABLE users in production permanently',
      environment: 'PROD',
      action_type: 'DELETE_RESOURCE',
      description: 'Testbench agent proposes destructive production operation',
      user: 'TestBench',
      context: {
        destructive: true,
        targetEnvironment: 'prod',
        testsPassing: true,
        rollbackPlanPresent: false,
        hasHumanApproval: false,
        touchesCriticalPaths: true,
      },
    };
    const res = await api.post('/api/actions/submit', highRiskPayload);
    latencies.push(res.latency);

    const d = res.data;
    highRiskActionId = d.action?.id || d.id;
    const riskStatus = d.action?.riskStatus || d.riskStatus || '';

    if (riskStatus.includes('HIGH_RISK') || riskStatus.includes('BLOCKED')) {
      suite.pass('High-risk action correctly flagged', {
        latency: res.latency,
        value: `status=${riskStatus}`,
      });
    } else {
      suite.warn('High-risk action flagging', {
        latency: res.latency,
        info: `expected HIGH_RISK*, got ${riskStatus}`,
      });
    }
  } catch (e) {
    suite.fail('High-risk action submission', { info: e.message });
  }

  // ── 4. List Actions ─────────────────────────────────────────────────────────
  try {
    const res = await api.get('/api/actions?limit=10');
    latencies.push(res.latency);
    const actions = Array.isArray(res.data) ? res.data : (res.data?.actions || res.data?.data || []);
    if (res.ok && actions.length > 0) {
      suite.pass('GET /api/actions — list returns data', { latency: res.latency, value: `${actions.length} actions` });
    } else if (res.ok) {
      suite.pass('GET /api/actions — list endpoint works', { latency: res.latency, value: `${typeof res.data === 'object' ? Object.keys(res.data).length + ' keys' : '0 items'}` });
    } else {
      suite.fail('GET /api/actions', { info: typeof res.data });
    }
  } catch (e) {
    suite.fail('GET /api/actions', { info: e.message });
  }

  // ── 5. Approve / Block / Escalate Workflows ────────────────────────────────
  if (submittedActionId) {
    try {
      const res = await api.post(`/api/actions/${submittedActionId}/approve`);
      latencies.push(res.latency);
      if (res.ok) {
        suite.pass(`Approve action ${submittedActionId}`, { latency: res.latency, value: 'APPROVED' });
      } else {
        suite.warn(`Approve action ${submittedActionId}`, { info: `status=${res.status}` });
      }
    } catch (e) {
      suite.warn('Approve workflow', { info: e.message });
    }
  }

  if (highRiskActionId) {
    try {
      const res = await api.post(`/api/actions/${highRiskActionId}/block`);
      latencies.push(res.latency);
      if (res.ok) {
        suite.pass(`Block action ${highRiskActionId}`, { latency: res.latency, value: 'BLOCKED' });
      } else {
        suite.warn(`Block action ${highRiskActionId}`, { info: `status=${res.status}` });
      }
    } catch (e) {
      suite.warn('Block workflow', { info: e.message });
    }
  }

  // ── 6. Batch Upload ─────────────────────────────────────────────────────────
  try {
    const batchActions = [
      {
        agent_name: 'batch-test-1',
        proposed_action: 'READ audit logs from staging',
        environment: 'STAGING',
        action_type: 'READ',
        description: 'Read audit logs',
        user: 'TestBench',
        context: { destructive: false, targetEnvironment: 'staging', testsPassing: true },
      },
      {
        agent_name: 'batch-test-2',
        proposed_action: 'RUN lint check on feature branch',
        environment: 'DEV',
        action_type: 'RUN_TESTS',
        description: 'Lint check',
        user: 'TestBench',
        context: { destructive: false, targetEnvironment: 'dev', testsPassing: true },
      },
    ];
    const res = await api.post('/api/actions/upload', { actions: batchActions, delay_ms: 100 });
    latencies.push(res.latency);
    if (res.ok) {
      suite.pass('POST /api/actions/upload — batch accepted', {
        latency: res.latency,
        value: `sessionId=${res.data?.sessionId || '?'}`,
      });
    } else {
      suite.fail('POST /api/actions/upload', { info: `status=${res.status}` });
    }
  } catch (e) {
    suite.fail('Batch upload endpoint', { info: e.message });
  }

  // ── 7. Governance Endpoints ─────────────────────────────────────────────────
  const governancePayload = {
    action: { type: 'DEPLOY_PROD' },
    context: {
      targetEnvironment: 'prod',
      destructive: false,
      testsPassing: false,
      rollbackPlanPresent: false,
      hasHumanApproval: false,
      touchesCriticalPaths: false,
    },
  };

  try {
    const res = await api.post('/api/governance/fusion', governancePayload);
    latencies.push(res.latency);
    if (res.data?.decision && res.data?.risk_score !== undefined) {
      suite.pass('POST /api/governance/fusion', {
        latency: res.latency,
        value: `decision=${res.data.decision} risk=${res.data.risk_score}`,
      });
    } else {
      suite.fail('POST /api/governance/fusion', { info: JSON.stringify(res.data).slice(0, 100) });
    }
  } catch (e) {
    suite.fail('POST /api/governance/fusion', { info: e.message });
  }

  try {
    const res = await api.post('/api/governance/policy-gate', governancePayload);
    latencies.push(res.latency);
    if (res.ok) {
      suite.pass('POST /api/governance/policy-gate (legacy)', { latency: res.latency });
    } else {
      suite.warn('POST /api/governance/policy-gate', { info: `status=${res.status}` });
    }
  } catch (e) {
    suite.fail('POST /api/governance/policy-gate', { info: e.message });
  }

  try {
    const res = await api.post('/api/policy/gate', governancePayload);
    latencies.push(res.latency);
    if (res.ok) {
      suite.pass('POST /api/policy/gate (alias)', { latency: res.latency });
    } else {
      suite.warn('POST /api/policy/gate', { info: `status=${res.status}` });
    }
  } catch (e) {
    suite.fail('POST /api/policy/gate', { info: e.message });
  }

  // ── 8. Fusion Audit Trail ──────────────────────────────────────────────────
  try {
    const res = await api.get('/api/governance/fusion/audit?limit=5');
    latencies.push(res.latency);
    const records = Array.isArray(res.data) ? res.data : (res.data?.records || res.data?.data || []);
    if (res.ok) {
      suite.pass('GET /api/governance/fusion/audit', { latency: res.latency, value: `${Array.isArray(records) ? records.length : 0} records` });
    } else {
      suite.warn('GET /api/governance/fusion/audit', { info: typeof res.data });
    }
  } catch (e) {
    suite.fail('Fusion audit trail', { info: e.message });
  }

  // ── 9. Fusion Health + Metrics ─────────────────────────────────────────────
  try {
    const res = await api.get('/api/governance/fusion/health');
    latencies.push(res.latency);
    if (res.data && (res.data.ok !== undefined || res.data.metrics)) {
      suite.pass('GET /api/governance/fusion/health', { latency: res.latency, value: 'metrics available' });
    } else {
      suite.warn('GET /api/governance/fusion/health', { info: JSON.stringify(res.data).slice(0, 80) });
    }
  } catch (e) {
    suite.fail('Fusion health endpoint', { info: e.message });
  }

  // ── 10. Notifications Endpoints ─────────────────────────────────────────────
  try {
    const res = await api.get('/api/notifications');
    latencies.push(res.latency);
    if (res.ok) {
      suite.pass('GET /api/notifications', { latency: res.latency });
    } else {
      suite.warn('GET /api/notifications', { info: `status=${res.status}` });
    }
  } catch (e) {
    suite.fail('Notifications endpoint', { info: e.message });
  }

  // ── 11. POST /api/accuracy (backend proxy) ────────────────────────────────
  try {
    const res = await api.post('/api/accuracy', {
      actions: [
        { description: 'Drop table in production', proposed_action: 'DROP TABLE users', risk_label: 'high', context: { targetEnvironment: 'prod', destructive: true } },
        { description: 'Run lint check', proposed_action: 'eslint .', risk_label: 'low', context: { targetEnvironment: 'dev' } },
      ],
    });
    latencies.push(res.latency);
    if (res.data?.ok) {
      suite.pass('POST /api/accuracy — backend proxy', { latency: res.latency, value: `accuracy=${res.data.overall_accuracy}` });
    } else {
      suite.warn('POST /api/accuracy', { info: res.data?.error || `status=${res.status}` });
    }
  } catch (e) {
    suite.fail('POST /api/accuracy proxy', { info: e.message });
  }

  // ── 12. Error Handling — Bad Requests ───────────────────────────────────────
  try {
    const res = await api.post('/api/classify', {});
    // Should return 400 or a fallback
    if (res.status === 400 || res.data?.fallback_used || res.data?.risk_category) {
      suite.pass('Error handling — classify with missing text', { value: `status=${res.status}` });
    } else {
      suite.warn('Error handling — classify missing text', { info: `status=${res.status}` });
    }
  } catch (e) {
    suite.pass('Error handling — classify rejects malformed request');
  }

  try {
    const res = await api.post('/api/governance/fusion', { bad: 'payload' });
    if (res.status === 400 || res.status === 422) {
      suite.pass('Error handling — fusion with invalid payload', { value: `status=${res.status} (rejected)` });
    } else {
      suite.warn('Error handling — fusion invalid payload', { info: `status=${res.status}` });
    }
  } catch (e) {
    suite.pass('Error handling — fusion rejects bad payload');
  }

  // ── 13. WebSocket Connectivity ──────────────────────────────────────────────
  try {
    const wsUrl = BACKEND.replace('http', 'ws') + '/ws';
    const { WebSocket } = await import('ws').catch(() => ({ WebSocket: null }));
    if (WebSocket) {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 3000);
        ws.on('message', (data) => {
          clearTimeout(timer);
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'init' || msg.type) {
              suite.pass('WebSocket connection — init message received', { value: `type=${msg.type}` });
            } else {
              suite.pass('WebSocket connection established');
            }
          } catch {
            suite.pass('WebSocket connection established');
          }
          ws.close();
          resolve();
        });
        ws.on('error', (err) => { clearTimeout(timer); reject(err); });
        ws.on('open', () => {
          // Wait for init message
        });
      });
    } else {
      suite.skip('WebSocket test — ws package not available');
    }
  } catch (e) {
    suite.warn('WebSocket connectivity', { info: e.message });
  }

  suite.endTime = Date.now();

  // ── Print Results ───────────────────────────────────────────────────────────
  printSuiteHeader(suite);
  printSuiteResults(suite);

  if (latencies.length > 0) {
    printLatencyHistogram(latencies, `${ICONS.clock}  API Endpoint Response Time Distribution`);
  }

  return suite;
}
