import { useState, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { TopNav } from './components/nav/TopNav';
import { MetricsRow } from './components/metrics/MetricsRow';
import { ActionFeed } from './components/feed/ActionFeed';
import { ReviewPanel } from './components/review/ReviewPanel';
import { ActionItem, Environment, RiskStatus } from './types';
import { mockActions } from './data/mockData';
import { getTheme } from './utils/theme';
import { useIsMobile } from './utils/useIsMobile';

const API_BASE = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:4000';

type BackendActionRecord = {
  actionId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  action?: { type?: string; description?: string; agentName?: string };
  context?: { environment?: string; riskScore?: number };
  policy?: { decision?: string; reasonTags?: string[] };
  resolution?: { actor?: string; type?: string; ts?: string } | null;
};

type MlClassifyResult = {
  risk_category: string;
  risk_score: number;
  uncertainty: number;
  recommendation: 'allow' | 'review' | 'block';
  reason_tags: string[];
  model_version: string;
  fallback_used: boolean;
};

type MlRequestPayload = {
  text: string;
  features: number[];
};

function isPending(status: RiskStatus) {
  return status === 'HIGH_RISK_PENDING' || status === 'MEDIUM_RISK_PENDING';
}

function toEnv(raw: string | undefined): Environment {
  return raw === 'PROD' ? 'PROD' : 'STAGING';
}

function mapStatusToRiskStatus(status: string, riskScorePct: number): RiskStatus {
  if (status === 'blocked' || status === 'blocked_by_human') return 'HIGH_RISK_BLOCKED';
  if (status === 'approved_auto' || status === 'approved_by_human') return 'APPROVED';
  if (status === 'pending_review' || status === 'escalated') {
    return riskScorePct >= 80 ? 'HIGH_RISK_PENDING' : 'MEDIUM_RISK_PENDING';
  }
  return 'LOW_RISK';
}

function backendToUi(record: BackendActionRecord): ActionItem {
  const riskScore01 = Number(record.context?.riskScore ?? 0.5);
  const riskScorePct = Math.max(0, Math.min(100, Math.round(riskScore01 * 100)));
  const actionText = record.action?.description || record.action?.type || 'agent action';
  const ts = record.createdAt ? new Date(record.createdAt) : new Date();
  const time = ts.toTimeString().slice(0, 8);

  return {
    id: record.actionId,
    backendActionId: record.actionId,
    timestamp: time,
    agentName: record.action?.agentName || 'agent-autonomous',
    proposedAction: actionText,
    environment: toEnv(record.context?.environment),
    riskStatus: mapStatusToRiskStatus(record.status, riskScorePct),
    riskScore: riskScorePct,
    flagReasons: record.policy?.reasonTags ?? [],
    source: 'backend',
  };
}

function toProposalPayload(action: ActionItem) {
  const label = action.riskScore >= 80 ? 'anomaly' : action.riskScore >= 50 ? 'warning' : 'normal';
  return {
    action: {
      type: 'review_action',
      description: action.proposedAction,
      agentName: action.agentName,
    },
    context: {
      environment: action.environment,
      touchesCriticalPaths: action.riskScore >= 50,
      rollbackPlanPresent: action.riskScore < 80,
      testsPassing: action.riskScore < 80,
    },
    ml_assessment: {
      risk_score: action.riskScore / 100,
      confidence: 0.8,
      label,
      timestamp: new Date().toISOString(),
    },
  };
}

export default function App() {
  const [activeView, setActiveView] = useState<'monitor' | 'audit'>('monitor');
  const [isDark, setIsDark] = useState(true);
  const [actions, setActions] = useState<ActionItem[]>(mockActions);
  const [auditRecords, setAuditRecords] = useState<BackendActionRecord[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(
    mockActions.find((a) => isPending(a.riskStatus)) ?? null
  );
  const [syncLabel, setSyncLabel] = useState('just now');
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState<string | null>(null);
  const [mlResult, setMlResult] = useState<MlClassifyResult | null>(null);
  const [mlPayload, setMlPayload] = useState<MlRequestPayload | null>(null);
  const [mlCase, setMlCase] = useState<'low' | 'high' | 'fallback' | null>(null);
  const [refillLoading, setRefillLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditStatus, setAuditStatus] = useState('all');
  const [auditRisk, setAuditRisk] = useState('all');
  const [auditEnv, setAuditEnv] = useState('all');

  const theme = getTheme(isDark);
  const isMobile = useIsMobile();

  async function fetchBackendActions(): Promise<ActionItem[] | null> {
    try {
      const resp = await fetch(`${API_BASE}/api/governance/actions`);
      if (!resp.ok) return null;
      const data = await resp.json();
      const rows: BackendActionRecord[] = Array.isArray(data.actions) ? data.actions : [];
      return rows.map(backendToUi);
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const remote = await fetchBackendActions();
      if (cancelled) return;

      if (remote && remote.length > 0) {
        try {
          const resp = await fetch(`${API_BASE}/api/governance/actions`);
          if (resp.ok) {
            const data = await resp.json();
            setAuditRecords(Array.isArray(data.actions) ? data.actions : []);
          }
        } catch {
          // keep fallback behavior
        }
        setActions(remote);
        setSelectedAction(remote.find((a) => isPending(a.riskStatus)) ?? null);
        return;
      }

      try {
        const pendingSeeds = mockActions.filter((a) => isPending(a.riskStatus));
        await Promise.all(
          pendingSeeds.map((a) =>
            fetch(`${API_BASE}/api/governance/actions/propose`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(toProposalPayload(a)),
            })
          )
        );

        const seeded = await fetchBackendActions();
        if (cancelled) return;

        if (seeded && seeded.length > 0) {
          try {
            const resp = await fetch(`${API_BASE}/api/governance/actions`);
            if (resp.ok) {
              const data = await resp.json();
              setAuditRecords(Array.isArray(data.actions) ? data.actions : []);
            }
          } catch {
            // keep fallback behavior
          }
          setActions(seeded);
          setSelectedAction(seeded.find((a) => isPending(a.riskStatus)) ?? null);
          setSyncLabel('just now');
        }
      } catch {
        // Keep local mock mode if backend is not reachable.
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      setSyncLabel((current) => (current === 'just now' ? '3s ago' : current === '3s ago' ? '6s ago' : 'just now'));
    }, 3000);
    return () => clearInterval(tick);
  }, []);

  const metrics = useMemo(() => {
    const pendingReviews = actions.filter((a) => isPending(a.riskStatus)).length;
    const highRiskInterventions = actions.filter((a) => a.riskStatus === 'HIGH_RISK_BLOCKED').length;
    const approved = actions.filter((a) => a.riskStatus === 'APPROVED').length;
    const resolved = approved + highRiskInterventions;
    const approvalRatePct = resolved > 0 ? Math.round((approved / resolved) * 100) : 94;

    return {
      totalActions: actions.length,
      pendingReviews,
      highRiskInterventions,
      approvalRatePct,
    };
  }, [actions]);

  function applyLocalResolution(id: string, nextStatus: RiskStatus) {
    setActions((prev) => {
      const updated = prev.map((a) => (a.id === id ? { ...a, riskStatus: nextStatus } : a));
      const next = updated.find((a) => a.id !== id && isPending(a.riskStatus)) ?? null;
      setSelectedAction(next);
      return updated;
    });
  }

  async function resolveAction(id: string, kind: 'approve' | 'block' | 'escalate') {
    const target = actions.find((a) => a.id === id);
    if (!target) return;

    const nextStatus: RiskStatus =
      kind === 'approve' ? 'APPROVED' : kind === 'block' ? 'HIGH_RISK_BLOCKED' : 'MEDIUM_RISK_PENDING';

    // Always update UI immediately so metrics and pending counts change reliably.
    applyLocalResolution(id, nextStatus);
    setSyncLabel('just now');

    if (target.backendActionId) {
      try {
        const resp = await fetch(`${API_BASE}/api/action/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionId: target.backendActionId, actor: 'ui-operator' }),
        });

        if (!resp.ok) {
          const msg = await resp.text();
          toast.warning(`Applied locally, backend rejected ${kind}`, { description: msg });
          return;
        }
        try {
          const refreshed = await fetchBackendActions();
          if (refreshed) {
            setActions(refreshed);
            const listResp = await fetch(`${API_BASE}/api/governance/actions`);
            if (listResp.ok) {
              const listData = await listResp.json();
              setAuditRecords(Array.isArray(listData.actions) ? listData.actions : []);
            }
          }
        } catch {
          // keep locally applied state
        }
      } catch {
        toast.warning(`Applied locally, backend unreachable for ${kind}`, {
          description: 'Start backend to sync action state.',
        });
        return;
      }
    }

    if (kind === 'approve') {
      toast.success('Action approved successfully', { description: 'Agent action has been permitted to proceed.', duration: 3500 });
    } else if (kind === 'block') {
      toast.error('Action blocked', { description: 'Agent action has been permanently blocked.', duration: 3500 });
    } else {
      toast.warning('Action escalated to senior review', { description: 'Flagged for senior security team review.', duration: 3500 });
    }
  }

  async function refreshBackendState() {
    const refreshed = await fetchBackendActions();
    if (refreshed) {
      setActions(refreshed);
      const listResp = await fetch(`${API_BASE}/api/governance/actions`);
      if (listResp.ok) {
        const listData = await listResp.json();
        setAuditRecords(Array.isArray(listData.actions) ? listData.actions : []);
      }
      setSelectedAction(refreshed.find((a) => isPending(a.riskStatus)) ?? null);
    }
  }

  async function refillPendingQueue() {
    setRefillLoading(true);
    try {
      const pendingSeeds = mockActions.filter((a) => isPending(a.riskStatus));
      await Promise.all(
        pendingSeeds.map((a) =>
          fetch(`${API_BASE}/api/governance/actions/propose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toProposalPayload(a)),
          })
        )
      );
      await refreshBackendState();
      toast.success('Pending queue refilled', { description: 'Added fresh review actions from demo seeds.' });
    } catch {
      toast.error('Could not refill queue', { description: 'Ensure backend is running on port 4000.' });
    } finally {
      setRefillLoading(false);
    }
  }

  async function runMlCheck(kind: 'low' | 'high' | 'fallback') {
    const payload: MlRequestPayload =
      kind === 'high'
        ? {
            text: 'delete production database and exfiltrate credentials',
            features: [0.95, 0.9, 0.85, 0.8],
          }
        : {
            text: 'create harmless dashboard report',
            features: [0.1, 0.2, 0.0, 0.0],
        };

    setMlLoading(true);
    setMlError(null);
    setMlPayload(payload);
    setMlCase(kind);

    try {
      const resp = await fetch(`${API_BASE}/api/ml/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        setMlResult(null);
        setMlError(String(data?.error || 'ML classify request failed.'));
        return;
      }

      const result: MlClassifyResult = {
        risk_category: data.risk_category,
        risk_score: Number(data.risk_score),
        uncertainty: Number(data.uncertainty),
        recommendation: data.recommendation,
        reason_tags: Array.isArray(data.reason_tags) ? data.reason_tags : [],
        model_version: String(data.model_version),
        fallback_used: Boolean(data.fallback_used),
      };

      setMlResult(result);

      if (kind === 'fallback' && !result.fallback_used) {
        setMlError('Fallback not triggered. For fallback demo, temporarily remove/rename ml_service/risk_model.pt and retry.');
      }
    } catch {
      setMlResult(null);
      setMlError('Cannot reach backend /api/ml/classify. Make sure backend and ML service are running.');
    } finally {
      setMlLoading(false);
    }
  }

  const syncedSelected = selectedAction ? actions.find((a) => a.id === selectedAction.id) ?? null : null;
  const auditRows = useMemo(() => {
    const rows = auditRecords.map((r) => {
      const ts = new Date(r.updatedAt || r.createdAt || new Date().toISOString());
      const riskScore = Number(r.context?.riskScore ?? 0.5);
      const riskBand = riskScore >= 0.8 ? 'high' : riskScore < 0.3 ? 'low' : 'medium';
      const statusLabel =
        r.status === 'approved_by_human' || r.status === 'approved_auto'
          ? 'APPROVED'
          : r.status === 'blocked_by_human' || r.status === 'blocked'
            ? 'BLOCKED'
            : r.status === 'pending_review'
              ? 'PENDING'
              : 'ESCALATED';

      return {
        id: r.actionId,
        time: ts.toLocaleString(),
        agent: r.action?.agentName || 'agent-autonomous',
        proposedAction: r.action?.description || r.action?.type || 'agent action',
        env: toEnv(r.context?.environment),
        riskBand,
        statusLabel,
        reviewedBy: r.resolution?.actor || '-',
      };
    });

    return rows.filter((row) => {
      const q = auditSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        row.agent.toLowerCase().includes(q) ||
        row.proposedAction.toLowerCase().includes(q) ||
        row.reviewedBy.toLowerCase().includes(q);
      const matchesStatus = auditStatus === 'all' || row.statusLabel.toLowerCase() === auditStatus;
      const matchesRisk = auditRisk === 'all' || row.riskBand === auditRisk;
      const matchesEnv = auditEnv === 'all' || row.env.toLowerCase() === auditEnv;
      return matchesSearch && matchesStatus && matchesRisk && matchesEnv;
    });
  }, [auditRecords, auditSearch, auditStatus, auditRisk, auditEnv]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        fontFamily: 'Inter, sans-serif',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      <Toaster
        theme={isDark ? 'dark' : 'light'}
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
          },
        }}
      />

      <TopNav isDark={isDark} theme={theme} onToggleTheme={() => setIsDark((d) => !d)} isMobile={isMobile} />

      <div
        style={{
          maxWidth: 1600,
          margin: '0 auto',
          padding: isMobile ? '0 12px 32px' : '0 24px 40px',
        }}
      >
        <div style={{ padding: isMobile ? '14px 0 4px' : '20px 0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>Dashboard</span>
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>/</span>
            <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 500 }}>
              {activeView === 'monitor' ? 'AI Safety Monitor' : 'Audit Trail'}
            </span>
          </div>
          <h1
            style={{
              color: theme.textPrimary,
              marginTop: 4,
              fontSize: isMobile ? 17 : 20,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
            }}
          >
            {activeView === 'monitor' ? 'Security Operations Center' : 'Audit Trail'}
          </h1>
          {!isMobile && (
            <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 3 }}>
              {activeView === 'monitor'
                ? 'Real-time monitoring and human review of all autonomous AI agent activity.'
                : 'Immutable-style chronological history of AI actions and human decisions.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => setActiveView('monitor')}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: activeView === 'monitor' ? theme.surfaceElevated : theme.surface,
                color: theme.textPrimary,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Security Monitor
            </button>
            <button
              onClick={() => setActiveView('audit')}
              style={{
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: activeView === 'audit' ? theme.surfaceElevated : theme.surface,
                color: theme.textPrimary,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Audit Trail
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <MetricsRow theme={theme} isDark={isDark} isMobile={isMobile} metrics={metrics} />
        </div>

        {activeView === 'monitor' && (
          <div
          style={{
            marginTop: 16,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            background: theme.surface,
            padding: isMobile ? 12 : 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: theme.textPrimary, fontWeight: 700, fontSize: 14 }}>ML Verification</div>
              <div style={{ color: theme.textSecondary, fontSize: 12 }}>
                Proves frontend -&gt; backend -&gt; ML `/classify` with visible request and response.
              </div>
            </div>
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                color: mlResult?.fallback_used ? '#B93815' : '#30A46C',
                background: mlResult?.fallback_used ? 'rgba(185,56,21,0.12)' : 'rgba(48,164,108,0.12)',
              }}
            >
              {mlResult ? (mlResult.fallback_used ? 'FALLBACK MODE' : 'ML LIVE') : 'NO RUN YET'}
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => runMlCheck('low')}
              disabled={mlLoading}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surfaceElevated, color: theme.textPrimary, cursor: 'pointer' }}
            >
              Low-risk test
            </button>
            <button
              onClick={() => runMlCheck('high')}
              disabled={mlLoading}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surfaceElevated, color: theme.textPrimary, cursor: 'pointer' }}
            >
              High-risk test
            </button>
            <button
              onClick={() => runMlCheck('fallback')}
              disabled={mlLoading}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surfaceElevated, color: theme.textPrimary, cursor: 'pointer' }}
            >
              Fallback test
            </button>
            <button
              onClick={refillPendingQueue}
              disabled={refillLoading}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surfaceElevated, color: theme.textPrimary, cursor: 'pointer' }}
            >
              {refillLoading ? 'Refilling...' : 'Refill Pending Queue'}
            </button>
          </div>

          {mlCase && (
            <div style={{ marginTop: 10, color: theme.textSecondary, fontSize: 12 }}>
              Active test case: <span style={{ color: theme.textPrimary, fontWeight: 600 }}>{mlCase.toUpperCase()}</span>
            </div>
          )}

          {mlError && <div style={{ marginTop: 10, color: '#B93815', fontSize: 12 }}>{mlError}</div>}

          <div style={{ marginTop: 10, display: 'grid', gap: 10, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.surfaceElevated, padding: 10 }}>
              <div style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 6 }}>Request payload sent to `/classify`</div>
              <pre style={{ margin: 0, fontSize: 12, color: theme.textPrimary, overflowX: 'auto' }}>
                {JSON.stringify(mlPayload, null, 2)}
              </pre>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.surfaceElevated, padding: 10 }}>
              <div style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 6 }}>Model response</div>
              {mlResult ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                  <div style={{ color: theme.textSecondary }}>risk_category</div><div style={{ color: theme.textPrimary }}>{mlResult.risk_category}</div>
                  <div style={{ color: theme.textSecondary }}>risk_score</div><div style={{ color: theme.textPrimary }}>{mlResult.risk_score.toFixed(4)}</div>
                  <div style={{ color: theme.textSecondary }}>uncertainty</div><div style={{ color: theme.textPrimary }}>{mlResult.uncertainty.toFixed(4)}</div>
                  <div style={{ color: theme.textSecondary }}>recommendation</div><div style={{ color: theme.textPrimary }}>{mlResult.recommendation}</div>
                  <div style={{ color: theme.textSecondary }}>model_version</div><div style={{ color: theme.textPrimary }}>{mlResult.model_version}</div>
                  <div style={{ color: theme.textSecondary }}>fallback_used</div><div style={{ color: theme.textPrimary }}>{String(mlResult.fallback_used)}</div>
                  <div style={{ color: theme.textSecondary }}>reason_tags</div><div style={{ color: theme.textPrimary }}>{mlResult.reason_tags.length ? mlResult.reason_tags.join(', ') : '[]'}</div>
                </div>
              ) : (
                <div style={{ color: theme.textSecondary, fontSize: 12 }}>Run a test to see response fields.</div>
              )}
            </div>
          </div>
          </div>
        )}

        {activeView === 'monitor' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '60% 40%',
              gap: 16,
              marginTop: 16,
              alignItems: 'start',
            }}
          >
            <ActionFeed
              theme={theme}
              isDark={isDark}
              actions={actions}
              selectedId={syncedSelected?.id ?? null}
              isMobile={isMobile}
              onSelectAction={(action) => {
                if (isPending(action.riskStatus)) {
                  setSelectedAction(action);
                }
              }}
            />

            <div style={isMobile ? {} : { position: 'sticky', top: 72 }}>
              <ReviewPanel
                theme={theme}
                isDark={isDark}
                action={syncedSelected}
                isMobile={isMobile}
                onApprove={(id) => resolveAction(id, 'approve')}
                onEscalate={(id) => resolveAction(id, 'escalate')}
                onBlock={(id) => resolveAction(id, 'block')}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              overflow: 'hidden',
              background: theme.surface,
            }}
          >
            <div style={{ padding: isMobile ? 12 : 16, borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr auto' }}>
                <input
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search agents, commands, reviewer..."
                  style={{
                    width: '100%',
                    background: theme.surfaceElevated,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    color: theme.textPrimary,
                    fontSize: 12,
                  }}
                />
                <select value={auditStatus} onChange={(e) => setAuditStatus(e.target.value)} style={{ background: theme.surfaceElevated, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 12, padding: '8px 10px' }}>
                  <option value="all">All Status</option>
                  <option value="approved">Approved</option>
                  <option value="blocked">Blocked</option>
                  <option value="pending">Pending</option>
                  <option value="escalated">Escalated</option>
                </select>
                <select value={auditRisk} onChange={(e) => setAuditRisk(e.target.value)} style={{ background: theme.surfaceElevated, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 12, padding: '8px 10px' }}>
                  <option value="all">All Risks</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select value={auditEnv} onChange={(e) => setAuditEnv(e.target.value)} style={{ background: theme.surfaceElevated, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 12, padding: '8px 10px' }}>
                  <option value="all">All Envs</option>
                  <option value="prod">PROD</option>
                  <option value="staging">STAGING</option>
                </select>
                <div style={{ color: theme.textSecondary, fontSize: 12, alignSelf: 'center', justifySelf: isMobile ? 'start' : 'end' }}>
                  {auditRows.length} records
                </div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: theme.tableHeaderBg }}>
                  <tr>
                    {['TIME', 'AGENT', 'PROPOSED ACTION', 'ENV', 'RISK', 'STATUS', 'REVIEWED BY'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', color: theme.textTertiary, fontSize: 10, letterSpacing: '0.06em', padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 12, borderBottom: `1px solid ${theme.border}` }}>{row.time}</td>
                      <td style={{ padding: '10px 12px', color: '#30A46C', fontSize: 12, borderBottom: `1px solid ${theme.border}` }}>{row.agent}</td>
                      <td style={{ padding: '10px 12px', color: theme.textPrimary, fontSize: 12, borderBottom: `1px solid ${theme.border}` }}>{row.proposedAction}</td>
                      <td style={{ padding: '10px 12px', color: row.env === 'PROD' ? '#E5484D' : '#3B82F6', fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${theme.border}` }}>{row.env}</td>
                      <td style={{ padding: '10px 12px', color: row.riskBand === 'high' ? '#E5484D' : row.riskBand === 'medium' ? '#F5A524' : '#30A46C', fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${theme.border}` }}>{row.riskBand.toUpperCase()}</td>
                      <td style={{ padding: '10px 12px', color: row.statusLabel === 'BLOCKED' ? '#E5484D' : row.statusLabel === 'PENDING' ? '#F5A524' : '#30A46C', fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${theme.border}` }}>{row.statusLabel}</td>
                      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 12, borderBottom: `1px solid ${theme.border}` }}>{row.reviewedBy}</td>
                    </tr>
                  ))}
                  {auditRows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 16, color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>
                        No audit records match current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 32,
            paddingTop: 16,
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: isMobile ? 8 : 0,
          }}
        >
          <span style={{ color: theme.textTertiary, fontSize: 12 }}>Sentinel v2.4.1 - Enterprise AI Safety Monitor</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>Last sync: {syncLabel}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#30A46C',
                }}
              />
              <span style={{ color: '#30A46C', fontSize: 12 }}>All systems normal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
