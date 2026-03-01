import { useState, useEffect, useRef, useCallback } from 'react';
import { Toaster, toast } from 'sonner';
import { TopNav } from './components/nav/TopNav';
import { MetricsRow } from './components/metrics/MetricsRow';
import { ActionFeed } from './components/feed/ActionFeed';
import { ReviewPanel } from './components/review/ReviewPanel';
import { ActionItem } from './types';
import { mockActions } from './data/mockData';
import { getTheme } from './utils/theme';
import { useIsMobile } from './utils/useIsMobile';
import {
  getActions,
  approveAction,
  blockAction,
  type ActionRecord,
} from '../api/client';
import { escalateAction } from './api/client';
import { useSignalsWs, type WsStatus } from './hooks/useSignalsWs';

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [actions, setActions] = useState<ActionItem[]>(mockActions);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(
    mockActions.find((a) => a.riskStatus === 'HIGH_RISK_PENDING') ?? null
  );
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const theme = getTheme(isDark);
  const isMobile = useIsMobile();

  // ─── Map backend action → UI ActionItem ──────────────────────────────────
  const toUI = useCallback((a: ActionRecord): ActionItem => {
    const statusMap: Record<string, ActionItem['riskStatus']> = {
      pending_review: 'HIGH_RISK_PENDING',
      blocked: 'HIGH_RISK_BLOCKED',
      blocked_by_human: 'HIGH_RISK_BLOCKED',
      approved_auto: 'APPROVED',
      approved_by_human: 'APPROVED',
      escalated: 'MEDIUM_RISK_PENDING',
    };
    return {
      id: a.actionId,
      timestamp: new Date(a.createdAt).toLocaleTimeString('en-US', { hour12: false }),
      agentName: a.action?.target ?? 'unknown-agent',
      proposedAction: `${a.action?.type ?? 'UNKNOWN'} ${a.action?.target ?? ''}`,
      environment: ((a.context as Record<string, unknown>)?.environment as ActionItem['environment']) ?? 'PROD',
      riskStatus: statusMap[a.status] ?? 'MEDIUM_RISK_PENDING',
      riskScore: Math.round(((a.context as Record<string, unknown>)?.riskScore as number ?? 50) * 100),
      flagReasons: a.policy?.reasonTags ?? [],
      source: 'sentinel-backend',
    };
  }, []);

  // ─── Load actions from backend (used on mount + after mutations) ──────────
  const loadActions = useCallback(async () => {
    try {
      const res = await getActions();
      if (res.actions.length > 0) {
        const mapped = res.actions.map(toUI);
        setActions(mapped);
        setSelectedAction((prev) =>
          prev
            ? mapped.find((a) => a.id === prev.id) ?? mapped.find((a) => a.riskStatus === 'HIGH_RISK_PENDING') ?? null
            : mapped.find((a) => a.riskStatus === 'HIGH_RISK_PENDING') ?? null,
        );
      }
      setLastFetchedAt(new Date());
    } catch {
      // backend unreachable — keep current data
    }
  }, [toUI]);

  // ─── Fetch on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    loadActions();
  }, [loadActions]);

  // ─── WebSocket: live governance signals (with backoff reconnect) ──────────
  const handleWsEvent = useCallback(
    (evt: import('../api/client').WsSignalEvent) => {
      const statusMap: Record<string, ActionItem['riskStatus']> = {
        approved_by_human: 'APPROVED',
        blocked_by_human: 'HIGH_RISK_BLOCKED',
        escalated: 'MEDIUM_RISK_PENDING',
      };

      // new_action → append to feed
      if (evt.type === 'new_action' && evt.action) {
        const newItem = toUI(evt.action);
        setActions((prev) => {
          if (prev.some((a) => a.id === newItem.id)) return prev;
          return [newItem, ...prev];
        });
        setLastFetchedAt(new Date());
        toast.info(`New action proposed: ${evt.actionId}`, { duration: 3000 });
        return;
      }

      // action_updated → replace in-place with full record
      if (evt.type === 'action_updated' && evt.action) {
        const updated = toUI(evt.action);
        setActions((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a)),
        );
        setLastFetchedAt(new Date());
        toast.info(`Action ${evt.actionId} → ${evt.decision}`, { duration: 3000 });
        return;
      }

      // Legacy fallback: partial status update
      const newStatus = statusMap[evt.status];
      if (!newStatus) return;
      setActions((prev) =>
        prev.map((a) =>
          a.id === evt.actionId ? { ...a, riskStatus: newStatus } : a,
        ),
      );
      toast.info(`Action ${evt.actionId} → ${evt.decision}`, { duration: 3000 });
    },
    [toUI],
  );

  const wsStatus: WsStatus = useSignalsWs({ onEvent: handleWsEvent });

  /** Live "last sync" timer — driven by real lastFetchedAt */
  const [syncLabel, setSyncLabel] = useState('never');
  const lastFetchedRef = useRef(lastFetchedAt);
  lastFetchedRef.current = lastFetchedAt;

  useEffect(() => {
    const update = () => {
      const ts = lastFetchedRef.current;
      if (!ts) { setSyncLabel('never'); return; }
      const elapsed = Math.floor((Date.now() - ts.getTime()) / 1000);
      if (elapsed < 5) setSyncLabel('just now');
      else if (elapsed < 60) setSyncLabel(`${elapsed}s ago`);
      else setSyncLabel(`${Math.floor(elapsed / 60)}m ago`);
    };
    update();
    const tick = setInterval(update, 3000);
    return () => clearInterval(tick);
  }, [lastFetchedAt]);

  const handleApprove = async (id: string) => {
    // Optimistic UI update
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, riskStatus: 'APPROVED' } : a))
    );
    const next = actions.find(
      (a) => a.id !== id && (a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING')
    );
    setSelectedAction(next ?? null);
    try {
      await approveAction(id);
      toast.success('Action approved successfully', {
        description: 'Agent action has been permitted to proceed.',
        duration: 3500,
      });
      await loadActions();
    } catch {
      toast.error('Backend approve failed – local update only');
    }
  };

  const handleEscalate = async (id: string) => {
    const next = actions.find(
      (a) => a.id !== id && (a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING')
    );
    setSelectedAction(next ?? null);
    try {
      await escalateAction(id);
      toast.warning('Action escalated to senior review', {
        description: 'Flagged for senior security team review.',
        duration: 3500,
      });
      await loadActions();
    } catch {
      toast.error('Backend escalate failed – local update only');
    }
  };

  const handleBlock = async (id: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, riskStatus: 'HIGH_RISK_BLOCKED' } : a))
    );
    const next = actions.find(
      (a) => a.id !== id && (a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING')
    );
    setSelectedAction(next ?? null);
    try {
      await blockAction(id);
      toast.error('Action blocked', {
        description: 'Agent action has been permanently blocked.',
        duration: 3500,
      });
      await loadActions();
    } catch {
      toast.error('Backend block failed – local update only');
    }
  };

  // Keep selectedAction in sync with updated actions list
  const syncedSelected = selectedAction
    ? actions.find((a) => a.id === selectedAction.id) ?? null
    : null;

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

      {/* Navigation */}
      <TopNav isDark={isDark} theme={theme} onToggleTheme={() => setIsDark((d) => !d)} isMobile={isMobile} />

      {/* Page content */}
      <div
        style={{
          maxWidth: 1600,
          margin: '0 auto',
          padding: isMobile ? '0 12px 32px' : '0 24px 40px',
        }}
      >
        {/* Page title / breadcrumb */}
        <div style={{ padding: isMobile ? '14px 0 4px' : '20px 0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>Dashboard</span>
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>/</span>
            <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 500 }}>
              AI Safety Monitor
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
            Security Operations Center
          </h1>
          {!isMobile && (
            <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 3 }}>
              Real-time monitoring and human review of all autonomous AI agent activity.
            </p>
          )}
        </div>

        {/* Metrics row */}
        <div style={{ marginTop: 12 }}>
          <MetricsRow theme={theme} isDark={isDark} isMobile={isMobile} />
        </div>

        {/* Main split layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '60% 40%',
            gap: 16,
            marginTop: 16,
            alignItems: 'start',
          }}
        >
          {/* Left: Live Action Feed */}
          <ActionFeed
            theme={theme}
            isDark={isDark}
            actions={actions}
            selectedId={syncedSelected?.id ?? null}
            isMobile={isMobile}
            onSelectAction={(action) => {
              if (
                action.riskStatus === 'HIGH_RISK_PENDING' ||
                action.riskStatus === 'MEDIUM_RISK_PENDING'
              ) {
                setSelectedAction(action);
              }
            }}
          />

          {/* Review Panel — inline on mobile, sticky on desktop */}
          <div style={isMobile ? {} : { position: 'sticky', top: 72 }}>
            <ReviewPanel
              theme={theme}
              isDark={isDark}
              action={syncedSelected}
              isMobile={isMobile}
              onApprove={handleApprove}
              onEscalate={handleEscalate}
              onBlock={handleBlock}
            />
          </div>
        </div>

        {/* Footer */}
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
          <span style={{ color: theme.textTertiary, fontSize: 12 }}>
            Sentinel v2.4.1 · Enterprise AI Safety Monitor
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: theme.textTertiary, fontSize: 12 }}>
              Last sync: {syncLabel}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background:
                    wsStatus === 'connected'
                      ? '#30A46C'
                      : wsStatus === 'connecting'
                        ? '#F5A623'
                        : '#E5484D',
                  transition: 'background 0.3s',
                }}
              />
              <span
                style={{
                  color:
                    wsStatus === 'connected'
                      ? '#30A46C'
                      : wsStatus === 'connecting'
                        ? '#F5A623'
                        : '#E5484D',
                  fontSize: 12,
                  transition: 'color 0.3s',
                }}
              >
                {wsStatus === 'connected'
                  ? 'Live · connected'
                  : wsStatus === 'connecting'
                    ? 'Reconnecting…'
                    : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}