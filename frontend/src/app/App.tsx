import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router';
import { Toaster, toast } from 'sonner';
import { Eye, Building2, ArrowLeft } from 'lucide-react';
import { TopNav } from './components/nav/TopNav';
import type { NotificationItem as TopNavNotificationItem } from './components/nav/TopNav';
import type { PageId } from './components/nav/TopNav';
import { MetricsRow } from './components/metrics/MetricsRow';
import { ActionFeed } from './components/feed/ActionFeed';
import { ReviewPanel } from './components/review/ReviewPanel';
import { UploadPanel } from './components/upload/UploadPanel';
import { OrganisationPage } from './components/organisation/OrganisationPage';
import { AuditTrail } from './components/audit/AuditTrail';
import { ActionItem } from './types';
import { mockActions } from './data/mockData';
import { teamsData } from './data/organisationData';
import { getTheme } from './utils/theme';
import { useIsMobile } from './utils/useIsMobile';
import { useWebSocket, WSMessage } from './hooks/useWebSocket';
import {
  fetchActions,
  approveAction as apiApprove,
  blockAction as apiBlock,
  escalateAction as apiEscalate,
  fetchNotifications as apiFetchNotifications,
  markNotificationRead as apiMarkNotificationRead,
  markAllNotificationsRead as apiMarkAllNotificationsRead,
} from './services/api';

function readStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem('sentinel-theme');
    if (stored === 'light') return false;
    if (stored === 'dark') return true;
  } catch { /* ignore */ }
  return true;
}

export default function App() {
  const [isDark, setIsDark] = useState(readStoredTheme);
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ processed: number; total: number } | null>(null);
  const [notifications, setNotifications] = useState<TopNavNotificationItem[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const theme = getTheme(isDark);
  const isMobile = useIsMobile();

  /** Live "last sync" timer */
  const [lastSync, setLastSync] = useState(() => new Date());
  const [syncLabel, setSyncLabel] = useState('just now');
  const lastSyncRef = useRef(lastSync);
  lastSyncRef.current = lastSync;

  useEffect(() => {
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastSyncRef.current.getTime()) / 1000);
      if (elapsed < 5) setSyncLabel('just now');
      else if (elapsed < 60) setSyncLabel(`${elapsed}s ago`);
      else setSyncLabel(`${Math.floor(elapsed / 60)}m ago`);
    }, 3000);
    return () => clearInterval(tick);
  }, []);

  // Reset sync clock on data changes
  useEffect(() => {
    setLastSync(new Date());
    setSyncLabel('just now');
  }, [actions]);

  // Notifications polling from backend (Phase 2)
  const refreshNotifications = useCallback(async () => {
    if (!backendConnected) return;
    try {
      const data = await apiFetchNotifications(50);
      const mapped: TopNavNotificationItem[] = (data.notifications || []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        detail: n.detail,
        actionId: n.actionId ?? null,
        createdAt: n.createdAt,
        level: n.severity || 'info',
        unread: !!n.unread,
      }));
      setNotifications(mapped);
      setNotificationUnreadCount(Number(data.unreadCount || 0));
    } catch {
      // Keep current UI state if notification API is unavailable.
    }
  }, [backendConnected]);

  useEffect(() => {
    refreshNotifications();
    const timer = setInterval(() => {
      refreshNotifications();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshNotifications]);

  const handleMarkNotificationRead = useCallback(async (id: string) => {
    try {
      const data = await apiMarkNotificationRead(id);
      const mapped: TopNavNotificationItem[] = (data.notifications || []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        detail: n.detail,
        actionId: n.actionId ?? null,
        createdAt: n.createdAt,
        level: n.severity || 'info',
        unread: !!n.unread,
      }));
      setNotifications(mapped);
      setNotificationUnreadCount(Number(data.unreadCount || 0));
    } catch {
      // No-op for now.
    }
  }, []);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    try {
      const data = await apiMarkAllNotificationsRead();
      const mapped: TopNavNotificationItem[] = (data.notifications || []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        detail: n.detail,
        actionId: n.actionId ?? null,
        createdAt: n.createdAt,
        level: n.severity || 'info',
        unread: !!n.unread,
      }));
      setNotifications(mapped);
      setNotificationUnreadCount(Number(data.unreadCount || 0));
    } catch {
      // No-op for now.
    }
  }, []);

  const handleOpenAction = useCallback(async (actionId: string) => {
    let target = actions.find((a) => a.id === actionId);

    if (!target && backendConnected) {
      try {
        const data = await fetchActions(200);
        const refreshed = (data.actions || []) as unknown as ActionItem[];
        setActions(refreshed);
        target = refreshed.find((a) => a.id === actionId);
      } catch {
        // Keep local state if refresh fails.
      }
    }

    if (!target) {
      toast.warning('Action not found', {
        description: `Could not locate action ${actionId} in the current feed.`,
      });
      return;
    }

    const isPending =
      target.riskStatus === 'HIGH_RISK_PENDING' ||
      target.riskStatus === 'MEDIUM_RISK_PENDING';
    if (!isPending) {
      toast.message('Action no longer pending review', {
        description: `${target.agentName}: ${target.proposedAction.slice(0, 80)}`,
      });
    }

    setSelectedAction(target);
  }, [actions, backendConnected]);

  // ── Initial data load from backend ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchActions(100);
        if (!cancelled && data.actions?.length > 0) {
          setActions(data.actions as unknown as ActionItem[]);
          setBackendConnected(true);
          // Auto-select first pending
          const pending = (data.actions as unknown as ActionItem[]).find(
            (a) => a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING'
          );
          if (pending) setSelectedAction(pending);
        } else if (!cancelled && data.actions?.length === 0) {
          // Backend is up but no actions yet — use empty state
          setBackendConnected(true);
          setActions([]);
        }
      } catch {
        // Backend unreachable — fall back to mock data
        if (!cancelled) {
          setBackendConnected(false);
          setActions(mockActions);
          setSelectedAction(
            mockActions.find((a) => a.riskStatus === 'HIGH_RISK_PENDING') ?? null
          );
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── WebSocket for real-time updates ────────────────────────────────────────
  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'init' && Array.isArray(msg.actions) && msg.actions.length > 0) {
      setActions(msg.actions as unknown as ActionItem[]);
    }

    if (msg.type === 'new_action') {
      const newAction = msg.action as unknown as ActionItem;
      setActions((prev) => {
        // Avoid duplicates
        if (prev.some((a) => a.id === newAction.id)) return prev;
        return [newAction, ...prev];
      });
      // Auto-select if it's pending and nothing is selected
      if (
        newAction.riskStatus === 'HIGH_RISK_PENDING' ||
        newAction.riskStatus === 'MEDIUM_RISK_PENDING'
      ) {
        setSelectedAction((current) => current ?? newAction);
      }
      // Toast for high risk
      if (newAction.riskStatus === 'HIGH_RISK_PENDING') {
        toast.error('High-risk action detected', {
          description: `${newAction.agentName}: ${newAction.proposedAction.slice(0, 60)}...`,
          duration: 4000,
        });
      }
    }

    if (msg.type === 'action_updated') {
      const updated = msg.action as unknown as ActionItem;
      setActions((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
    }

    if (msg.type === 'upload_progress') {
      setUploadProgress({ processed: msg.processed, total: msg.total });
    }

    if (msg.type === 'upload_complete') {
      setUploadProgress(null);
      toast.success(`Upload complete: ${msg.total} actions processed`);
    }
  }, []);

  const { connected } = useWebSocket({
    onMessage: handleWSMessage,
    onConnectionChange: setWsConnected,
  });

  // ── Action handlers ────────────────────────────────────────────────────────
  const selectNextPending = (excludeId: string) => {
    const next = actions.find(
      (a) => a.id !== excludeId && (a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING')
    );
    setSelectedAction(next ?? null);
  };

  const handleApprove = async (id: string) => {
    if (!backendConnected) {
      toast.error('Backend offline', {
        description: 'Approval requires backend connection.',
      });
      return;
    }

    try {
      const resp = await apiApprove(id);
      setActions((prev) =>
        prev.map((a) => (a.id === id ? (resp.action as unknown as ActionItem) : a))
      );
      toast.success('Action approved successfully', {
        description: 'Agent action has been permitted to proceed.',
        duration: 3500,
      });
      selectNextPending(id);
    } catch (e) {
      console.error('Approve API error:', e);
      toast.error('Approve failed', {
        description: 'Backend did not accept the action update.',
      });
    }
  };

  const handleEscalate = async (id: string) => {
    if (!backendConnected) {
      toast.error('Backend offline', {
        description: 'Escalation requires backend connection.',
      });
      return;
    }

    try {
      const resp = await apiEscalate(id);
      setActions((prev) =>
        prev.map((a) => (a.id === id ? (resp.action as unknown as ActionItem) : a))
      );
      toast.warning('Action escalated to senior review', {
        description: 'Flagged for senior security team review.',
        duration: 3500,
      });
      selectNextPending(id);
    } catch (e) {
      console.error('Escalate API error:', e);
      toast.error('Escalate failed', {
        description: 'Backend did not accept the action update.',
      });
    }
  };

  const handleBlock = async (id: string) => {
    if (!backendConnected) {
      toast.error('Backend offline', {
        description: 'Block requires backend connection.',
      });
      return;
    }

    try {
      const resp = await apiBlock(id);
      setActions((prev) =>
        prev.map((a) => (a.id === id ? (resp.action as unknown as ActionItem) : a))
      );
      toast.error('Action blocked', {
        description: 'Agent action has been permanently blocked.',
        duration: 3500,
      });
      selectNextPending(id);
    } catch (e) {
      console.error('Block API error:', e);
      toast.error('Block failed', {
        description: 'Backend did not accept the action update.',
      });
    }
  };

  // Keep selectedAction synced with latest data
  const syncedSelected = selectedAction
    ? actions.find((a) => a.id === selectedAction.id) ?? null
    : null;

  const systemStatus = wsConnected ? 'connected' : backendConnected ? 'polling' : 'offline';

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
          style: { fontFamily: 'Inter, sans-serif', fontSize: 13 },
        }}
      />

      {/* Navigation */}
      <TopNav
        isDark={isDark}
        theme={theme}
        onToggleTheme={() => setIsDark((d) => {
          const next = !d;
          try { localStorage.setItem('sentinel-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
          return next;
        })}
        isMobile={isMobile}
        notifications={notifications}
        unreadCount={notificationUnreadCount}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onMarkRead={handleMarkNotificationRead}
        onOpenAction={handleOpenAction}
        activePage={activePage}
        onPageChange={setActivePage}
      />

      {/* Mobile page tabs */}
      {isMobile && (
        <div
          style={{
            display: 'flex',
            background: theme.surface,
            borderBottom: `1px solid ${theme.border}`,
            position: 'sticky',
            top: 48,
            zIndex: 49,
          }}
        >
          {([
            { id: 'dashboard' as PageId, label: 'Security Monitor', icon: <Eye size={14} /> },
            { id: 'organisation' as PageId, label: 'Organisation', icon: <Building2 size={14} /> },
          ]).map((tab) => {
            const isActive = activePage === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActivePage(tab.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 0',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #30A46C' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: 'Inter, sans-serif',
                  color: isActive ? theme.textPrimary : theme.textTertiary,
                  background: 'transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Page content */}
      <div
        style={{
          maxWidth: 1600,
          margin: '0 auto',
          padding: isMobile ? '0 12px 32px' : '0 24px 40px',
        }}
      >
        {activePage === 'audit-trail' && selectedTeamId ? (
          <>
            {/* Back button + breadcrumb */}
            <div style={{ padding: isMobile ? '14px 0 4px' : '20px 0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    setActivePage('organisation');
                    setSelectedTeamId(null);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'transparent',
                    border: 'none',
                    color: '#30A46C',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <ArrowLeft size={14} />
                  Organisation
                </button>
                <span style={{ color: theme.textTertiary, fontSize: 12 }}>/</span>
                <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 500 }}>
                  {selectedTeamName} · Audit Trail
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
                {selectedTeamName} — Audit Trail
              </h1>
            </div>
            <AuditTrail
              theme={theme}
              isDark={isDark}
              isMobile={isMobile}
              actions={actions.filter((a) => {
                const actionUser = (a.user || '').toLowerCase().trim();
                if (!actionUser) return true; // no user field → show everywhere

                // Check if this user belongs to the selected team
                const selectedTeam = teamsData.find((t) => t.id === selectedTeamId);
                const isInSelectedTeam = selectedTeam?.members.some(
                  (m) => m.name.toLowerCase() === actionUser
                );
                if (isInSelectedTeam) return true;

                // Check if this user belongs to ANY team
                const isInAnyTeam = teamsData.some((t) =>
                  t.members.some((m) => m.name.toLowerCase() === actionUser)
                );
                // If not in any team (system/third-party), show under all teams
                return !isInAnyTeam;
              })}
            />
          </>
        ) : activePage === 'all-audits' ? (
          <>
            {/* Back button + breadcrumb */}
            <div style={{ padding: isMobile ? '14px 0 4px' : '20px 0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setActivePage('organisation')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'transparent',
                    border: 'none',
                    color: '#30A46C',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <ArrowLeft size={14} />
                  Organisation
                </button>
                <span style={{ color: theme.textTertiary, fontSize: 12 }}>/</span>
                <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 500 }}>
                  All Audits
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
                All Teams — Audit Trail
              </h1>
              <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 3 }}>
                Consolidated audit trail across all teams and agents.
              </p>
            </div>
            <AuditTrail
              theme={theme}
              isDark={isDark}
              isMobile={isMobile}
              actions={actions}
            />
          </>
        ) : activePage === 'organisation' ? (
          <OrganisationPage
            theme={theme}
            isDark={isDark}
            isMobile={isMobile}
            onViewTeamAudit={(teamId, teamName) => {
              setSelectedTeamId(teamId);
              setSelectedTeamName(teamName);
              setActivePage('audit-trail');
            }}
            onViewAllAudits={() => setActivePage('all-audits')}
          />
        ) : (
          <>
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
          <div style={{ marginTop: 10 }}>
            <Link
              to="/agent-terminal"
              style={{
                display: 'inline-block',
                textDecoration: 'none',
                border: `1px solid ${theme.border}`,
                borderRadius: 7,
                padding: '7px 10px',
                background: theme.surface,
                color: theme.textSecondary,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Open Agent Terminal
            </Link>
          </div>
        </div>

        {/* Upload Panel */}
        <UploadPanel
          theme={theme}
          isDark={isDark}
          isMobile={isMobile}
          uploadProgress={uploadProgress}
        />

        {/* Metrics row */}
        <div style={{ marginTop: 12 }}>
          <MetricsRow theme={theme} isDark={isDark} isMobile={isMobile} actions={actions} />
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
                  background: systemStatus === 'connected' ? '#30A46C' : systemStatus === 'polling' ? '#F5A623' : '#E5484D',
                }}
              />
              <span
                style={{
                  color: systemStatus === 'connected' ? '#30A46C' : systemStatus === 'polling' ? '#F5A623' : '#E5484D',
                  fontSize: 12,
                }}
              >
                {systemStatus === 'connected'
                  ? 'Live · WebSocket connected'
                  : systemStatus === 'polling'
                    ? 'Polling mode'
                    : 'Offline · Using mock data'}
              </span>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
