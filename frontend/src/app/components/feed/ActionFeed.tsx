import { useState, useEffect } from 'react';
import { ChevronRight, AlertOctagon, AlertTriangle, CheckCircle2, Clock, ShieldOff, Database, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ActionItem, RiskStatus, Environment, Theme, PanelState } from '../../types';
import { COLORS } from '../../utils/theme';

interface ActionFeedProps {
  theme: Theme;
  isDark: boolean;
  actions: ActionItem[];
  selectedId: string | null;
  onSelectAction: (action: ActionItem) => void;
  isMobile: boolean;
}

const STATUS_CONFIG: Record<
  RiskStatus,
  { label: string; color: string; bg: string; icon: ReactNode; dotColor: string }
> = {
  HIGH_RISK_PENDING: {
    label: 'HIGH RISK · PENDING',
    color: COLORS.red,
    bg: COLORS.redMuted,
    icon: <AlertOctagon size={11} />,
    dotColor: COLORS.red,
  },
  HIGH_RISK_BLOCKED: {
    label: 'BLOCKED',
    color: COLORS.red,
    bg: COLORS.redMuted,
    icon: <ShieldOff size={11} />,
    dotColor: COLORS.red,
  },
  MEDIUM_RISK_PENDING: {
    label: 'MEDIUM · PENDING',
    color: COLORS.amber,
    bg: COLORS.amberMuted,
    icon: <AlertTriangle size={11} />,
    dotColor: COLORS.amber,
  },
  LOW_RISK: {
    label: 'LOW RISK',
    color: COLORS.green,
    bg: COLORS.greenMuted,
    icon: <CheckCircle2 size={11} />,
    dotColor: COLORS.green,
  },
  APPROVED: {
    label: 'APPROVED',
    color: COLORS.green,
    bg: COLORS.greenMuted,
    icon: <CheckCircle2 size={11} />,
    dotColor: COLORS.green,
  },
  ESCALATED: {
    label: 'ESCALATED',
    color: COLORS.amber,
    bg: COLORS.amberMuted,
    icon: <AlertTriangle size={11} />,
    dotColor: COLORS.amber,
  },
};

function StatusBadge({ status }: { status: RiskStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.color,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.icon}
      {cfg.label}
    </div>
  );
}

function EnvBadge({ env, isDark }: { env: Environment; isDark: boolean }) {
  const isProd = env === 'PROD';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: 4,
        background: isProd
          ? 'rgba(229, 72, 77, 0.08)'
          : isDark
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(0,0,0,0.05)',
        color: isProd ? '#E5484D' : isDark ? '#8A8A8A' : '#5A5A5A',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        fontFamily: 'Inter, sans-serif',
        border: isProd ? '1px solid rgba(229,72,77,0.2)' : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      }}
    >
      {env}
    </div>
  );
}

export function ActionFeed({ theme, isDark, actions, selectedId, onSelectAction, isMobile }: ActionFeedProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panelState, setPanelState] = useState<PanelState>('live');
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  // Simulate stale detection: if no new data in 30s, show stale
  useEffect(() => {
    setLastRefresh(new Date());
    setPanelState('live');
  }, [actions]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastRefresh.getTime();
      if (elapsed > 30000 && panelState === 'live') {
        setPanelState('stale');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastRefresh, panelState]);

  const isClickable = (status: RiskStatus) =>
    status === 'HIGH_RISK_PENDING' || status === 'MEDIUM_RISK_PENDING';

  /** Reason text shown for non-clickable rows */
  const getDisabledReason = (status: RiskStatus): string | null => {
    if (status === 'APPROVED') return 'Already approved — no action needed';
    if (status === 'HIGH_RISK_BLOCKED') return 'Blocked — auto-policy enforced';
    if (status === 'LOW_RISK') return 'Low risk — auto-approved by policy';
    return null;
  };

  const formatRefreshTime = () => {
    const secs = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  };

  const panelIndicator = panelState === 'stale'
    ? { color: COLORS.amber, label: 'Stale', icon: <WifiOff size={10} /> }
    : panelState === 'error'
    ? { color: COLORS.red, label: 'Error', icon: <WifiOff size={10} /> }
    : { color: COLORS.green, label: 'Live', icon: <Wifi size={10} /> };

  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: isMobile ? '12px 14px' : '16px 20px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: theme.tableHeaderBg,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: panelIndicator.color,
              animation: panelState === 'live' ? 'ping-dot 2s ease-in-out infinite' : 'none',
              boxShadow: panelState === 'live' ? `0 0 6px ${COLORS.green}` : 'none',
            }}
          />
          <span style={{ color: theme.textPrimary, fontSize: 13, fontWeight: 600 }}>
            Live AI Action Feed
          </span>
          {/* Panel state badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 6px',
              borderRadius: 4,
              background: panelState === 'stale' ? COLORS.amberMuted : panelState === 'error' ? COLORS.redMuted : COLORS.greenMuted,
              color: panelIndicator.color,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase' as const,
            }}
          >
            {panelIndicator.icon}
            {panelIndicator.label}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, flexWrap: 'wrap' }}>
          <span style={{ color: theme.textSecondary, fontSize: 11 }}>
            {actions.length} events
          </span>
          {/* Source attribution */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 4,
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              color: theme.textTertiary,
              fontSize: 10,
            }}
            title="Data source for this feed"
          >
            <Database size={10} />
            <span>sentinel-ml-v3.2</span>
          </div>
          {/* Timestamp */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 4,
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              color: panelState === 'stale' ? COLORS.amber : theme.textTertiary,
              fontSize: 10,
            }}
            title={`Last data received: ${lastRefresh.toLocaleTimeString()}`}
          >
            <Clock size={10} />
            <span>{formatRefreshTime()}</span>
          </div>
        </div>
      </div>

      {/* Desktop: Column headers */}
      {!isMobile && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 140px 1fr 80px 160px 20px',
            gap: '0 8px',
            padding: '8px 20px',
            borderBottom: `1px solid ${theme.border}`,
            background: theme.tableHeaderBg,
          }}
        >
          {['TIME', 'AGENT', 'PROPOSED ACTION', 'ENV', 'STATUS', ''].map((col) => (
            <div
              key={col}
              style={{
                color: theme.textTertiary,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {col}
            </div>
          ))}
        </div>
      )}

      {/* Rows */}
      <div style={{ overflowY: 'auto', maxHeight: isMobile ? 420 : 520 }}>
        {actions.map((action) => {
          const isSelected = action.id === selectedId;
          const isHovered = action.id === hoveredId;
          const isPending = isClickable(action.riskStatus);
          const isHighRiskPending = action.riskStatus === 'HIGH_RISK_PENDING';

          let rowBg = 'transparent';
          if (isSelected) {
            rowBg = isDark ? 'rgba(229, 72, 77, 0.06)' : 'rgba(229, 72, 77, 0.04)';
          } else if (isHovered && isPending) {
            rowBg = theme.rowHover;
          }

          if (isMobile) {
            /* ── Mobile card layout ── */
            const disabledReason = getDisabledReason(action.riskStatus);
            return (
              <div
                key={action.id}
                onClick={() => isPending && onSelectAction(action)}
                onMouseEnter={() => setHoveredId(action.id)}
                onMouseLeave={() => setHoveredId(null)}
                title={disabledReason ?? undefined}
                aria-label={isPending ? `Review ${action.agentName} action` : disabledReason ?? undefined}
                style={{
                  padding: '14px',
                  borderBottom: `1px solid ${theme.border}`,
                  cursor: isPending ? 'pointer' : 'default',
                  background: rowBg,
                  transition: 'background 0.1s',
                  borderLeft: isSelected
                    ? `3px solid ${COLORS.red}`
                    : isHighRiskPending && !isSelected
                    ? `3px solid rgba(229,72,77,0.35)`
                    : '3px solid transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                  minHeight: 44, /* minimum touch target */
                }}
              >
                {/* Top row: agent + badges */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span
                    style={{
                      color: theme.textSecondary,
                      fontSize: 12,
                      fontFamily: 'JetBrains Mono, monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flexShrink: 1,
                      minWidth: 0,
                    }}
                  >
                    {action.agentName}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <EnvBadge env={action.environment} isDark={isDark} />
                    {isPending && <ChevronRight size={13} color={theme.textTertiary} />}
                  </div>
                </div>

                {/* Proposed action */}
                <div
                  style={{
                    color: isHighRiskPending ? '#FF8589' : theme.textPrimary,
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    opacity: action.riskStatus === 'APPROVED' || action.riskStatus === 'LOW_RISK' ? 0.7 : 1,
                  }}
                  title={action.proposedAction}
                >
                  {action.proposedAction}
                </div>

                {/* Bottom row: status + time */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StatusBadge status={action.riskStatus} />
                  <span
                    style={{
                      color: theme.textTertiary,
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {action.timestamp}
                  </span>
                </div>
                {/* Disabled reason for non-pending items */}
                {disabledReason && (
                  <span style={{ color: theme.textTertiary, fontSize: 10, fontStyle: 'italic' }}>
                    {disabledReason}
                  </span>
                )}
              </div>
            );
          }

          /* ── Desktop table row ── */
          const disabledReason = getDisabledReason(action.riskStatus);
          return (
            <div
              key={action.id}
              onClick={() => isPending && onSelectAction(action)}
              onMouseEnter={() => setHoveredId(action.id)}
              onMouseLeave={() => setHoveredId(null)}
              title={disabledReason ?? undefined}
              aria-label={isPending ? `Review ${action.agentName} action` : disabledReason ?? undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 140px 1fr 80px 160px 20px',
                gap: '0 8px',
                padding: '11px 20px',
                borderBottom: `1px solid ${theme.border}`,
                cursor: isPending ? 'pointer' : 'default',
                background: rowBg,
                transition: 'background 0.1s',
                borderLeft: isSelected
                  ? `2px solid ${COLORS.red}`
                  : isHighRiskPending && !isSelected
                  ? `2px solid rgba(229,72,77,0.35)`
                  : '2px solid transparent',
                alignItems: 'center',
              }}
            >
              {/* Timestamp */}
              <div
                style={{
                  color: theme.textTertiary,
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {action.timestamp}
              </div>

              {/* Agent Name */}
              <div
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={action.agentName}
              >
                {action.agentName}
              </div>

              {/* Proposed Action */}
              <div
                style={{
                  color: isHighRiskPending ? '#FF8589' : theme.textPrimary,
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  opacity: action.riskStatus === 'APPROVED' || action.riskStatus === 'LOW_RISK' ? 0.7 : 1,
                }}
                title={action.proposedAction}
              >
                {action.proposedAction}
              </div>

              {/* Environment */}
              <div>
                <EnvBadge env={action.environment} isDark={isDark} />
              </div>

              {/* Status */}
              <div>
                <StatusBadge status={action.riskStatus} />
              </div>

              {/* Chevron (only for pending — removed for resolved to eliminate dead control) */}
              <div style={{ color: theme.textTertiary }}>
                {isPending ? <ChevronRight size={14} /> : null}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes ping-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
