import { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { TopNav } from './components/nav/TopNav';
import { MetricsRow } from './components/metrics/MetricsRow';
import { ActionFeed } from './components/feed/ActionFeed';
import { ReviewPanel } from './components/review/ReviewPanel';
import { ActionItem } from './types';
import { mockActions } from './data/mockData';
import { getTheme } from './utils/theme';
import { useIsMobile } from './utils/useIsMobile';

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [actions, setActions] = useState<ActionItem[]>(mockActions);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(
    mockActions.find((a) => a.riskStatus === 'HIGH_RISK_PENDING') ?? null
  );

  const theme = getTheme(isDark);
  const isMobile = useIsMobile();

  /** Live "last sync" timer for footer truthfulness */
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

  // Reset sync clock when actions change
  useEffect(() => {
    setLastSync(new Date());
    setSyncLabel('just now');
  }, [actions]);

  const handleApprove = (id: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, riskStatus: 'APPROVED' } : a))
    );
    toast.success('Action approved successfully', {
      description: `Agent action has been permitted to proceed.`,
      duration: 3500,
    });
    // Select next pending
    const next = actions.find(
      (a) => a.id !== id && (a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING')
    );
    setSelectedAction(next ?? null);
  };

  const handleEscalate = (id: string) => {
    toast.warning('Action escalated to senior review', {
      description: `Flagged for senior security team review.`,
      duration: 3500,
    });
    const next = actions.find(
      (a) => a.id !== id && (a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING')
    );
    setSelectedAction(next ?? null);
  };

  const handleBlock = (id: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, riskStatus: 'HIGH_RISK_BLOCKED' } : a))
    );
    toast.error('Action blocked', {
      description: `Agent action has been permanently blocked.`,
      duration: 3500,
    });
    const next = actions.find(
      (a) => a.id !== id && (a.riskStatus === 'HIGH_RISK_PENDING' || a.riskStatus === 'MEDIUM_RISK_PENDING')
    );
    setSelectedAction(next ?? null);
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